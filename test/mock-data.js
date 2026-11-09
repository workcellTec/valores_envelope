// Substitui data.js nos testes de navegador: banco em memória, mesma interface. Não vai para produção.
import { decidirRenovacao, hojeISO, somaDias } from '/lib.js';

const h = hojeISO();
const cfgFake = id => ({ apiKey: 'k-' + id, projectId: id, databaseURL: `https://${id}-default-rtdb.firebaseio.com` });
const db = {
  registro: {
    alfa: { nome: 'Alfa Cell', sistema: 'cell', firebaseConfig: cfgFake('alfa'), criadoEm: 1 },
    beta: { nome: 'Beta Cell', sistema: 'cell', firebaseConfig: cfgFake('beta'), criadoEm: 2 },
    gama: { nome: 'Gama Cell', sistema: 'cell', firebaseConfig: cfgFake('gama'), criadoEm: 3 },
    mudo: { nome: 'Mudo Cell', sistema: 'cell', firebaseConfig: cfgFake('mudo'), criadoEm: 4 },
    velha: { nome: 'Velha Cell', sistema: 'cell', firebaseConfig: cfgFake('velha'), criadoEm: 5 },
  },
  lic: {
    alfa: { bloqueado: false, vencimento: somaDias(h, 20) },
    beta: { bloqueado: false, vencimento: somaDias(h, 3) },
    gama: { bloqueado: true, vencimento: somaDias(h, 10) },
    velha: { bloqueado: false, vencimento: somaDias(h, -4) },
  },
  acesso: {},
  historico: { gama: [{ em: 1, tipo: 'bloqueio' }] },
  smart: [{ lojaId: 'sm1', nome: 'Smart Um', bloqueada: false, plano: 'pro', membros: [{ uid: 'u1', nome: 'Ana', email: 'ana@x.com', papel: 'gestor' }] }],
};
export const __db = db;
window.__db = db; window.__chamadas = { renovar: 0, push: 0 };

let obs = null, user = null;
export const comTimeout = p => p;
export const codigo = e => (e && (e.code || e.message)) || 'erro';
export const msgAuth = e => 'E-mail ou senha incorretos.';
export const observarLogin = cb => { obs = cb; setTimeout(() => cb(user), 0); return () => {}; };
export const usuarioAtual = () => user;
export const observarSmart = () => () => {};
export async function entrar(email, senha) {
  if (senha !== 'ok123') throw { code: 'auth/invalid-credential' };
  user = { uid: 'U1', email }; obs(user);
}
export async function sair() { user = null; obs(null); }
export async function carregarRegistro() { return JSON.parse(JSON.stringify(db.registro)); }
export async function cadastrarLoja(l) {
  if (db.registro[l.id]) throw Object.assign(new Error('Essa loja já está cadastrada.'), { code: 'ja-existe' });
  db.registro[l.id] = { nome: l.nome, sistema: 'cell', firebaseConfig: l.firebaseConfig, criadoEm: Date.now() };
}
export async function renomearLoja(id, nome) { db.registro[id].nome = nome; }
export async function excluirLoja(id, senha) {
  if (senha !== 'ok123') throw Object.assign(new Error('Senha incorreta.'), { code: 'senha' });
  delete db.registro[id]; delete db.historico[id]; delete db.lic[id];
}
export async function arquivarLoja(id, a) { db.registro[id].arquivada = !!a; }
export async function registrarHistorico(id, e) {
  window.__chamadas.push++;
  for (const [k, v] of Object.entries(e)) if (v === undefined) throw new Error('undefined em ' + k);   // o Firebase real rejeita
  (db.historico[id] = db.historico[id] || []).push(Object.assign({ em: Date.now() }, e));
}
export async function lerHistorico(id) { return (db.historico[id] || []).slice(-10).reverse(); }
export async function lerLicenca(loja) {
  await new Promise(r => setTimeout(r, 30));
  if (loja.id === 'mudo') throw { code: 'timeout' };
  return JSON.parse(JSON.stringify(db.lic[loja.id] || {}));
}
export async function testarLoja(c) {
  if (c.projectId === 'quebrada') throw { code: 'PERMISSION_DENIED' };
  return db.lic[c.projectId] ? { ...db.lic[c.projectId] } : {};
}
export async function gravarLicencaInicial(c, v) { db.lic[c.projectId] = { bloqueado: false, vencimento: v }; return { ...db.lic[c.projectId] }; }
export async function renovar(loja, op) {
  window.__chamadas.renovar++;
  await new Promise(r => setTimeout(r, 120));
  const r = decidirRenovacao(db.lic[loja.id] || null, op);
  if (r.conflito) throw Object.assign(new Error('A data dessa loja mudou enquanto você olhava. Confira de novo.'), { code: 'conflito' });
  if (r.erro) throw new Error(r.erro);
  db.lic[loja.id] = r.novo; return { ...r.novo };
}
export async function definirVencimento(loja, v) { db.lic[loja.id] = { ...(db.lic[loja.id] || { bloqueado: false }), vencimento: v }; return { ...db.lic[loja.id] }; }
export async function definirBloqueio(loja, b) { db.lic[loja.id] = { ...(db.lic[loja.id] || {}), bloqueado: !!b }; return { ...db.lic[loja.id] }; }
export async function listarSmart() { return JSON.parse(JSON.stringify(db.smart)); }
export async function lerAcessoSmart() { return JSON.parse(JSON.stringify(db.acesso)); }
const erroFn = (msg, code = 'functions/invalid-argument') => Object.assign(new Error(msg), { code });
const smartDe = id => db.smart.find(x => x.lojaId === id);
export async function suspenderSmart(id, motivo) {
  if (!motivo) throw erroFn('Descreva o motivo da suspensão.');
  db.acesso[id] = { bloqueada: true, motivo, em: Date.now(), por: 'U1' };
}
export async function reativarSmart(id) { delete db.acesso[id]; }
export async function renomearSmart(id, nome) { smartDe(id).nome = nome; }
export async function trocarSenhaSmart(uid, senha) {
  if (senha.length < 6) throw erroFn('A senha precisa ter pelo menos 6 caracteres.');
  window.__senhaUsada = { uid, senha };
}
export async function trocarEmailSmart(uid, email) {
  for (const s of db.smart) for (const m of s.membros) if (m.uid === uid) m.email = email;
}
