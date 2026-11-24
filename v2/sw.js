/* Service worker Plan 18 · Cuaderno: precache del shell + medios, cache-first, soporte Range para video. */
const V = 'e26a733d';
const CACHE = 'p18-' + V;
const SHELL = ["./", "./index.html", "./app.js?v=e26a733d", "./app.css?v=e26a733d", "./app.js", "./app.css", "./plan.json", "./manifest.webmanifest", "./fonts/plexmono-400.woff2", "./fonts/plexmono-500.woff2", "./fonts/plexmono-600.woff2", "./fonts/instrument-serif-italic.woff2", "./fonts/instrument-serif.woff2", "./fonts/karla.woff2", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/maskable-512.png", "./icons/apple-touch-icon.png", "./media/sentadilla.jpg", "./media/banca.jpg", "./media/remo.jpg", "./media/pajaros.jpg", "./media/laterales.jpg", "./media/talones_pie.jpg", "./img/Natural_Glute_Ham_Raise_0.jpg", "./img/Natural_Glute_Ham_Raise_1.jpg", "./img/Pallof_Press_0.jpg", "./img/Pallof_Press_1.jpg", "./media/pmr.jpg", "./media/dominadas.jpg", "./media/militar.jpg", "./media/facepull.jpg", "./media/remo_polea.jpg", "./media/curlz.jpg", "./img/copenhagen.svg", "./media/prensa.jpg", "./media/inclinado.jpg", "./media/jalon.jpg", "./media/martillo.jpg", "./img/Triceps_Pushdown_0.jpg", "./img/Triceps_Pushdown_1.jpg", "./media/talones_sent.jpg"];
const MEDIA = ["./media/sentadilla.mp4", "./media/banca.mp4", "./media/remo.mp4", "./media/pajaros.mp4", "./media/laterales.mp4", "./media/talones_pie.mp4", "./media/pmr.mp4", "./media/dominadas.mp4", "./media/militar.mp4", "./media/facepull.mp4", "./media/remo_polea.mp4", "./media/curlz.mp4", "./media/prensa.mp4", "./media/inclinado.mp4", "./media/jalon.mp4", "./media/martillo.mp4", "./media/talones_sent.mp4"];
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(SHELL);
    await Promise.all(MEDIA.map(u => c.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('p18-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
async function rangeResponse(req, res) {
  const h = req.headers.get('range'); if (!h) return res;
  const buf = await res.arrayBuffer(); const total = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(h); let start = m && m[1] ? +m[1] : 0; let end = m && m[2] ? +m[2] : total - 1;
  if (!m || start >= total) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + total } });
  end = Math.min(end, total - 1);
  return new Response(buf.slice(start, end + 1), { status: 206, headers: { 'Content-Type': res.headers.get('Content-Type') || 'video/mp4', 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' } });
}
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== location.origin || !url.pathname.startsWith(new URL('./', self.registration.scope).pathname)) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    if (req.mode === 'navigate') { try { const net = await fetch(req); return net; } catch (x) { return (await c.match('./index.html')) || (await c.match('./')); } }
    const key = new Request(url.origin + url.pathname);
    let res = await c.match(key, { ignoreSearch: true });
    if (!res) {
      try { const net = await fetch(new Request(url.href)); if (net.ok && net.status === 200) { await c.put(key, net.clone()); } res = net; }
      catch (x) { return new Response('', { status: 504 }); }
    }
    if (req.headers.get('range') && res.status === 200) return rangeResponse(req, res.clone());
    return res;
  })());
});
