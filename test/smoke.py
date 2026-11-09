# Teste de fumaça no Chrome: sobe o app com o banco em memória (mock-data.js) e passa pelos fluxos principais.
import http.server, threading, functools, sys, re, os, datetime, zoneinfo
from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Q, directory=RAIZ))
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{srv.server_address[1]}/'
MOCK = open(os.path.join(RAIZ, 'test', 'mock-data.js'), encoding='utf-8').read()
hoje = datetime.datetime.now(zoneinfo.ZoneInfo('America/Sao_Paulo')).date()
dmy = lambda d: d.strftime('%d/%m/%Y')

falhas = []
def ok(cond, msg):
    print(('  ok  ' if cond else ' FALHA ') + msg)
    if not cond: falhas.append(msg)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 390, 'height': 800}, service_workers='block')
    pg = ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    pg.on('console', lambda m: erros.append(m.text) if m.type == 'error' and 'ERR_FAILED' not in m.text else None)   # ERR_FAILED = fontes bloqueadas de propósito
    versao_nova = {'v': None}
    def rota_config(r):   # simula o servidor publicando uma versão nova depois de aberto
        corpo = open(os.path.join(RAIZ, 'config.js'), encoding='utf-8').read()
        if versao_nova['v']: corpo = re.sub(r"VERSAO = '[^']+'", f"VERSAO = '{versao_nova['v']}'", corpo)
        r.fulfill(body=corpo, content_type='text/javascript')
    pg.route(re.compile(r'.*/config\.js(\?.*)?$'), rota_config)
    pg.route('**/data.js', lambda r: r.fulfill(body=MOCK, content_type='text/javascript'))
    pg.route(re.compile(r'https://(fonts\.googleapis|fonts\.gstatic|www\.gstatic)\.com/.*'), lambda r: r.abort())
    pg.goto(URL)

    print('Login')
    pg.wait_for_selector('#fLogin')
    pg.fill('#em', 'a@b.com'); pg.fill('#pw', 'errada'); pg.click('#lgBtn')
    pg.wait_for_function("document.querySelector('#lgMsg').textContent.length>0")
    ok('incorretos' in pg.inner_text('#lgMsg'), 'senha errada mostra erro')
    pg.fill('#pw', 'ok123'); pg.click('#lgBtn')
    pg.wait_for_selector('.loja')

    print('Lista')
    pg.wait_for_function("!document.body.innerText.includes('carregando')")
    txt = pg.inner_text('#root')
    ok('Alfa Cell' in txt and 'Smart Um' in txt, 'mostra lojas Cell e Smart')
    tiles = pg.eval_on_selector_all('.tile .n', 'els=>els.map(e=>e.textContent)')
    ok(tiles == ['2', '1', '2'], f'contagens em dia/vencendo/bloqueadas = {tiles} (esperado 2,1,2)')
    ok('1 sem resposta' in txt, 'loja sem resposta aparece avisada')
    nomes = pg.eval_on_selector_all('.loja .nome', 'els=>els.map(e=>e.textContent)')
    ok(nomes.index('Gama Cell') < nomes.index('Beta Cell') < nomes.index('Alfa Cell'), f'ordem: bloqueadas, vencendo, em dia: {nomes}')
    ok('Bloqueou sozinha' in txt and 'Bloqueio manual' in txt, 'chips de bloqueio manual e automático')
    pg.click('.tile.bad'); n = pg.locator('.loja').count()
    ok(n == 2, f'filtro bloqueadas mostra {n} (esperado 2: gama e velha)')
    pg.click('.tile.bad')

    print('Renovar')
    pg.click('text=Alfa Cell'); pg.wait_for_selector('.hero')
    ok('20' in pg.inner_text('.hero .grande'), 'detalhe mostra 20 dias')
    pg.click('[data-a=sheet-renovar]'); pg.wait_for_selector('#prev')
    esperado = dmy(hoje + datetime.timedelta(days=50))
    ok(esperado in pg.inner_text('#prev'), f'prévia = vencimento+30 = {esperado}')
    pg.check('input[value=hoje]')
    ok(dmy(hoje + datetime.timedelta(days=30)) in pg.inner_text('#prev'), 'prévia muda para hoje+30')
    pg.check('input[value=data]'); pg.fill('#dataBase', '2027-01-10')
    ok('09/02/2027' in pg.inner_text('#prev'), 'prévia de outra data: 10/01/2027 + 30 = 09/02/2027')
    pg.fill('#valor', 'abc'); ok(pg.is_disabled('[data-a=ok-renovar]'), 'valor inválido trava o botão')
    pg.fill('#valor', '150,50'); ok(not pg.is_disabled('[data-a=ok-renovar]'), 'valor válido destrava')
    pg.check('input[value=vencimento]')
    pg.dblclick('[data-a=ok-renovar]')
    pg.wait_for_function("!document.querySelector('.sheet')")
    ok(pg.evaluate('window.__chamadas.renovar') == 1, 'clique duplo gravou UMA vez')
    ok(esperado in pg.inner_text('.hero'), 'tela mostra novo vencimento')
    pg.wait_for_function("document.querySelector('.hist')&&document.querySelector('.hist').innerText.includes('Renovou')")
    ok('R$' in pg.inner_text('.bloco'), 'histórico registra o valor')

    print('Conflito (outro aparelho mudou a data)')
    pg.click('[data-a=sheet-renovar]'); pg.wait_for_selector('#prev')
    pg.evaluate("window.__db.lic.alfa.vencimento='2030-01-01'")
    pg.click('[data-a=ok-renovar]')
    pg.wait_for_function("document.querySelector('#msg')&&document.querySelector('#msg').textContent.includes('mudou')")
    ok(True, 'conflito detectado e avisado')
    ok(pg.evaluate('window.__db.lic.alfa.vencimento') == '2030-01-01', 'não sobrescreveu a data do outro aparelho')
    pg.click('[data-a=fechar]')

    print('Bloquear / desbloquear')
    pg.click('[data-a=sheet-bloq]'); pg.click('[data-a=ok-bloq]')
    pg.wait_for_function("document.querySelector('.hero.bad')")
    ok(pg.evaluate('window.__db.lic.alfa.bloqueado') is True, 'bloqueou no banco')
    pg.click('[data-a=sheet-bloq]'); pg.click('[data-a=ok-bloq]')
    pg.wait_for_function("!document.querySelector('.hero.bad')")
    ok(pg.evaluate('window.__db.lic.alfa.bloqueado') is False, 'desbloqueou no banco')

    print('Renomear')
    pg.click('[data-a=sheet-nome]'); pg.fill('#novoNome', 'Alfa Novo'); pg.keyboard.press('Enter')
    pg.wait_for_function("document.querySelector('h1').textContent==='Alfa Novo'")
    ok(pg.evaluate('window.__db.registro.alfa.nome') == 'Alfa Novo', 'nome salvo')

    print('Loja vencida e sem resposta')
    pg.goto(URL + '#/loja/velha'); pg.wait_for_selector('.hero')
    h = pg.inner_text('.hero').lower()
    ok('venceu' in h and 'bloqueada desde' in h, f'vencida mostra bloqueio automático: {h[:60]!r}')
    pg.goto(URL + '#/loja/mudo'); pg.wait_for_selector('.erro-caixa')
    ok(pg.is_disabled('[data-a=sheet-renovar]'), 'sem resposta: renovar desabilitado')
    ok('Sem resposta' in pg.inner_text('.erro-caixa') or '8 segundos' in pg.inner_text('.erro-caixa'), 'explica o motivo')

    print('VortexSmart')
    pg.goto(URL + '#/smart/sm1'); pg.wait_for_selector('.hero')
    ok('ana@x.com' in pg.inner_text('#root'), 'detalhe Smart lista usuários')

    print('Nova loja')
    pg.goto(URL + '#/nova'); pg.wait_for_selector('#cfgTxt')
    pg.fill('#nomeLoja', 'Delta Cell')
    pg.fill('#cfgTxt', 'const firebaseConfig = {\n apiKey: "AIzaXXXX",\n databaseURL: "https://delta-default-rtdb.firebaseio.com",\n projectId: "delta"\n};')
    pg.click('[data-a=testar]'); pg.wait_for_selector('#prazo .opcao')
    ok('Conectou' in pg.inner_text('#stTeste'), 'teste de conexão ok')
    pg.fill('#cfgTxt', pg.input_value('#cfgTxt') + ' ')
    ok(pg.locator('#prazo .opcao').count() == 0, 'mexer no texto invalida o teste')
    pg.click('[data-a=testar]'); pg.wait_for_selector('#prazo .opcao')
    pg.check('input[value=teste]'); pg.click('[data-a=cadastrar]')
    pg.wait_for_function("location.hash.startsWith('#/loja/delta')")
    pg.wait_for_selector('.hero')
    ok(dmy(hoje + datetime.timedelta(days=7)) in pg.inner_text('.hero'), 'loja nova com teste de 7 dias')
    pg.goto(URL + '#/nova'); pg.fill('#nomeLoja', 'Dup')
    pg.fill('#cfgTxt', 'apiKey:"a", databaseURL:"https://alfa-default-rtdb.firebaseio.com", projectId:"alfa"')
    pg.click('[data-a=testar]'); pg.wait_for_function("document.querySelector('#stTeste').textContent.length>0")
    ok('já está cadastrada' in pg.inner_text('#stTeste'), 'bloqueia loja duplicada')
    pg.fill('#cfgTxt', 'apiKey:"a", databaseURL:"https://quebrada-default-rtdb.firebaseio.com", projectId:"quebrada"')
    pg.click('[data-a=testar]'); pg.wait_for_function("document.querySelector('#stTeste').textContent.includes('regras')")
    ok(True, 'explica erro de regras do banco da loja')

    print('Arquivar / restaurar')
    pg.goto(URL + '#/loja/beta'); pg.wait_for_selector('.hero')
    pg.click('[data-a=sheet-arquivar]'); pg.click('[data-a=ok-arquivar]')
    pg.wait_for_selector('.tile')
    ok('Beta Cell' not in pg.inner_text('#root'), 'arquivada some da lista')
    pg.click('.barra a:has-text("Ajustes")'); pg.wait_for_selector('[data-a=restaurar]')
    pg.click('[data-a=restaurar]'); pg.click('.barra a:has-text("Lojas")'); pg.wait_for_selector('.tile')
    ok('Beta Cell' in pg.inner_text('#root'), 'restaurada volta para a lista')

    print('Excluir')
    pg.goto(URL + '#/loja/gama'); pg.wait_for_selector('.hero')
    pg.click('[data-a=sheet-excluir]'); pg.wait_for_selector('#senhaExcluir')
    pg.click('[data-a=ok-excluir]')
    ok('Digite sua senha' in pg.inner_text('#msg') and 'gama' in pg.evaluate('Object.keys(window.__db.registro)'), 'senha vazia não exclui')
    pg.fill('#senhaExcluir', 'errada'); pg.click('[data-a=ok-excluir]')
    pg.wait_for_function("document.querySelector('#msg').textContent.includes('incorreta')")
    ok('gama' in pg.evaluate('Object.keys(window.__db.registro)'), 'senha errada não exclui')
    ok(pg.input_value('#senhaExcluir') == '', 'senha errada limpa o campo')
    pg.fill('#senhaExcluir', 'ok123'); pg.dblclick('[data-a=ok-excluir]')
    pg.wait_for_selector('.tile')
    ok('gama' not in pg.evaluate('Object.keys(window.__db.registro)') and pg.evaluate('window.__db.historico.gama') is None, 'senha certa exclui loja e histórico')
    ok('Gama Cell' not in pg.inner_text('#root'), 'sai da lista')
    # arquivada, excluída pelos Ajustes
    pg.goto(URL + '#/loja/velha'); pg.wait_for_selector('.hero')
    pg.click('[data-a=sheet-arquivar]'); pg.click('[data-a=ok-arquivar]'); pg.wait_for_selector('.tile')
    pg.click('.barra a:has-text("Ajustes")'); pg.wait_for_selector('[data-a=sheet-excluir]')
    pg.click('[data-a=sheet-excluir]'); pg.fill('#senhaExcluir', 'ok123'); pg.keyboard.press('Enter')
    pg.wait_for_function("!document.querySelector('[data-a=sheet-excluir]')")
    ok('velha' not in pg.evaluate('Object.keys(window.__db.registro)'), 'arquivada excluída pelos Ajustes (Enter confirma)')

    print('Importar')
    pg.click('.barra a:has-text("Ajustes")'); pg.wait_for_selector('#arq', state='attached')
    import json, tempfile
    arq = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8')
    json.dump({'lojas': [
        {'nome': 'Nova Imp', 'firebaseConfig': {'apiKey': 'k', 'databaseURL': 'https://imp-default-rtdb.firebaseio.com', 'projectId': 'imp'}},
        {'nome': 'Alfa de novo', 'firebaseConfig': {'apiKey': 'k', 'databaseURL': 'https://alfa-default-rtdb.firebaseio.com', 'projectId': 'alfa'}},
        {'nome': 'Quebrada', 'firebaseConfig': {'apiKey': 'k'}}]}, arq); arq.close()
    pg.set_input_files('#arq', arq.name)
    pg.wait_for_function("document.querySelector('#stImp').textContent.includes('cadastrada')")
    t = pg.inner_text('#stImp')
    ok('1 cadastrada' in t and '1 já existia' in t and '1 com erro' in t, f'importação: {t}')

    print('Atualização')
    pg.click('[data-a=atualizar-app]')
    pg.wait_for_function("document.querySelector('#stAtu').textContent.includes('mais recente')")
    ok('1.1.0' in pg.inner_text('#stAtu'), 'sem versão nova: avisa que está atualizado')
    versao_nova['v'] = '9.9.9'
    pg.evaluate('window.__marca = 1')
    with pg.expect_navigation():
        pg.click('[data-a=atualizar-app]')
    ok(pg.evaluate('window.__marca') is None, 'versão nova: recarrega a página')
    pg.wait_for_selector('#fLogin')
    pg.fill('#em', 'a@b.com'); pg.fill('#pw', 'ok123'); pg.click('#lgBtn'); pg.wait_for_selector('#stAtu')   # o endereço #/ajustes continua depois de recarregar
    ok('9.9.9' in pg.inner_text('#root'), 'depois de recarregar mostra a versão nova')

    print('Sair')
    pg.click('[data-a=sair]'); pg.wait_for_selector('#fLogin')
    ok(True, 'volta para o login')

    ok(not erros, f'sem erros no console: {erros}')
    b.close()
print('\nFALHAS:', falhas if falhas else 'nenhuma')
sys.exit(1 if falhas else 0)
