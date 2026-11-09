import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../lib.js';

const HOJE = '2026-11-07';

test('parseISO só aceita datas reais', () => {
  assert.ok(L.parseISO('2026-02-28'));
  assert.equal(L.parseISO('2026-02-30'), null);
  assert.equal(L.parseISO('2026-13-01'), null);
  assert.equal(L.parseISO('07/11/2026'), null);
  assert.equal(L.parseISO(''), null);
  assert.equal(L.parseISO(null), null);
  assert.ok(L.parseISO('2028-02-29'));
  assert.equal(L.parseISO('2027-02-29'), null);
});

test('hojeISO usa o dia de Brasília (UTC-3), não o do relógio UTC', () => {
  assert.equal(L.hojeISO(new Date('2026-11-08T01:30:00Z')), '2026-11-07'); // 22:30 em Brasília
  assert.equal(L.hojeISO(new Date('2026-11-07T03:00:00Z')), '2026-11-07'); // 00:00 em Brasília
  assert.equal(L.hojeISO(new Date('2026-11-07T02:59:00Z')), '2026-11-06');
});

test('somaDias e diasAte atravessam mês, ano e bissexto', () => {
  assert.equal(L.somaDias('2026-11-12', 30), '2026-12-12');
  assert.equal(L.somaDias('2026-12-20', 30), '2027-01-19');
  assert.equal(L.somaDias('2028-02-15', 30), '2028-03-16');
  assert.equal(L.somaDias('2026-03-01', -1), '2026-02-28');
  assert.equal(L.diasAte('2026-11-12', HOJE), 5);
  assert.equal(L.diasAte('2026-11-05', HOJE), -2);
  assert.equal(L.diasAte(HOJE, HOJE), 0);
  assert.equal(L.diasAte('lixo', HOJE), null);
});

test('planoRenovar: três bases de contagem', () => {
  const a = L.planoRenovar({ vencimentoAtual: '2026-11-12', hoje: HOJE, base: 'vencimento' });
  assert.deepEqual([a.de, a.para, a.aindaVencida], ['2026-11-12', '2026-12-12', false]);
  const b = L.planoRenovar({ vencimentoAtual: '2026-11-12', hoje: HOJE, base: 'hoje' });
  assert.equal(b.para, '2026-12-07');
  const c = L.planoRenovar({ vencimentoAtual: '2026-11-12', hoje: HOJE, base: 'data', dataBase: '2026-11-20' });
  assert.equal(c.para, '2026-12-20');
  assert.ok(L.planoRenovar({ vencimentoAtual: '2026-11-12', hoje: HOJE, base: 'data', dataBase: '' }).erro);
});

test('planoRenovar: loja sem data conta a partir de hoje; vencida há muito continua vencida', () => {
  assert.equal(L.planoRenovar({ vencimentoAtual: undefined, hoje: HOJE }).para, '2026-12-07');
  const velha = L.planoRenovar({ vencimentoAtual: '2026-08-01', hoje: HOJE, base: 'vencimento' });
  assert.equal(velha.para, '2026-08-31');
  assert.equal(velha.aindaVencida, true);
});

test('decidirRenovacao: preserva campos, respeita bloqueio manual e detecta conflito', () => {
  const cur = { bloqueado: true, vencimento: '2026-11-12', extra: 'x' };
  const mantem = L.decidirRenovacao(cur, { base: 'vencimento', hoje: HOJE, esperado: '2026-12-12', liberar: false });
  assert.deepEqual(mantem.novo, { bloqueado: true, vencimento: '2026-12-12', extra: 'x' });
  const libera = L.decidirRenovacao(cur, { base: 'vencimento', hoje: HOJE, esperado: '2026-12-12', liberar: true });
  assert.equal(libera.novo.bloqueado, false);
  // alguém mudou a data enquanto a tela estava aberta: o resultado não bate com o que o usuário viu
  const mudou = L.decidirRenovacao({ bloqueado: false, vencimento: '2026-11-20' }, { base: 'vencimento', hoje: HOJE, esperado: '2026-12-12', liberar: false });
  assert.equal(mudou.conflito, true);
  assert.equal(mudou.novo, undefined);
});

test('decidirRenovacao: banco vazio/não sincronizado (null) não aborta e cria os dois campos', () => {
  const r = L.decidirRenovacao(null, { base: 'vencimento', hoje: HOJE, esperado: '2026-12-07', liberar: false });
  assert.deepEqual(r.novo, { vencimento: '2026-12-07', bloqueado: false });
  const sem = L.decidirRenovacao({ vencimento: '2026-11-12' }, { base: 'vencimento', hoje: HOJE, esperado: '2026-12-12', liberar: false });
  assert.equal(sem.novo.bloqueado, false);
});

test('estadoDe segue a regra dos apps das lojas', () => {
  const e = (cfg, extra = {}) => L.estadoDe({ cfg, ...extra }, HOJE);
  assert.equal(e({ vencimento: '2026-12-07' }).cat, 'ativa');
  assert.equal(e({ vencimento: '2026-12-07' }).num, '30');
  assert.equal(e({ vencimento: '2026-11-12' }).cat, 'vencendo');       // 5 dias = avisa
  assert.equal(e({ vencimento: '2026-11-13' }).cat, 'ativa');          // 6 dias = ainda não
  assert.equal(e({ vencimento: HOJE }).cat, 'vencendo');               // vence hoje: ainda acessa
  assert.equal(e({ vencimento: HOJE }).chip, 'Vence hoje');
  const venc = e({ vencimento: '2026-11-05' });
  assert.deepEqual([venc.cat, venc.manual, venc.chip], ['bloqueada', false, 'Bloqueou sozinha · 06/11']);
  assert.deepEqual([e({ vencimento: '2026-12-07', bloqueado: true }).cat, e({ vencimento: '2026-12-07', bloqueado: true }).manual], ['bloqueada', true]);
  assert.equal(e({ bloqueado: true, vencimento: '2026-11-01' }).manual, true);   // manual tem prioridade no rótulo
  assert.equal(e(null).chip, 'Sem vencimento');
  assert.equal(e({}).cat, 'ativa');
  assert.equal(e({ vencimento: 'lixo' }).chip, 'Sem vencimento');
});

test('estadoDe: loja que não responde nunca aparece como ativa', () => {
  const r = L.estadoDe({ erro: 'timeout', cfg: { vencimento: '2099-01-01' } }, HOJE);
  assert.equal(r.cat, 'semresposta');
  assert.equal(L.estadoDe({ carregando: true }, HOJE).cat, 'carregando');
});

test('ordenar: bloqueadas, sem resposta, vencendo, ativas por dias, nome', () => {
  const mk = (nome, cfg, extra) => ({ nome, est: L.estadoDe({ cfg, ...extra }, HOJE) });
  const lista = L.ordenar([
    mk('Zeta', { vencimento: '2026-12-30' }), mk('Alfa', { vencimento: '2026-12-10' }), mk('Beta', { vencimento: '2026-11-09' }),
    mk('Gama', null, { erro: 'x' }), mk('Delta', { vencimento: '2026-12-10' }), mk('Ômega', { bloqueado: true }),
  ]).map(x => x.nome);
  assert.deepEqual(lista, ['Ômega', 'Gama', 'Beta', 'Alfa', 'Delta', 'Zeta']);
  const c = L.contagens([mk('a', { vencimento: '2026-12-30' }), mk('b', { bloqueado: true }), mk('c', { vencimento: '2026-11-08' })].map(x => x.est));
  assert.deepEqual([c.total, c.ativa, c.vencendo, c.bloqueada], [3, 1, 1, 1]);
});

test('parseFirebaseConfig: objeto JS, JSON e const colados do Console', () => {
  const js = `const firebaseConfig = {
    apiKey: "AIzaSyXXX", authDomain: "loja-x.firebaseapp.com",
    databaseURL: "https://loja-x-default-rtdb.firebaseio.com", projectId: "loja-x",
    storageBucket: "loja-x.firebasestorage.app", messagingSenderId: "123", appId: "1:123:web:abc" };`;
  const r = L.parseFirebaseConfig(js);
  assert.equal(r.config.projectId, 'loja-x');
  assert.equal(r.config.databaseURL, 'https://loja-x-default-rtdb.firebaseio.com');
  const json = L.parseFirebaseConfig('{"apiKey":"k","databaseURL":"https://p-default-rtdb.europe-west1.firebasedatabase.app","projectId":"p"}');
  assert.equal(json.config.projectId, 'p');
});

test('parseFirebaseConfig: recusa config incompleto ou suspeito', () => {
  assert.match(L.parseFirebaseConfig('{ apiKey: "k", projectId: "p" }').erro, /databaseURL/);
  assert.ok(L.parseFirebaseConfig('olá').erro);
  assert.ok(L.parseFirebaseConfig('{ apiKey: "k", projectId: "p", databaseURL: "http://p.firebaseio.com" }').erro);
  assert.ok(L.parseFirebaseConfig('{ apiKey: "k", projectId: "p", databaseURL: "https://evil.com" }').erro);
  assert.ok(L.parseFirebaseConfig('{ apiKey: "k", projectId: "../x", databaseURL: "https://a.firebaseio.com" }').erro);
});

test('parseValor entende formato brasileiro', () => {
  assert.equal(L.parseValor('').valor, null);
  assert.equal(L.parseValor('R$ 150').valor, 150);
  assert.equal(L.parseValor('150,50').valor, 150.5);
  assert.equal(L.parseValor('1.234,56').valor, 1234.56);
  assert.equal(L.parseValor('1.234').valor, 1234);
  assert.equal(L.parseValor('150.5').valor, 150.5);
  assert.ok(L.parseValor('abc').erro);
  assert.ok(L.parseValor('-5').erro);
});

test('validarNome e esc', () => {
  assert.equal(L.validarNome('  Loja   do  João ').nome, 'Loja do João');
  assert.ok(L.validarNome('   ').erro);
  assert.ok(L.validarNome('x'.repeat(61)).erro);
  assert.equal(L.esc('<img src=x onerror="a">&\''), '&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;');
});
