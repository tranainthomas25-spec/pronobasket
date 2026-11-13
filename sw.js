const CACHE = 'pronobasket-v5';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const memeSite = url.origin === location.origin;
  const polices = url.host.endsWith('fonts.googleapis.com') || url.host.endsWith('fonts.gstatic.com');
  if (!memeSite && !polices) return;
  e.respondWith(
    fetch(memeSite ? new Request(req.url, { cache: 'no-cache' }) : req)
      .then(r => { if (r.ok || r.type === 'opaque') { const copie = r.clone(); caches.open(CACHE).then(c => c.put(req, copie)); } return r; })
      .catch(() => caches.match(req))
  );
});
