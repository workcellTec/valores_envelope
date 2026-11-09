// sw.js — só guarda a "casca" do app para abrir mesmo sem internet. Os dados das lojas NUNCA são guardados aqui.
const CACHE = 'painel-vortex-1.3.0';   // mude junto com VERSAO em config.js
const CASCA = ['./', 'index.html', 'style.css', 'app.js', 'data.js', 'lib.js', 'config.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CASCA)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Arquivos do próprio app: internet primeiro (sempre a versão nova), cache só se estiver offline.
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;   // Firebase, fontes etc. passam direto
  e.respondWith(
    fetch(req, { cache: 'no-cache' }).then(res => {
      if (res.ok) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('index.html')))
  );
});
