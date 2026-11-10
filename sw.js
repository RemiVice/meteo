// Toujours prendre la version la plus récente sur Internet (sans copie périmée) ;
// la copie gardée ne sert que si le téléphone n'a pas de connexion.
const VERSION = 'meteo-web-5';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(caches.keys()
  .then((k) => Promise.all(k.filter((x) => x !== VERSION).map((x) => caches.delete(x))))
  .then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return; // les données météo : toujours en direct
  e.respondWith(fetch(e.request, { cache: 'no-cache' })
    .then((r) => { const c = r.clone(); caches.open(VERSION).then((x) => x.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
