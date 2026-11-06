/* Service worker: витрина ставится как приложение и открывается без сети.
   Оболочка — из кэша, данные (games.json, ratings.json) — сначала из сети, картинки — из кэша по мере просмотра. */
const V = 'bm-v3';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'games.json', 'manifest.webmanifest',
  'assets/logo-192.png', 'assets/logo-512.png', 'assets/favicon.png', 'assets/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // игры в shorts/ живут своей жизнью: не кэшируем, чтобы обновления доходили сразу
  if (url.pathname.includes('/shorts/') && url.pathname.endsWith('.html')) return;
  const fresh = /\.(json|html|js|css)$/.test(url.pathname) || url.pathname.endsWith('/');
  if (fresh) {
    e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
  } else {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
      if (r.ok) { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); }
      return r;
    })));
  }
});
