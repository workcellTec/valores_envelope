// app.js — telas, estado e rotas. Regras de negócio ficam em lib.js; Firebase fica em data.js.
import * as D from './data.js';
import * as L from './lib.js';
import { VERSAO } from './config.js';

const $ = s => document.querySelector(s);
const root = $('#root'), sheet = $('#sheet'), toastEl = $('#toast');
const esc = L.esc;

const S = {
  user: undefined,        // undefined = ainda verificando login | null = deslogado
  sessao: 0,              // sobe a cada login/logout: respostas atrasadas de outra sessão são descartadas
  registro: null, erroRegistro: null,
  lic: {},                // id → { carregando } | { erro } | { cfg }
  hist: {},               // id → { carregando } | { erro } | { itens }
  smart: { estado: 'idle', lojas: [], erro: null },
  filtro: 'todas',
  ocupado: false,
};
let nova = { config: null, texto: '' };
const hoje = () => L.hojeISO();

// ── Ícones ─────────────────────────────────────────────────────
const P = {
  plus: '<path d="M12 5v14M5 12h14"/>', back: '<path d="M15 6l-6 6 6 6"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 017.5-2"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>', box: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10h14V9M10 13h4"/>',
  bell: '<path d="M6 17v-6a6 6 0 0112 0v6l1.5 2h-15zM10 21h4"/>',
  store: '<path d="M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9h16M9 20v-6h6v6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
  refresh: '<path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7"/>', arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};
const ic = (n, s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;

// ── Utilidades ─────────────────────────────────────────────────
let tToast;
function toast(t) {
  toastEl.textContent = t; toastEl.classList.add('on');
  clearTimeout(tToast); tToast = setTimeout(() => toastEl.classList.remove('on'), 3400);
}
const limpa = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== ''));   // o Realtime Database rejeita undefined
const lojaDe = id => (S.registro && S.registro[id] && typeof S.registro[id] === 'object') ? Object.assign({ id }, S.registro[id]) : null;
const quando = ms => ms ? new Date(ms).toLocaleString('pt-BR', { timeZone: L.FUSO, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

function motivoLeitura(e) {
  const c = D.codigo(e);
  if (c === 'timeout') return 'Sem resposta em 8 segundos (internet ou banco fora do ar).';
  if (/permission[-_ ]denied/i.test(c)) return 'As regras do banco dessa loja não deixam ler config/licenca.';
  if (/network|unavailable/i.test(c)) return 'Sem internet.';
  if (c === 'sem-login') return 'Sem login no VortexSmart. Saia e entre de novo.';
  return `Erro (${c}).`;
}
function textoErro(e) {
  const c = D.codigo(e);
  if (c === 'timeout') return 'Sem resposta. Pode ter gravado: confira a data antes de tentar de novo.';
  if (c === 'conflito' || c === 'ja-existe' || c === 'senha') return e.message;
  if (/permission[-_ ]denied/i.test(c)) return 'Sem permissão: as regras do banco não deixaram gravar.';
  if (/network|unavailable/i.test(c)) return 'Sem internet.';
  return (e && e.message) ? e.message : `Erro (${c}).`;
}

// Impede clique duplo e duas ações ao mesmo tempo
async function rodar(btn, fn) {
  if (S.ocupado) return;
  S.ocupado = true; if (btn) btn.disabled = true;
  try { await fn(); } finally { S.ocupado = false; if (btn && btn.isConnected) btn.disabled = false; }
}

// ── Sheets ─────────────────────────────────────────────────────
function abrir(html, focoCampo) {
  sheet.innerHTML = `<div class="fundo" data-a="fundo"><div class="sheet" role="dialog" aria-modal="true" tabindex="-1"><div class="puxador"></div>${html}</div></div>`;
  const s = sheet.querySelector('.sheet');
  (focoCampo ? s.querySelector(focoCampo) : s).focus({ preventScroll: true });
}
const fecharSheet = () => { sheet.innerHTML = ''; };
const fechar = () => { if (!S.ocupado) fecharSheet(); };
function msg(t, k = 'bad') {
  const m = sheet.querySelector('#msg');
  if (m) { m.className = 'status ' + k; m.textContent = t; } else toast(t);
}

// ── Estado exibido ─────────────────────────────────────────────
const estCell = id => L.estadoDe(S.lic[id] || { carregando: true }, hoje());
const estSmart = s => s.bloqueada
  ? { cat: 'bloqueada', k: 'bad', ord: 0, bloq: true, manual: true, num: '', chip: 'Bloqueada', d: null }
  : { cat: 'ativa', k: 'mud', ord: 4, num: '—', chip: 'Ativa', d: null };

function itens() {
  const out = [];
  Object.entries(S.registro || {}).forEach(([id, l]) => {
    if (!l || typeof l !== 'object' || l.arquivada) return;
    out.push({ id, sistema: 'cell', nome: l.nome || id, est: estCell(id) });
  });
  if (S.smart.estado === 'ok') S.smart.lojas.forEach(s => out.push({ id: s.lojaId, sistema: 'smart', nome: s.nome, est: estSmart(s) }));
  return L.ordenar(out);
}

// ── Carregamento ───────────────────────────────────────────────
async function carregarLic(id, silencioso) {
  const my = S.sessao, loja = lojaDe(id);
  if (!loja) return;
  if (!silencioso) { S.lic[id] = { carregando: true }; atualizar(); }
  try {
    const cfg = await D.lerLicenca(loja);
    if (my !== S.sessao) return;
    S.lic[id] = { cfg };
  } catch (e) {
    if (my !== S.sessao) return;
    S.lic[id] = { erro: D.codigo(e) };
  }
  atualizar();
}

async function carregarSmart() {
  const my = S.sessao;
  if (S.smart.estado !== 'ok') S.smart = { estado: 'carregando', lojas: [], erro: null };   // já carregado: mantém a lista enquanto atualiza
  try {
    const lojas = await D.listarSmart();
    if (my !== S.sessao) return;
    S.smart = { estado: 'ok', lojas, erro: null };
  } catch (e) {
    if (my !== S.sessao) return;
    S.smart = { estado: 'erro', lojas: [], erro: D.codigo(e) };
  }
  atualizar();
}

async function carregarHist(id) {
  const my = S.sessao;
  S.hist[id] = { carregando: true };
  try {
    const it = await D.lerHistorico(id);
    if (my !== S.sessao) return;
    S.hist[id] = { itens: it };
  } catch (e) {
    if (my !== S.sessao) return;
    S.hist[id] = { erro: true };
  }
  const r = rota();
  if (r.t === 'loja' && r.id === id) atualizar();
}

async function iniciar() {
  const my = S.sessao;
  S.registro = null; S.erroRegistro = null; S.lic = {}; S.hist = {}; S.filtro = 'todas';
  render();
  carregarSmart();
  try {
    const reg = await D.carregarRegistro();
    if (my !== S.sessao) return;
    S.registro = reg;
  } catch (e) {
    if (my !== S.sessao) return;
    S.erroRegistro = D.codigo(e); render(); return;
  }
  Object.keys(S.registro).forEach(id => { if (lojaDe(id) && !S.registro[id].arquivada) S.lic[id] = { carregando: true }; });
  render(); entrou();
  Object.keys(S.lic).forEach(id => carregarLic(id, true));
}

// Recarrega tudo sem voltar para a tela de "carregando" (usado ao reabrir o app e no botão de atualizar)
async function recarregarTudo(manual) {
  if (S.registro === null) { if (S.user) { S.erroRegistro = null; iniciar(); } return; }
  const my = S.sessao;
  try {
    const reg = await D.carregarRegistro();
    if (my !== S.sessao) return;
    S.registro = reg;
  } catch (e) { if (manual) toast('Não consegui atualizar a lista.'); }
  Object.keys(S.registro).forEach(id => {
    if (!lojaDe(id) || S.registro[id].arquivada) return;
    if (manual || !S.lic[id]) S.lic[id] = { carregando: true };
    carregarLic(id, true);
  });
  carregarSmart();
  atualizar();
}

// ── Rotas ──────────────────────────────────────────────────────
function rota() {
  const p = location.hash.replace(/^#\/?/, '').split('/');
  let id = ''; try { id = decodeURIComponent(p[1] || ''); } catch (e) { /* id inválido */ }
  switch (p[0]) {
    case 'loja': case 'smart': return { t: p[0], id };
    case 'nova': case 'avisos': case 'ajustes': return { t: p[0] };
    default: return { t: 'lista' };
  }
}
function entrou() {
  const r = rota();
  if (r.t === 'loja' && S.registro && lojaDe(r.id)) carregarHist(r.id);
  if (r.t === 'nova') nova = { config: null, texto: '' };
}
// Re-desenha quando chegam dados novos, sem apagar o que a pessoa está digitando
function atualizar() {
  if (!S.user) return;
  const t = rota().t;
  if (t === 'nova' || t === 'ajustes') return;
  render();
}

// ── Telas ──────────────────────────────────────────────────────
const nav = on => `<nav class="barra" aria-label="Principal">${[['', 'Lojas', 'store'], ['avisos', 'Avisos', 'bell'], ['ajustes', 'Ajustes', 'gear']]
  .map(([h, l, i]) => `<a href="#/${h}" class="${on === h ? 'on' : ''}"${on === h ? ' aria-current="page"' : ''}>${ic(i, 20)}<span>${l}</span></a>`).join('')}</nav>`;

function anel(e) {
  const frac = (e.d != null && !e.bloq) ? Math.max(0, Math.min(1, e.d / L.DIAS_CREDITO)) : 0;
  const traco = (e.bloq ? 1 : frac) * 138.2;
  return `<div class="anel"><svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true"><circle class="trilho" cx="26" cy="26" r="22"/><circle class="prog ${e.k}" cx="26" cy="26" r="22" stroke-dasharray="${traco.toFixed(1)} 138.2"/></svg><div class="miolo ${e.k}">${e.bloq ? ic('lock', 20) : esc(e.num)}</div></div>`;
}
const nomeSistema = s => s === 'cell' ? 'VortexCell' : 'VortexSmart';
function cartao(it) {
  const e = it.est;
  return `<a class="loja" href="#/${it.sistema === 'cell' ? 'loja' : 'smart'}/${encodeURIComponent(it.id)}">${anel(e)}<div class="info"><span class="nome">${esc(it.nome)}</span><div class="meta"><span class="tag">${nomeSistema(it.sistema)}</span><span class="chip ${e.k}">${esc(e.chip)}</span></div></div></a>`;
}

function telaLista() {
  const dia = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: L.FUSO });
  const topo = `<div class="topo"><div><div class="kicker">${esc(dia)}</div><h1>Lojas</h1></div><div class="topo-acoes"><button class="redondo" data-a="recarregar" aria-label="Atualizar">${ic('refresh')}</button><a class="redondo verde" href="#/nova" aria-label="Nova loja">${ic('plus')}</a></div></div>`;
  if (S.erroRegistro) {
    return `<main class="tela">${topo}<div class="erro-caixa"><p>Não consegui abrir a lista de lojas (${esc(motivoLeitura({ code: S.erroRegistro }))})</p><button class="btn verde" data-a="recarregar">Tentar de novo</button></div></main>${nav('')}`;
  }
  if (S.registro === null) return `<main class="tela">${topo}<div class="vazio">Carregando lojas…</div></main>${nav('')}`;
  const todos = itens();
  const c = L.contagens(todos.map(i => i.est));
  const vis = S.filtro === 'todas' ? todos : todos.filter(i => i.est.cat === S.filtro);
  const tile = (cat, n, rot, k) => `<button class="tile ${k}${S.filtro === cat ? ' sel' : ''}" data-a="filtro" data-f="${cat}" aria-pressed="${S.filtro === cat}"><span class="n">${n}</span><span class="l">${rot}</span></button>`;
  let avisos = '';
  if (c.semresposta) avisos += `<div class="aviso-linha"><span>${c.semresposta} sem resposta</span><button data-a="recarregar">Tentar de novo</button></div>`;
  if (S.smart.estado === 'erro') avisos += `<div class="aviso-linha"><span>VortexSmart: ${esc(motivoLeitura({ code: S.smart.erro }))}</span><button data-a="recarregar">Tentar</button></div>`;
  const lista = vis.length ? vis.map(cartao).join('')
    : `<div class="vazio">${todos.length ? 'Nenhuma loja nesse filtro.' : 'Nenhuma loja ainda. Toque no + para cadastrar ou importe em Ajustes.'}</div>`;
  return `<main class="tela">${topo}<div class="tiles">${tile('ativa', c.ativa, 'Em dia', 'ok')}${tile('vencendo', c.vencendo, 'Vencendo', 'warn')}${tile('bloqueada', c.bloqueada, 'Bloqueadas', 'bad')}</div>${avisos}<div class="lista">${lista}</div></main>${nav('')}`;
}

const voltar = `<a class="voltar" href="#/" aria-label="Voltar">${ic('back')}</a>`;
const naoAchou = txt => `<main class="tela sem-barra">${voltar}<div class="vazio">${txt || 'Loja não encontrada.'}</div></main>`;

function heroLoja(e, cfg) {
  const venc = cfg && cfg.vencimento;
  if (e.cat === 'carregando') return `<div class="hero mud"><div class="rot">Carregando</div><div class="grande"><b class="txt">…</b></div></div>`;
  if (e.bloq) {
    const auto = !e.manual;
    return `<div class="hero bad"><div class="rot">${auto ? `Bloqueada desde ${L.dm(L.somaDias(venc, 1))}` : 'Acesso bloqueado'}</div><div class="grande"><b class="txt">${auto ? 'Venceu' : 'Bloqueada'}</b></div><p>${auto
      ? `Venceu em ${L.dmy(venc)}. Renove para liberar na hora.`
      : `Você bloqueou manualmente.${L.parseISO(venc) ? ` Vencimento: ${L.dmy(venc)}${e.d < 0 ? ' (já venceu também)' : ''}.` : ' Sem vencimento definido.'}`}</p></div>`;
  }
  if (e.d === null) return `<div class="hero mud"><div class="rot">Sem vencimento</div><div class="grande"><b class="txt">Sem data</b></div><p>Essa loja ainda não tem data. Renove para definir o primeiro vencimento.</p></div>`;
  const pct = Math.round(Math.max(0, Math.min(1, e.d / L.DIAS_CREDITO)) * 100);
  const grande = e.d === 0 ? '<b class="txt">Vence hoje</b>' : `<b>${e.d}</b><span>${e.d === 1 ? 'dia' : 'dias'}</span>`;
  return `<div class="hero"><div class="rot">Acesso liberado até ${L.dmy(venc)}</div><div class="grande">${grande}</div><div class="barrinha"><i style="width:${pct}%"></i></div><p>Bloqueia sozinha em ${L.dm(L.somaDias(venc, 1))} se não renovar.${e.cat === 'vencendo' ? ' A loja já vê o aviso de vencimento.' : ''}</p></div>`;
}

function linhaHist(x) {
  if (!x || typeof x !== 'object') return '';
  const m = {
    renovar: ['Renovou +30 dias', `até ${L.dmy(x.para)}${x.valor != null ? ' · ' + L.fmtValor(x.valor) : ''}`],
    data: ['Mudou o vencimento', L.dmy(x.para)],
    bloqueio: ['Bloqueou', ''], desbloqueio: ['Desbloqueou', ''],
    nome: ['Renomeou', x.para || ''],
    cadastro: ['Cadastrou a loja', x.para ? `até ${L.dmy(x.para)}` : ''],
  }[x.tipo] || [x.tipo || 'Ação', ''];
  return `<div class="hist"><div>${esc(m[0])}<small>${esc(quando(x.em))}${x.por ? ' · ' + esc(x.por) : ''}</small></div><div class="r">${esc(m[1])}</div></div>`;
}
function blocoHist(id) {
  const h = S.hist[id];
  if (!h || h.carregando) return `<div class="nota">Carregando histórico…</div>`;
  if (h.erro) return `<div class="nota">Não consegui ler o histórico.</div>`;
  if (!h.itens.length) return `<div class="nota">Ainda sem ações registradas.</div>`;
  return `<div class="bloco">${h.itens.map(linhaHist).join('')}</div>`;
}

function telaLoja(id) {
  const l = lojaDe(id);
  if (!l) return naoAchou(S.registro === null ? 'Carregando…' : 'Loja não encontrada.');
  if (l.arquivada) return naoAchou('Essa loja está arquivada. Restaure em Ajustes.');
  const x = S.lic[id] || { carregando: true };
  const e = L.estadoDe(x, hoje());
  const cfg = x.cfg;
  const pronto = !!cfg;
  const dis = pronto ? '' : ' disabled';
  let hero;
  if (e.cat === 'semresposta') hero = `<div class="erro-caixa"><p>Não consegui falar com o banco dessa loja. ${esc(motivoLeitura({ code: x.erro }))}</p><button class="btn verde" data-a="recarregar-loja" data-id="${esc(id)}">Tentar de novo</button></div>`;
  else hero = heroLoja(e, cfg);
  return `<main class="tela sem-barra">${voltar}
<div class="cab-loja"><div class="avatar" aria-hidden="true">${esc((l.nome || id).trim().charAt(0).toUpperCase())}</div><div><div class="kicker">VortexCell</div><h1>${esc(l.nome || id)}</h1></div></div>
${hero}
<button class="btn lima" data-a="sheet-renovar" data-id="${esc(id)}"${dis}><span>Renovar +30 dias</span>${ic('arrow')}</button>
<div class="grade">
<button class="acao" data-a="sheet-data" data-id="${esc(id)}"${dis}>${ic('cal')}Definir data</button>
<button class="acao" data-a="sheet-nome" data-id="${esc(id)}">${ic('edit')}Renomear</button>
<button class="acao${cfg && cfg.bloqueado === true ? '' : ' bad'}" data-a="sheet-bloq" data-id="${esc(id)}"${dis}>${cfg && cfg.bloqueado === true ? ic('unlock') + 'Desbloquear' : ic('lock') + 'Bloquear'}</button>
<button class="acao" data-a="sheet-arquivar" data-id="${esc(id)}">${ic('box')}Arquivar</button>
</div>
<h2>Histórico</h2>${blocoHist(id)}
<button class="btn excluir" data-a="sheet-excluir" data-id="${esc(id)}">Excluir loja</button>
<p class="sub" style="margin-top:6px">Projeto da loja: ${esc((l.firebaseConfig && l.firebaseConfig.projectId) || id)}</p></main>`;
}

function telaSmart(id) {
  const s = S.smart.lojas.find(x => x.lojaId === id);
  if (!s) return naoAchou(S.smart.estado === 'carregando' ? 'Carregando…' : 'Loja não encontrada.');
  const membros = (s.membros || []).map(m => `<div class="hist"><div>${esc(m.nome || m.email || m.uid)}<small>${esc(m.email || '')}</small></div><div class="r" style="color:var(--muted)">${esc(m.papel || '')}</div></div>`).join('');
  return `<main class="tela sem-barra">${voltar}
<div class="cab-loja"><div class="avatar" aria-hidden="true">${esc((s.nome || '?').trim().charAt(0).toUpperCase())}</div><div><div class="kicker">VortexSmart</div><h1>${esc(s.nome)}</h1></div></div>
<div class="hero ${s.bloqueada ? 'bad' : 'mud'}"><div class="rot">Acesso</div><div class="grande"><b class="txt">${s.bloqueada ? 'Bloqueada' : 'Ativa'}</b></div><p>${s.bloqueada ? esc(s.bloqueioMotivo || 'Sem motivo registrado.') : 'Ainda sem vencimento automático.'}${s.plano ? ` Plano: ${esc(s.plano)}.` : ''}</p></div>
<h2>Usuários (${(s.membros || []).length})</h2><div class="bloco">${membros || '<div class="hist">Nenhum usuário.</div>'}</div>
<div class="nota">Por enquanto o VortexSmart é só consulta aqui. Vencimento, bloqueio e troca de senha chegam na próxima etapa.</div></main>`;
}

function telaAvisos() {
  return `<main class="tela"><div class="kicker">Painel Vortex</div><h1>Avisos</h1><div class="vazio">Em breve: mandar aviso para cada loja (ex.: "sua mensalidade vence amanhã").</div></main>${nav('avisos')}`;
}

function telaAjustes() {
  const arq = Object.entries(S.registro || {}).filter(([, l]) => l && typeof l === 'object' && l.arquivada);
  const lista = arq.length ? `<div class="bloco">${arq.map(([id, l]) => `<div class="hist"><div>${esc(l.nome || id)}<small>${esc(id)}</small></div><div class="linha-botoes"><button class="btn contorno mini" data-a="restaurar" data-id="${esc(id)}">Restaurar</button><button class="btn contorno mini" style="color:var(--bad);border-color:var(--bad)" data-a="sheet-excluir" data-id="${esc(id)}">Excluir</button></div></div>`).join('')}</div>` : '<div class="nota">Nenhuma loja arquivada.</div>';
  return `<main class="tela"><div class="kicker">Painel Vortex</div><h1>Ajustes</h1>
<h2>Conta</h2><div class="bloco"><div class="hist"><div>${esc(S.user.email || '')}<small>administrador</small></div></div></div>
<div class="pilha"><button class="btn contorno" data-a="sair">Sair</button></div>
<h2>Importar lojas</h2><p class="sub">Cadastra várias lojas de uma vez a partir de um arquivo .json. Lojas que já existem são puladas e nenhuma data é alterada.</p>
<div class="pilha"><label class="btn verde" for="arq">Escolher arquivo</label><input id="arq" type="file" accept="application/json,.json" data-in="arq" hidden></div>
<p id="stImp" class="status mud" role="status"></p>
<h2>Arquivadas</h2>${lista}
<h2>Atualização</h2><p class="sub">Versão instalada: ${esc(VERSAO)}</p>
<div class="pilha"><button class="btn contorno" data-a="atualizar-app">Buscar atualização</button></div>
<p id="stAtu" class="status mud" role="status"></p></main>${nav('ajustes')}`;
}

function telaNova() {
  return `<main class="tela sem-barra">${voltar}<h1 style="margin-top:14px">Nova loja</h1><p class="sub">Para clientes do VortexCell. Crie o projeto Firebase da loja, ative o Realtime Database e cole aqui o firebaseConfig.</p>
<div class="campo"><label for="nomeLoja">Nome da loja</label><input id="nomeLoja" maxlength="60" autocomplete="off"></div>
<div class="campo"><label for="cfgTxt">firebaseConfig</label><textarea id="cfgTxt" data-in="cfg" spellcheck="false" autocapitalize="none" autocomplete="off" placeholder="const firebaseConfig = {&#10;  apiKey: &quot;...&quot;,&#10;  ..."></textarea></div>
<div class="pilha"><button class="btn contorno" data-a="testar">Testar conexão</button></div>
<p id="stTeste" class="status mud" role="status"></p>
<div id="prazo"></div></main>`;
}

function telaLogin() {
  return `<main class="login"><div class="logo">${ic('store', 32)}</div><h1>Painel Vortex</h1><p class="sub">Entre com a conta de administrador.</p>
<form id="fLogin" novalidate><div class="campo"><label for="em">E-mail</label><input id="em" type="email" autocomplete="username" inputmode="email" autocapitalize="none" autocorrect="off"></div>
<div class="campo"><label for="pw">Senha</label><input id="pw" type="password" autocomplete="current-password"></div>
<p id="lgMsg" class="status bad" role="alert"></p><div class="pilha"><button class="btn verde" type="submit" id="lgBtn">Entrar</button></div></form></main>`;
}

function render() {
  if (S.user === undefined) { root.innerHTML = '<div class="login"><div class="vazio">Carregando…</div></div>'; return; }
  if (!S.user) { root.innerHTML = telaLogin(); return; }
  const r = rota();
  let h;
  switch (r.t) {
    case 'loja': h = telaLoja(r.id); break;
    case 'smart': h = telaSmart(r.id); break;
    case 'nova': h = telaNova(); break;
    case 'avisos': h = telaAvisos(); break;
    case 'ajustes': h = telaAjustes(); break;
    default: h = telaLista();
  }
  root.innerHTML = h;
}

// ── Sheets de ação (VortexCell) ────────────────────────────────
const dupla = (cancelar, confirmar) => `<div class="dupla">${cancelar}${confirmar}</div>`;
const btnCancelar = '<button class="btn contorno" data-a="fechar">Cancelar</button>';

function sheetRenovar(id) {
  const l = lojaDe(id), cfg = (S.lic[id] || {}).cfg;
  if (!l || !cfg) return;
  const h = hoje(), venc = L.parseISO(cfg.vencimento) ? cfg.vencimento : null;
  const padrao = (venc && L.diasAte(venc, h) >= 0) ? 'vencimento' : 'hoje';
  const op = (v, rot, em, extra) => `<label class="opcao"><input type="radio" name="base" value="${v}"${padrao === v ? ' checked' : ''}${extra || ''}><span>${rot}</span><em>${em}</em></label>`;
  abrir(`<div data-form="renovar" data-id="${esc(id)}"><h3>Renovar +30 dias</h3><p class="sub">${esc(l.nome)} · ${venc ? 'vence ' + L.dmy(venc) : 'sem vencimento'}</p>
<fieldset class="opcoes"><legend class="legenda">Contar os 30 dias a partir de</legend>
${op('vencimento', 'Do vencimento', venc ? L.dm(venc) : 'sem data', venc ? '' : ' disabled')}${op('hoje', 'De hoje', L.dm(h))}${op('data', 'De outra data', '')}</fieldset>
<div class="campo" id="campoData" hidden><label for="dataBase">Data inicial</label><input id="dataBase" type="date" value="${h}"></div>
<div class="resultado" id="prev"></div>
<div class="campo"><label for="valor">Valor recebido (opcional)</label><input id="valor" inputmode="decimal" placeholder="150,00" autocomplete="off"></div>
${cfg.bloqueado === true ? `<fieldset class="opcoes"><label class="opcao"><input type="checkbox" id="liberar" checked><span>Tirar o bloqueio manual junto</span></label></fieldset>` : ''}
<p id="msg" class="status" role="alert"></p>
${dupla(btnCancelar, `<button class="btn verde" data-a="ok-renovar" data-id="${esc(id)}">Confirmar renovação</button>`)}</div>`);
  previaRenovar();
}

function lerFormRenovar() {
  const f = sheet.querySelector('[data-form="renovar"]');
  const id = f.dataset.id, cfg = (S.lic[id] || {}).cfg || {};
  const base = (f.querySelector('input[name=base]:checked') || {}).value || 'hoje';
  const dataBase = f.querySelector('#dataBase').value;
  const h = hoje();
  const plano = L.planoRenovar({ vencimentoAtual: cfg.vencimento, hoje: h, base, dataBase });
  const v = L.parseValor(f.querySelector('#valor').value);
  const lib = f.querySelector('#liberar');
  return { id, f, base, dataBase, hoje: h, plano, valor: v.valor, erro: plano.erro || v.erro, liberar: !!(lib && lib.checked) };
}
function previaRenovar() {
  const r = lerFormRenovar();
  r.f.querySelector('#campoData').hidden = r.base !== 'data';
  const prev = r.f.querySelector('#prev');
  if (r.plano.erro) {
    prev.className = 'resultado alerta'; prev.innerHTML = `<div class="rot">Atenção</div><div class="obs">${esc(r.plano.erro)}</div>`;
  } else {
    const p = r.plano, dias = L.diasAte(p.para, r.hoje);
    prev.className = 'resultado' + (p.aindaVencida ? ' alerta' : '');
    prev.innerHTML = `<div class="rot">Novo vencimento</div><div class="valor">${L.dmy(p.para)}</div><div class="obs">30 dias a partir de ${L.dmy(p.origem)}${p.aindaVencida ? ' · ainda vencida: continua bloqueada' : ` · daqui a ${dias} dias`}</div>`;
  }
  msg(r.plano.erro ? '' : (L.parseValor(r.f.querySelector('#valor').value).erro || ''));
  r.f.querySelector('[data-a=ok-renovar]').disabled = !!r.erro;
}

async function okRenovar(el) {
  const id = el.dataset.id, loja = lojaDe(id), f = lerFormRenovar();
  if (!loja || f.erro) return;
  await rodar(el, async () => {
    try {
      const novo = await D.renovar(loja, { base: f.base, dataBase: f.dataBase, hoje: f.hoje, esperado: f.plano.para, liberar: f.liberar });
      S.lic[id] = { cfg: novo };
      fecharSheet(); render();
      toast(`Renovada até ${L.dmy(novo.vencimento)}`);
      historico(id, { tipo: 'renovar', de: f.plano.de, para: novo.vencimento, base: f.base, valor: f.valor, liberou: f.liberar ? true : null });
    } catch (e) {
      previaRenovar(); msg(textoErro(e));
      carregarLic(id, true);
    }
  });
}

function sheetData(id) {
  const l = lojaDe(id), cfg = (S.lic[id] || {}).cfg;
  if (!l || !cfg) return;
  const h = hoje();
  abrir(`<div data-form="data" data-id="${esc(id)}"><h3>Definir vencimento</h3><p class="sub">${esc(l.nome)} · ${L.parseISO(cfg.vencimento) ? 'vence ' + L.dmy(cfg.vencimento) : 'sem vencimento'}</p>
<div class="campo"><label for="novaData">Acesso liberado até</label><input id="novaData" type="date" value="${L.parseISO(cfg.vencimento) ? cfg.vencimento : h}"></div>
<div class="nota" id="prevData"></div><p id="msg" class="status" role="alert"></p>
${dupla(btnCancelar, `<button class="btn verde" data-a="ok-data" data-id="${esc(id)}">Salvar data</button>`)}</div>`);
  previaData();
}
function previaData() {
  const v = sheet.querySelector('#novaData').value, h = hoje();
  const ok = !!L.parseISO(v), d = ok ? L.diasAte(v, h) : null;
  sheet.querySelector('#prevData').textContent = !ok ? 'Escolha uma data.' : d < 0 ? 'Essa data já passou: a loja fica bloqueada.' : d === 0 ? 'Libera só até hoje.' : `Libera por mais ${d} dias.`;
  sheet.querySelector('[data-a=ok-data]').disabled = !ok;
}
async function okData(el) {
  const id = el.dataset.id, loja = lojaDe(id), v = sheet.querySelector('#novaData').value;
  if (!loja || !L.parseISO(v)) return;
  const antes = ((S.lic[id] || {}).cfg || {}).vencimento;
  await rodar(el, async () => {
    try {
      const cfg = await D.definirVencimento(loja, v);
      if (cfg.vencimento !== v) throw new Error('O banco devolveu outra data. Confira.');
      S.lic[id] = { cfg }; fecharSheet(); render(); toast(`Vencimento: ${L.dmy(v)}`);
      historico(id, { tipo: 'data', de: L.parseISO(antes) ? antes : null, para: v });
    } catch (e) { msg(textoErro(e)); carregarLic(id, true); }
  });
}

function sheetNome(id) {
  const l = lojaDe(id); if (!l) return;
  abrir(`<div data-form="nome" data-id="${esc(id)}"><h3>Renomear loja</h3><p class="sub">Muda o nome só aqui no painel.</p>
<div class="campo"><label for="novoNome">Nome</label><input id="novoNome" maxlength="60" value="${esc(l.nome || '')}" autocomplete="off" data-enter="ok-nome"></div>
<p id="msg" class="status" role="alert"></p>${dupla(btnCancelar, `<button class="btn verde" data-a="ok-nome" data-id="${esc(id)}">Salvar nome</button>`)}</div>`, '#novoNome');
}
async function okNome(el) {
  const id = el.dataset.id, l = lojaDe(id), n = L.validarNome(sheet.querySelector('#novoNome').value);
  if (!l) return;
  if (n.erro) return msg(n.erro);
  if (n.nome === l.nome) return fecharSheet();
  await rodar(el, async () => {
    try {
      await D.renomearLoja(id, n.nome);
      S.registro[id].nome = n.nome; fecharSheet(); render(); toast('Nome atualizado');
      historico(id, { tipo: 'nome', de: l.nome, para: n.nome });
    } catch (e) { msg(textoErro(e)); }
  });
}

function sheetBloq(id) {
  const l = lojaDe(id), cfg = (S.lic[id] || {}).cfg;
  if (!l || !cfg) return;
  const des = cfg.bloqueado === true, d = L.diasAte(cfg.vencimento, hoje());
  const aviso = des && d !== null && d < 0 ? `<div class="nota">Atenção: a data venceu em ${L.dmy(cfg.vencimento)}. Mesmo sem o bloqueio manual, a loja continua bloqueada até você renovar.</div>` : '';
  abrir(`<div data-form="bloq" data-id="${esc(id)}"><h3>${des ? 'Desbloquear' : 'Bloquear'} loja</h3>
<p class="sub">${des ? `${esc(l.nome)} volta a ter acesso (se a data estiver em dia).` : `${esc(l.nome)} perde o acesso agora, mesmo com dias de crédito.`}</p>${aviso}
<p id="msg" class="status" role="alert"></p>${dupla(btnCancelar, `<button class="btn ${des ? 'verde' : 'perigo'}" data-a="ok-bloq" data-id="${esc(id)}" data-b="${des ? 0 : 1}">${des ? 'Desbloquear' : 'Bloquear'}</button>`)}</div>`);
}
async function okBloq(el) {
  const id = el.dataset.id, loja = lojaDe(id), quer = el.dataset.b === '1';
  if (!loja) return;
  await rodar(el, async () => {
    try {
      const cfg = await D.definirBloqueio(loja, quer);
      if ((cfg.bloqueado === true) !== quer) throw new Error('O banco devolveu outro estado. Confira.');
      S.lic[id] = { cfg }; fecharSheet(); render(); toast(quer ? 'Loja bloqueada' : 'Bloqueio removido');
      historico(id, { tipo: quer ? 'bloqueio' : 'desbloqueio' });
    } catch (e) { msg(textoErro(e)); carregarLic(id, true); }
  });
}

function sheetArquivar(id) {
  const l = lojaDe(id); if (!l) return;
  abrir(`<div><h3>Arquivar loja</h3><p class="sub">${esc(l.nome)} sai da lista. Nada é apagado e o acesso da loja não muda. Você restaura em Ajustes.</p>
<p id="msg" class="status" role="alert"></p>${dupla(btnCancelar, `<button class="btn perigo" data-a="ok-arquivar" data-id="${esc(id)}">Arquivar</button>`)}</div>`);
}
async function okArquivar(el) {
  const id = el.dataset.id;
  await rodar(el, async () => {
    try {
      await D.arquivarLoja(id, true);
      S.registro[id].arquivada = true; delete S.lic[id];
      fecharSheet(); location.hash = '#/'; toast('Loja arquivada');
    } catch (e) { msg(textoErro(e)); }
  });
}

function sheetExcluir(id) {
  const l = lojaDe(id); if (!l) return;
  abrir(`<div><h3>Excluir loja</h3><p class="sub"><b>${esc(l.nome)}</b> sai do painel e o histórico dela é apagado. O sistema da loja não é mexido: ela continua com a data que está no banco dela, mas você deixa de controlar o bloqueio por aqui. Dá para cadastrar de novo depois.</p>
<div class="campo"><label for="senhaExcluir">Sua senha de login</label><input id="senhaExcluir" type="password" autocomplete="current-password" data-enter="ok-excluir"></div>
<p id="msg" class="status" role="alert"></p>${dupla(btnCancelar, `<button class="btn perigo" data-a="ok-excluir" data-id="${esc(id)}">Excluir de vez</button>`)}</div>`, '#senhaExcluir');
}
async function okExcluir(el) {
  const id = el.dataset.id, campo = sheet.querySelector('#senhaExcluir'), senha = campo.value;
  if (!senha) return msg('Digite sua senha para confirmar.');
  await rodar(el, async () => {
    try {
      await D.excluirLoja(id, senha);
      delete S.registro[id]; delete S.lic[id]; delete S.hist[id];
      fecharSheet(); toast('Loja excluída');
      if (rota().t === 'loja') location.hash = '#/'; else render();
    } catch (e) {
      campo.value = ''; msg(textoErro(e));
      if (D.codigo(e) === 'timeout') recarregarTudo();      // não sabemos se apagou: confere na lista
    }
  });
}

// Pergunta ao servidor qual é a versão publicada (config.js, sem cache). Se for outra, limpa o cache do app e recarrega.
async function buscarAtualizacao(el) {
  await rodar(el, async () => {
    st('#stAtu', 'Procurando…', 'mud');
    let remota;
    try {
      const r = await fetch('config.js?_=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('http ' + r.status);
      const m = /VERSAO\s*=\s*['"]([^'"]+)['"]/.exec(await r.text());
      remota = m && m[1];
    } catch (e) { return st('#stAtu', navigator.onLine ? 'Não consegui consultar o servidor.' : 'Sem internet.'); }
    if (!remota) return st('#stAtu', 'Não consegui ler a versão publicada.');
    if (remota === VERSAO) {
      if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => {});
      return st('#stAtu', `Você já está na versão mais recente (${VERSAO}).`, 'ok');
    }
    st('#stAtu', `Versão ${remota} encontrada. Atualizando…`, 'ok');
    try {
      if ('serviceWorker' in navigator) { const reg = await navigator.serviceWorker.getRegistration(); if (reg) await reg.update(); }
      if (window.caches) await Promise.all((await caches.keys()).map(k => caches.delete(k)));
    } catch (e) { /* recarregar já pega os arquivos novos */ }
    location.reload();
  });
}

// Registra no histórico; falha aqui nunca desfaz a ação principal
function historico(id, entrada) {
  D.registrarHistorico(id, limpa(Object.assign({ por: S.user && S.user.email }, entrada)))
    .then(() => carregarHist(id)).catch(() => {});
}

// ── Nova loja ──────────────────────────────────────────────────
const st = (sel, t, k) => { const e = $(sel); if (e) { e.className = 'status ' + (k || 'bad'); e.textContent = t; } };

function mostrarPrazo(venc) {
  const h = hoje();
  const op = (v, rot, em, chk) => `<label class="opcao"><input type="radio" name="prazo" value="${v}"${chk ? ' checked' : ''}><span>${rot}</span><em>${em}</em></label>`;
  $('#prazo').innerHTML = `<fieldset class="opcoes"><legend class="legenda">Prazo inicial de acesso</legend>
${venc ? op('manter', 'Manter o que já está no banco', L.dmy(venc), true) : ''}
${op('teste', `Teste de ${L.DIAS_TESTE} dias`, L.dmy(L.somaDias(h, L.DIAS_TESTE)), !venc)}
${op('30', '30 dias a partir de hoje', L.dmy(L.somaDias(h, L.DIAS_CREDITO)))}
${op('data', 'Outra data', '')}</fieldset>
<div class="campo" id="campoPrazoData" hidden><label for="prazoData">Acesso liberado até</label><input id="prazoData" type="date" value="${L.somaDias(h, L.DIAS_CREDITO)}"></div>
<div class="pilha"><button class="btn verde" data-a="cadastrar">Cadastrar loja</button></div><p id="stCad" class="status" role="alert"></p>`;
}

async function acaoTestar(el) {
  const p = L.parseFirebaseConfig($('#cfgTxt').value);
  if (p.erro) return st('#stTeste', p.erro);
  if (S.registro === null) return st('#stTeste', 'Espere a lista de lojas carregar.');
  const id = p.config.projectId;
  if (S.registro[id]) return st('#stTeste', S.registro[id].arquivada ? 'Essa loja já está cadastrada (arquivada). Restaure em Ajustes.' : 'Essa loja já está cadastrada.');
  const texto = $('#cfgTxt').value;
  await rodar(el, async () => {
    st('#stTeste', 'Conectando…', 'mud');
    try {
      const cfg = await D.testarLoja(p.config);
      if ($('#cfgTxt').value !== texto) return;      // a pessoa mexeu no texto durante o teste
      nova = { config: p.config, texto };
      const venc = L.parseISO(cfg.vencimento) ? cfg.vencimento : null;
      mostrarPrazo(venc);
      st('#stTeste', venc ? `Conectou. Essa loja já tem vencimento em ${L.dmy(venc)}.` : 'Conectou. Ainda sem vencimento no banco.', 'ok');
    } catch (e) {
      nova = { config: null, texto: '' }; $('#prazo').innerHTML = '';
      st('#stTeste', motivoLeitura(e));
    }
  });
}

async function acaoCadastrar(el) {
  if (!nova.config) return st('#stCad', 'Teste a conexão primeiro.');
  const nm = L.validarNome($('#nomeLoja').value);
  if (nm.erro) return st('#stCad', nm.erro);
  const prazo = ($('input[name=prazo]:checked') || {}).value;
  const h = hoje();
  let venc = null;
  if (prazo === 'teste') venc = L.somaDias(h, L.DIAS_TESTE);
  else if (prazo === '30') venc = L.somaDias(h, L.DIAS_CREDITO);
  else if (prazo === 'data') {
    venc = $('#prazoData').value;
    if (!L.parseISO(venc) || L.diasAte(venc, h) < 0) return st('#stCad', 'Escolha uma data de hoje em diante.');
  } else if (prazo !== 'manter') return st('#stCad', 'Escolha o prazo inicial.');
  const config = nova.config, id = config.projectId;
  await rodar(el, async () => {
    try {
      await D.cadastrarLoja({ id, nome: nm.nome, firebaseConfig: config });   // primeiro o cadastro (impede duplicata); depois a data
    } catch (e) {
      st('#stCad', D.codigo(e) === 'timeout' ? 'Sem resposta. Veja na lista se a loja entrou antes de tentar de novo.' : textoErro(e));
      if (D.codigo(e) === 'timeout') recarregarTudo();
      return;
    }
    S.registro[id] = { nome: nm.nome, sistema: 'cell', firebaseConfig: config, criadoEm: Date.now() };
    S.lic[id] = { carregando: true };
    let falhouData = false;
    if (venc) {
      try { S.lic[id] = { cfg: await D.gravarLicencaInicial(config, venc) }; } catch (e) { falhouData = true; carregarLic(id, true); }
    } else carregarLic(id, true);
    historico(id, { tipo: 'cadastro', para: venc });
    location.hash = '#/loja/' + encodeURIComponent(id);
    toast(falhouData ? 'Loja cadastrada, mas a data não gravou. Toque em Renovar.' : 'Loja cadastrada');
  });
}

// ── Importar lojas ─────────────────────────────────────────────
async function acaoImportar(input) {
  const arq = input.files && input.files[0];
  input.value = '';
  if (!arq) return;
  if (S.registro === null) return st('#stImp', 'Espere a lista de lojas carregar.');
  if (arq.size > 1e6) return st('#stImp', 'Arquivo grande demais.');
  let dados;
  try { dados = JSON.parse(await arq.text()); } catch (e) { return st('#stImp', 'Esse arquivo não é um JSON válido.'); }
  const lista = Array.isArray(dados) ? dados : dados && dados.lojas;
  if (!Array.isArray(lista) || !lista.length) return st('#stImp', 'Não achei nenhuma loja no arquivo.');
  await rodar(null, async () => {
    let ok = 0, ja = 0; const falhas = [];
    for (const it of lista) {
      const nm = L.validarNome(it && it.nome);
      const p = L.parseFirebaseConfig(JSON.stringify((it && it.firebaseConfig) || {}));
      if (nm.erro || p.erro) { falhas.push((it && it.nome) || '(sem nome)'); continue; }
      const id = p.config.projectId;
      if (S.registro[id]) { ja++; continue; }
      st('#stImp', `Importando ${nm.nome}…`, 'mud');
      try {
        await D.cadastrarLoja({ id, nome: nm.nome, firebaseConfig: p.config });
        S.registro[id] = { nome: nm.nome, sistema: 'cell', firebaseConfig: p.config, criadoEm: Date.now() };
        S.lic[id] = { carregando: true }; carregarLic(id, true); ok++;
      } catch (e) { if (D.codigo(e) === 'ja-existe') ja++; else falhas.push(nm.nome); }
    }
    st('#stImp', `${ok} cadastrada(s), ${ja} já existia(m)${falhas.length ? `, ${falhas.length} com erro: ${falhas.join(', ')}` : ''}.`, falhas.length ? 'bad' : 'ok');
  });
}

// ── Eventos ────────────────────────────────────────────────────
const ACOES = {
  fundo: (el, ev) => { if (ev.target === el) fechar(); },
  fechar,
  filtro: el => { S.filtro = S.filtro === el.dataset.f ? 'todas' : el.dataset.f; render(); },
  recarregar: () => recarregarTudo(true),
  'recarregar-loja': el => carregarLic(el.dataset.id),
  'sheet-renovar': el => sheetRenovar(el.dataset.id),
  'sheet-data': el => sheetData(el.dataset.id),
  'sheet-nome': el => sheetNome(el.dataset.id),
  'sheet-bloq': el => sheetBloq(el.dataset.id),
  'sheet-arquivar': el => sheetArquivar(el.dataset.id),
  'sheet-excluir': el => sheetExcluir(el.dataset.id), 'ok-excluir': okExcluir, 'atualizar-app': buscarAtualizacao,
  'ok-renovar': okRenovar, 'ok-data': okData, 'ok-nome': okNome, 'ok-bloq': okBloq, 'ok-arquivar': okArquivar,
  testar: acaoTestar, cadastrar: acaoCadastrar,
  restaurar: el => rodar(el, async () => {
    const id = el.dataset.id;
    try {
      await D.arquivarLoja(id, false);
      S.registro[id].arquivada = false; S.lic[id] = { carregando: true }; carregarLic(id, true);
      render(); toast('Loja restaurada');
    } catch (e) { toast(textoErro(e)); }
  }),
  sair: el => rodar(el, () => D.sair()),
};

document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-a]');
  const fn = el && ACOES[el.dataset.a];
  if (fn) fn(el, ev);
});
document.addEventListener('input', ev => {
  const t = ev.target;
  if (t.closest('[data-form="renovar"]')) previaRenovar();
  else if (t.id === 'novaData') previaData();
  else if (t.id === 'cfgTxt' && t.value !== nova.texto && nova.config) {   // texto mudou: o teste anterior não vale mais
    nova = { config: null, texto: '' }; $('#prazo').innerHTML = ''; st('#stTeste', '', 'mud');
  }
});
document.addEventListener('change', ev => {
  const t = ev.target;
  if (t.closest('[data-form="renovar"]')) previaRenovar();
  else if (t.id === 'novaData') previaData();
  else if (t.name === 'prazo') { const c = $('#campoPrazoData'); if (c) c.hidden = t.value !== 'data'; }
  else if (t.dataset.in === 'arq') acaoImportar(t);
});
document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape' && sheet.firstChild) fechar();
  if (ev.key === 'Enter' && ev.target.dataset && ev.target.dataset.enter) {
    ev.preventDefault();
    const b = sheet.querySelector(`[data-a="${ev.target.dataset.enter}"]`); if (b) b.click();
  }
});
document.addEventListener('submit', ev => {
  if (ev.target.id !== 'fLogin') return;
  ev.preventDefault();
  const email = $('#em').value.trim(), senha = $('#pw').value;
  if (!email || !senha) return st('#lgMsg', 'Digite e-mail e senha.');
  rodar($('#lgBtn'), async () => {
    st('#lgMsg', '', 'bad');
    try { await D.entrar(email, senha); } catch (e) { st('#lgMsg', D.msgAuth(e)); }
  });
});

window.addEventListener('hashchange', () => { fecharSheet(); window.scrollTo(0, 0); render(); entrou(); });

let escondidoEm = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { escondidoEm = Date.now(); return; }
  if (!S.user) return;
  if (Date.now() - escondidoEm > 60000 && !S.ocupado) recarregarTudo(); else atualizar();   // o dia pode ter virado
});

D.observarLogin(u => {
  if (u && S.user && S.user.uid === u.uid) return;
  S.sessao++; S.user = u || null; fecharSheet();
  if (u) iniciar();
  else { S.registro = null; S.erroRegistro = null; S.lic = {}; S.hist = {}; S.smart = { estado: 'idle', lojas: [], erro: null }; render(); }
});
render();

// ── PWA ────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  const tinhaControle = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (tinhaControle && !sheet.firstChild && rota().t !== 'nova' && !S.ocupado) location.reload();   // versão nova: recarrega só se não houver nada sendo digitado
  });
}
