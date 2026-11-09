// data.js — toda a conversa com o Firebase fica aqui (o app.js só chama estas funções).
import { initializeApp, getApp, deleteApp } from 'https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js';
import { getDatabase, ref, get, set, update, push, runTransaction, query, limitToLast, orderByKey } from 'https://www.gstatic.com/firebasejs/11.9.1/firebase-database.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/11.9.1/firebase-functions.js';
import { PAINEL_CONFIG, SMART_CONFIG, TIMEOUT_MS } from './config.js';
import { decidirRenovacao } from './lib.js';

const painel = initializeApp(PAINEL_CONFIG);
const painelAuth = getAuth(painel);
const painelDb = getDatabase(painel);
const smart = initializeApp(SMART_CONFIG, 'smart');
const smartAuth = getAuth(smart);
const smartFn = getFunctions(smart);

// ── Utilidades ─────────────────────────────────────────────────
export const comTimeout = (p, ms = TIMEOUT_MS) => Promise.race([
  p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('sem resposta'), { code: 'timeout' })), ms)),
]);
export const codigo = e => (e && (e.code || e.message)) || 'erro';

const MSG_AUTH = {
  'auth/invalid-credential': 'E-mail ou senha incorretos.', 'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'E-mail ou senha incorretos.', 'auth/invalid-email': 'E-mail inválido.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco.', 'auth/network-request-failed': 'Sem internet.',
};
export const msgAuth = e => MSG_AUTH[codigo(e)] || `Erro ao entrar (${codigo(e)}).`;

// ── Login ──────────────────────────────────────────────────────
export const observarLogin = cb => onAuthStateChanged(painelAuth, u => cb(u));
export const usuarioAtual = () => painelAuth.currentUser;
export const observarSmart = cb => onAuthStateChanged(smartAuth, u => cb(!!u));

export async function entrar(email, senha) {
  // VortexSmart primeiro: quando o login do painel dispara a tela, a sessão do Smart já existe (senão a lista do Smart falharia por corrida)
  try { await signInWithEmailAndPassword(smartAuth, email, senha); } catch (e) { /* VortexSmart fica indisponível, o resto funciona */ }
  await signInWithEmailAndPassword(painelAuth, email, senha);                 // falhou: mostra o erro
}
export async function sair() { await Promise.allSettled([signOut(painelAuth), signOut(smartAuth)]); }

// ── Lista de lojas (projeto do painel) ─────────────────────────
export async function carregarRegistro() {
  const snap = await comTimeout(get(ref(painelDb, 'lojas')));
  return snap.exists() ? snap.val() : {};
}

export async function cadastrarLoja(loja) {   // loja = { id, nome, firebaseConfig }
  const dados = { nome: loja.nome, sistema: 'cell', firebaseConfig: loja.firebaseConfig, criadoEm: Date.now() };
  const r = await comTimeout(runTransaction(ref(painelDb, `lojas/${loja.id}`), cur => (cur ? undefined : dados)));
  if (!r.committed) throw Object.assign(new Error('Essa loja já está cadastrada.'), { code: 'ja-existe' });
}
export const renomearLoja = (id, nome) => comTimeout(update(ref(painelDb, `lojas/${id}`), { nome }));
export const arquivarLoja = (id, arquivada) => comTimeout(update(ref(painelDb, `lojas/${id}`), { arquivada: !!arquivada }));

// ── Histórico de ações ─────────────────────────────────────────
export async function registrarHistorico(lojaId, entrada) {
  await comTimeout(push(ref(painelDb, `historico/${lojaId}`), Object.assign({ em: Date.now() }, entrada)));
}
export async function lerHistorico(lojaId) {
  const snap = await comTimeout(get(query(ref(painelDb, `historico/${lojaId}`), orderByKey(), limitToLast(10))));
  const itens = [];
  snap.forEach(c => { itens.push(c.val()); });
  return itens.reverse();
}

// ── Banco de cada loja VortexCell (config/licenca) ─────────────
// Mesmo caminho e mesmo formato que o app da loja e o Terminal antigo usam: { bloqueado: boolean, vencimento: 'AAAA-MM-DD' }
const conexoes = new Map();
function licRef(loja) {
  let c = conexoes.get(loja.id);
  if (!c) {
    const nome = 'loja-' + loja.id;
    let app; try { app = getApp(nome); } catch (e) { app = initializeApp(loja.firebaseConfig, nome); }
    c = ref(getDatabase(app), 'config/licenca');
    conexoes.set(loja.id, c);
  }
  return c;
}

export async function lerLicenca(loja) {
  const snap = await comTimeout(get(licRef(loja)));
  return snap.exists() ? snap.val() : {};
}

// Testa um config novo (loja ainda não cadastrada) e solta a conexão de teste
export async function testarLoja(config) {
  const nome = 'teste-' + config.projectId + '-' + Date.now();
  const app = initializeApp(config, nome);
  try {
    const snap = await comTimeout(get(ref(getDatabase(app), 'config/licenca')));
    return snap.exists() ? snap.val() : {};
  } finally { deleteApp(app).catch(() => {}); }
}

// Grava a licença de uma loja ainda não cadastrada (usa a mesma conexão de teste)
export async function gravarLicencaInicial(config, vencimento) {
  const nome = 'ini-' + config.projectId + '-' + Date.now();
  const app = initializeApp(config, nome);
  try {
    const r = ref(getDatabase(app), 'config/licenca');
    await comTimeout(update(r, { bloqueado: false, vencimento }));
    return (await comTimeout(get(r))).val();
  } finally { deleteApp(app).catch(() => {}); }
}

// Renovação em transação: a base é lida do banco NA HORA da gravação, não da tela (clique duplo ou 2 aparelhos não somam 60 dias).
export async function renovar(loja, opcoes) {
  const r = licRef(loja);
  let resultado = null;
  const tx = await comTimeout(runTransaction(r, cur => {
    resultado = decidirRenovacao(cur, opcoes);
    return resultado.novo;                 // undefined cancela (conflito / erro)
  }), 12000);
  if (!tx.committed) {
    if (resultado && resultado.conflito) throw Object.assign(new Error('A data dessa loja mudou enquanto você olhava. Confira de novo.'), { code: 'conflito' });
    if (resultado && resultado.erro) throw new Error(resultado.erro);
    throw new Error('Não gravou.');
  }
  return tx.snapshot.val();
}

async function gravarERele(loja, dados) {
  const r = licRef(loja);
  await comTimeout(update(r, dados));
  return (await comTimeout(get(r))).val() || {};   // devolve o que realmente ficou gravado
}
export const definirVencimento = (loja, vencimento) => gravarERele(loja, { vencimento });
export const definirBloqueio = (loja, bloqueado) => gravarERele(loja, { bloqueado: !!bloqueado });

// ── VortexSmart (somente leitura na fase 1) ────────────────────
export async function listarSmart() {
  await smartAuth.authStateReady();   // ao abrir o app, a sessão salva do VortexSmart ainda está sendo restaurada
  if (!smartAuth.currentUser) throw Object.assign(new Error('Sem login no VortexSmart.'), { code: 'sem-login' });
  const r = await comTimeout(httpsCallable(smartFn, 'adminListarLojas')(), 20000);
  return (r.data && r.data.lojas) || [];
}
