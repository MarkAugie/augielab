// AugieLab quantum random numbers, from the Crypta Labs QCicada on the Pi at home.
//
// Browser pages call  /api/qrng?n=COUNT  and get {"ok":true,"values":[0..255,...],"source":"qcicada"}.
// This function asks the Pi through the Cloudflare Tunnel, adding the secret key, so the key never
// reaches a browser. If the Pi is off or slow, it answers ok:false quickly and the page falls back
// to the browser's own generator.
//
// Settings (Cloudflare Pages → Settings → Variables and Secrets):
//   QRNG_KEY  (secret)  the key from ~/qrng/qrng.env on the Pi
//   QRNG_URL  (optional) defaults to https://qrng.augielab.dev
//
// /api/qrng?health=1 returns the stick's status (no key or secrets in it) for the status strip and lab page.
// /api/qrng?signed=1 returns 32 fresh bytes signed by the stick's own key, for the "Prove it" button.

const CHUNK = 4096;          // the Pi hands out at most 4096 bytes per request
const MAX_N = 16384;         // a few pages ask for big batches; split them into chunks
const TIMEOUT_MS = 4000;

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

async function ask(env, path) {
  const base = (env.QRNG_URL || 'https://qrng.augielab.dev').replace(/\/$/, '');
  const res = await fetch(base + path, {
    headers: { 'X-QRNG-Key': env.QRNG_KEY },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cf: { cacheTtl: 0, cacheEverything: false },
  });
  const j = await res.json();
  return j;
}

export async function onRequestGet({ request, env }) {
  if (!env.QRNG_KEY) return json({ ok: false, error: 'quantum generator not configured' }, 503);
  const url = new URL(request.url);

  if (url.searchParams.has('health')) {
    // Every visitor's status strip polls this; keep one answer for 4 seconds so the Pi isn't asked by each of them.
    const cache = caches.default, ck = new Request(new URL('/__qrng_health_cache', url).toString());
    const hit = await cache.match(ck);
    if (hit) return json(await hit.json(), hit.status);
    let body, status = 200;
    try {
      const h = await ask(env, '/health');
      const keep = ['ok', 'buffer_bytes', 'read_total', 'served_total', 'requests', 'uptime_s', 'serial', 'firmware', 'hw_info', 'stick_speed', 'stick_generated', 'health_flags', 'error'];
      body = Object.fromEntries(keep.filter((k) => k in h).map((k) => [k, h[k]]));
    } catch (e) {
      body = { ok: false, error: 'quantum generator offline' }; status = 503;
    }
    const store = new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=4' } });
    try { await cache.put(ck, store); } catch (e) {}
    return json(body, status);
  }

  if (url.searchParams.has('signed')) {
    try {
      const s = await ask(env, '/signed?n=32');
      return json(s, s.ok ? 200 : 503);
    } catch (e) {
      return json({ ok: false, error: 'quantum generator offline' }, 503);
    }
  }

  let n = parseInt(url.searchParams.get('n') || '32', 10);
  if (!Number.isFinite(n)) n = 32;
  n = Math.max(1, Math.min(MAX_N, n));
  const parts = [];
  for (let left = n; left > 0; left -= CHUNK) parts.push(Math.min(CHUNK, left));
  try {
    const answers = await Promise.all(parts.map((k) => ask(env, `/random?n=${k}`)));
    if (answers.some((a) => !a || !a.ok || !Array.isArray(a.values))) throw new Error('not ready');
    const values = answers.flatMap((a) => a.values);
    return json({ ok: true, values, source: 'qcicada' });
  } catch (e) {
    return json({ ok: false, error: 'quantum generator offline' }, 503);
  }
}
