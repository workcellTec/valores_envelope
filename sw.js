// ── VortexCell SW — versão com cache bust forçado ─────────────
const CACHE_NAME = 'vortexcell-v13';

const STATIC_FILES = [
    './',
    './index.html',
    './login.html',
    './style.css',
    './repairs.js',
    './estoque.js',
    './firebase-config.js',
    './manifest.json'
];

// Instala e força atualização
self.addEventListener('install', event => {
    console.log('[SW] Instalando', CACHE_NAME);
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(STATIC_FILES).catch(err => {
                console.warn('[SW] Falha ao cachear alguns arquivos:', err);
            });
        }).then(() => self.skipWaiting()) // Força ativação imediata
    );
});

// Ativa e limpa caches antigos
self.addEventListener('activate', event => {
    console.log('[SW] Ativando', CACHE_NAME);
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(k => k !== CACHE_NAME)
                    .map(k => {
                        console.log('[SW] Removendo cache antigo:', k);
                        return caches.delete(k);
                    })
            );
        }).then(() => self.clients.claim()) // Toma controle imediatamente
    );
});

// Fetch: Network First para HTML/JS/CSS, Cache First para imagens
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Sempre busca da rede para HTML e JS principais
    const networkFirst = ['.html', '.js', '.css', '.json'].some(ext =>
        url.pathname.endsWith(ext)
    );

    if (networkFirst) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => caches.match(event.request)) // Fallback pro cache
        );
    } else {
        // Cache First para imagens e recursos externos
        event.respondWith(
            caches.match(event.request).then(cached => {
                return cached || fetch(event.request).catch(() => cached);
            })
        );
    }
});
