// lib.js — regras do painel em funções puras (sem Firebase, sem DOM). Tudo aqui é testado em test/lib.test.mjs.
// Datas são sempre texto AAAA-MM-DD, calculadas pelo fuso de Brasília (o mesmo dia que as lojas enxergam).

export const FUSO = 'America/Sao_Paulo';
export const DIAS_CREDITO = 30;
export const DIAS_AVISO = 5;      // mesma regra dos apps das lojas: avisa nos 5 dias finais
export const DIAS_TESTE = 7;

const pad = n => String(n).padStart(2, '0');
export const isoDe = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

// Só aceita data que existe no calendário (2026-02-30 não passa)
export function parseISO(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}

// Dia de hoje em Brasília (parâmetro `agora` existe só para os testes)
export function hojeISO(agora = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
  return partes; // en-CA já formata como AAAA-MM-DD
}

export const dmy = s => { const p = parseISO(s); return p ? `${pad(p.d)}/${pad(p.m)}/${p.y}` : '—'; };
export const dm = s => { const p = parseISO(s); return p ? `${pad(p.d)}/${pad(p.m)}` : '—'; };

const diasUTC = p => Date.UTC(p.y, p.m - 1, p.d) / 86400000;

// Dias de `s` até `hoje` (hoje = 0, amanhã = 1, ontem = -1). Data inválida: null.
export function diasAte(s, hoje) {
  const a = parseISO(s), b = parseISO(hoje);
  return a && b ? Math.round(diasUTC(a) - diasUTC(b)) : null;
}

export function somaDias(s, n) {
  const p = parseISO(s);
  if (!p) return null;
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return isoDe(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

// ── Renovação ──────────────────────────────────────────────────
// base: 'vencimento' (a partir do vencimento atual; sem data, a partir de hoje) | 'hoje' | 'data' (dataBase)
export function planoRenovar({ vencimentoAtual, hoje, base = 'vencimento', dataBase = '' }) {
  let origem;
  if (base === 'hoje') origem = hoje;
  else if (base === 'data') {
    if (!parseISO(dataBase)) return { erro: 'Escolha uma data válida para contar os 30 dias.' };
    origem = dataBase;
  } else origem = parseISO(vencimentoAtual) ? vencimentoAtual : hoje;
  const para = somaDias(origem, DIAS_CREDITO);
  return { de: parseISO(vencimentoAtual) ? vencimentoAtual : null, origem, para, aindaVencida: diasAte(para, hoje) < 0 };
}

// Roda DENTRO da transação do Firebase. `cur` é o que está gravado agora (null = ainda não sincronizado ou vazio).
// Nunca grava uma data diferente da que o usuário viu (`esperado`): se mudou no meio do caminho, aborta.
export function decidirRenovacao(cur, { base, dataBase, hoje, esperado, liberar }) {
  const atual = cur && typeof cur === 'object' ? cur : null;
  const plano = planoRenovar({ vencimentoAtual: atual && atual.vencimento, hoje, base, dataBase });
  if (plano.erro) return { erro: plano.erro };
  if (atual && esperado && plano.para !== esperado) return { conflito: true, atual: plano.para };
  const novo = Object.assign({}, atual || {}, { vencimento: plano.para });
  if (liberar) novo.bloqueado = false;
  else if (!atual || typeof novo.bloqueado !== 'boolean') novo.bloqueado = !!(atual && atual.bloqueado);
  return { novo, plano };
}

// ── Estado exibido de cada loja ───────────────────────────────
// cfg = config/licenca da loja ({ bloqueado, vencimento }). Mesma regra dos apps: bloqueia no dia seguinte ao vencimento.
// cat: 'ativa' | 'vencendo' | 'bloqueada' | 'semresposta' | 'carregando'
export function estadoDe({ carregando, erro, cfg }, hoje) {
  if (carregando) return { cat: 'carregando', k: 'mud', ord: 5, num: '…', chip: 'carregando', d: null };
  if (erro) return { cat: 'semresposta', k: 'mud', ord: 1, num: '?', chip: 'Sem resposta', d: null, erro };
  const c = cfg || {};
  const d = diasAte(c.vencimento, hoje);
  if (c.bloqueado === true) {
    return { cat: 'bloqueada', k: 'bad', ord: 0, bloq: true, manual: true, num: '', chip: 'Bloqueio manual', d };
  }
  if (d !== null && d < 0) {
    return { cat: 'bloqueada', k: 'bad', ord: 0, bloq: true, manual: false, num: '', chip: `Bloqueou sozinha · ${dm(somaDias(c.vencimento, 1))}`, d };
  }
  if (d === null) return { cat: 'ativa', k: 'mud', ord: 4, num: '—', chip: 'Sem vencimento', d };
  if (d <= DIAS_AVISO) return { cat: 'vencendo', k: 'warn', ord: 3, num: String(d), chip: d === 0 ? 'Vence hoje' : `Vence ${dm(c.vencimento)}`, d };
  return { cat: 'ativa', k: 'ok', ord: 4, num: String(d), chip: `Vence ${dm(c.vencimento)}`, d };
}

export function contagens(estados) {
  const r = { total: estados.length, ativa: 0, vencendo: 0, bloqueada: 0, semresposta: 0, carregando: 0 };
  estados.forEach(e => { r[e.cat]++; });
  return r;
}

export function ordenar(itens) {   // itens: [{ nome, est }]
  return itens.slice().sort((a, b) => a.est.ord - b.est.ord || (a.est.d ?? 1e9) - (b.est.d ?? 1e9) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

// ── Entradas digitadas ─────────────────────────────────────────
const CHAVES_CONFIG = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId'];

// Aceita o firebaseConfig colado do Console (objeto JS, JSON ou "const firebaseConfig = {...}")
export function parseFirebaseConfig(texto) {
  const t = String(texto || '');
  const cfg = {};
  const re = new RegExp(`["']?(${CHAVES_CONFIG.join('|')})["']?\\s*:\\s*["'\`]([^"'\`]+)["'\`]`, 'g');
  let m;
  while ((m = re.exec(t))) cfg[m[1]] = m[2].trim();
  if (!cfg.projectId || !cfg.apiKey) return { erro: 'Não achei apiKey e projectId. Cole o firebaseConfig inteiro.' };
  if (!cfg.databaseURL) return { erro: 'Falta o databaseURL. Crie o Realtime Database no projeto dessa loja e copie o config de novo.' };
  let u;
  try { u = new URL(cfg.databaseURL); } catch (e) { return { erro: 'databaseURL inválido.' }; }
  if (u.protocol !== 'https:' || !/(\.firebaseio\.com|\.firebasedatabase\.app)$/.test(u.hostname)) {
    return { erro: 'databaseURL não parece um Realtime Database do Firebase.' };
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(cfg.projectId)) return { erro: 'projectId inválido.' };
  return { config: cfg };
}

// "R$ 1.234,56" → 1234.56 | vazio → { valor: null } | inválido → { erro }
export function parseValor(texto) {
  let s = String(texto || '').replace(/R\$|\s/g, '');
  if (!s) return { valor: null };
  if (!/^\d[\d.,]*$/.test(s)) return { erro: 'Valor inválido. Use só números, ex: 150 ou 150,50.' };
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 1e7) return { erro: 'Valor inválido.' };
  return { valor: Math.round(n * 100) / 100 };
}

export const fmtValor = v => v == null ? '' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function validarNome(n) {
  const s = String(n || '').trim().replace(/\s+/g, ' ');
  if (!s) return { erro: 'Escreva o nome da loja.' };
  if (s.length > 60) return { erro: 'Nome muito longo (máx. 60).' };
  return { nome: s };
}

export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
