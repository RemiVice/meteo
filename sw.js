// Garde les fichiers de l'application pour qu'elle s'ouvre vite (la météo, elle, vient toujours d'Internet)
const VERSION = 'meteo-web-3';
const FICHIERS = ['./', 'index.html', 'style.css', 'app.js', 'fond.js', 'icones.js', 'manifest.webmanifest', 'icone-180.png', 'icone-192.png', 'extras.js'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FICHIERS))));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== VERSION).map((x) => caches.delete(x))))));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return; // les données météo : toujours en direct
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(VERSION).then((x) => x.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request)));
});
