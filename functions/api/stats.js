// GET /api/stats?key=...  -> summary for the private stats page. Key lives in the STATS_KEY secret.
import { ensureTable, today } from './hit.js';

function sameKey(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0;
}
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function onRequestGet({ request, env }) {
  if (!env.STATS_KEY || !env.DB) return json({ ok: false, error: 'setup', missing: [!env.DB && 'DB', !env.STATS_KEY && 'STATS_KEY'].filter(Boolean) }, 503);
  const key = new URL(request.url).searchParams.get('key') || '';
  if (!sameKey(key, env.STATS_KEY)) return json({ ok: false, error: 'key' }, 401);
  await ensureTable(env.DB);
  const t = today();
  const since = new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);
  const q = (sql, ...args) => env.DB.prepare(sql).bind(...args).all().then(r => r.results);
  const [totals, todayRows, daily, countries, refs] = await Promise.all([
    q(`SELECT page, kind, SUM(n) AS n FROM hits GROUP BY page, kind`),
    q(`SELECT page, kind, SUM(n) AS n FROM hits WHERE day = ?1 GROUP BY page, kind`, t),
    q(`SELECT day, page, SUM(n) AS n FROM hits WHERE kind = 'view' AND day >= ?1 GROUP BY day, page ORDER BY day`, since),
    q(`SELECT country, SUM(n) AS n FROM hits WHERE kind = 'view' GROUP BY country ORDER BY n DESC LIMIT 12`),
    q(`SELECT ref, SUM(n) AS n FROM hits WHERE kind = 'view' AND ref <> '' GROUP BY ref ORDER BY n DESC LIMIT 12`)
  ]);
  return json({ ok: true, today: t, since, totals, todayRows, daily, countries, refs });
}
