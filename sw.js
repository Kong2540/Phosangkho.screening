/* Service Worker — เก็บตัวแอปไว้ในเครื่องเพื่อเปิดได้ตอนออฟไลน์
 * เมื่อแก้ไฟล์ใด ๆ ให้เปลี่ยนเลข CACHE ทุกครั้ง เครื่องผู้ใช้จะได้เวอร์ชันใหม่ */
const CACHE = 'eh-app-v1.0.0';
const FONTS = 'eh-fonts-v1';
const SHELL = ['./', './index.html', './app.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('eh-app-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;            // คำขอ POST ไป Apps Script ไม่ผ่าน cache
  const url = new URL(req.url);
  if (url.origin === location.origin) e.respondWith(staleWhileRevalidate(req));
  else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') e.respondWith(cacheFirst(req));
});

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await cache.match('./index.html') : undefined);
  const net = fetch(req).then(r => { if (r.ok) cache.put(req, r.clone()); return r; }).catch(() => null);
  if (hit) { net.catch(() => {}); return hit; }
  return (await net) || new Response('ออฟไลน์', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

async function cacheFirst(req) {
  const cache = await caches.open(FONTS);
  const hit = await cache.match(req);
  if (hit) return hit;
  try { const r = await fetch(req); if (r.ok || r.type === 'opaque') cache.put(req, r.clone()); return r; }
  catch (e) { return new Response('', { status: 504 }); }
}
