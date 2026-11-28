// GET /api/splits -> {"ok":true,"total":N}: how many universes have been split on AugieLab, ever.
// Only the total count of 'split' events; nothing about who split them. Cached for a minute.
import { dbOf, ensureTable } from './hit.js';

export async function onRequestGet({ request, env }) {
  const DB = dbOf(env);
  const out = (obj, status = 200) => new Response(JSON.stringify(obj), {
    status, headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=60' } });
  if (!DB) return out({ ok: false }, 503);
  try {
    await ensureTable(DB);
    const row = await DB.prepare(`SELECT COALESCE(SUM(n), 0) AS total FROM hits WHERE kind = 'split'`).first();
    return out({ ok: true, total: row ? row.total : 0 });
  } catch (e) {
    return out({ ok: false }, 503);
  }
}
