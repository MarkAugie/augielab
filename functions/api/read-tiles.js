// POST /api/read-tiles  {image: base64 JPEG, style: 'dots'|'nums'}
//   -> {ok, tiles: [{a, b, sure}], note}
// Sends the photo to Claude to read the dominoes. The key lives in the ANTHROPIC_API_KEY secret
// (Cloudflare Pages > Settings > Variables and Secrets). Photos are not stored anywhere.
// A daily cap (MT_DAILY_CAP, default 150 photos) protects the prepaid credit.
import { dbOf, today } from './hit.js';

const MODEL_DEFAULT = 'claude-sonnet-5-5';
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const TOOL = {
  name: 'report_tiles',
  description: 'Report every domino tile visible in the photo.',
  input_schema: {
    type: 'object',
    properties: {
      tiles: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            a: { type: 'integer', minimum: 0, maximum: 12, description: 'Number on one half (0 = blank)' },
            b: { type: 'integer', minimum: 0, maximum: 12, description: 'Number on the other half (0 = blank)' },
            sure: { type: 'boolean', description: 'false if glare, blur, an angle or a hidden half makes either number uncertain' },
          },
          required: ['a', 'b', 'sure'],
        },
      },
      note: { type: 'string', description: 'One short sentence for the player if something made the photo hard to read; empty otherwise' },
    },
    required: ['tiles', 'note'],
  },
};

function prompt(style) {
  return `This is a photo of a player's dominoes from a Double-12 set (each half shows 0 to 12; 0 is blank).
${style === 'nums'
    ? 'This set shows numerals instead of dots. 6 and 9 are usually underlined to tell them apart; use the underline and the tile\'s orientation.'
    : 'This set uses dots (pips). Halves with 10, 11 or 12 dots are arranged in three columns (4-2-4, 4-3-4, 4-4-4). Count every dot carefully, one half at a time; dot colors may differ by number but do not rely on color alone.'}
List every tile you can see exactly once, with the numbers on its two halves. A full Double-12 set has only one of each tile, so the same pair should never appear twice.
If a tile is only partly visible, or glare or blur makes a count uncertain, give your best reading and set sure to false.
Ignore anything that isn't a domino. Call report_tiles with the result.`;
}

async function underCap(env) {
  const DB = dbOf(env);
  if (!DB) return true;
  const cap = parseInt(env.MT_DAILY_CAP, 10) || 150;
  try {
    await DB.prepare('CREATE TABLE IF NOT EXISTS photo_use (day TEXT PRIMARY KEY, n INTEGER)').run();
    const row = await DB.prepare(`INSERT INTO photo_use (day, n) VALUES (?1, 1)
      ON CONFLICT (day) DO UPDATE SET n = n + 1 RETURNING n`).bind(today()).first();
    return !row || row.n <= cap;
  } catch (e) { return true; }
}

export async function onRequestPost({ request, env }) {
  if (!env.ANTHROPIC_API_KEY) return json({ ok: false, error: 'setup' }, 503);

  const origin = request.headers.get('origin') || '';
  if (origin && !/^https:\/\/([a-z0-9-]+\.)?augielab\.(dev|pages\.dev)$/.test(origin)) return json({ ok: false, error: 'origin' }, 403);

  const body = await request.json().catch(() => null);
  const image = body && typeof body.image === 'string' ? body.image.replace(/^data:image\/\w+;base64,/, '') : '';
  if (!image || image.length > 6_000_000) return json({ ok: false, error: 'image' }, 400);
  const style = body.style === 'nums' ? 'nums' : 'dots';

  if (!(await underCap(env))) return json({ ok: false, error: 'cap' }, 429);

  let r;
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': String(env.ANTHROPIC_API_KEY).trim(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: env.MT_MODEL || MODEL_DEFAULT,
        max_tokens: 2000,
        tools: [TOOL],
        tool_choice: { type: 'tool', name: 'report_tiles' },
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
          { type: 'text', text: prompt(style) },
        ] }],
      }),
    });
  } catch (e) { return json({ ok: false, error: 'network' }, 502); }

  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    const error = r.status === 401 ? 'key' : /credit|billing/i.test(detail) ? 'credit' : 'api';
    return json({ ok: false, error, status: r.status }, 502);
  }
  const data = await r.json().catch(() => null);
  const use = data && (data.content || []).find(c => c.type === 'tool_use');
  if (!use) return json({ ok: false, error: 'read' }, 502);

  const seen = new Set(), tiles = [];
  for (const t of use.input.tiles || []) {
    const a = Math.max(t.a, t.b), b = Math.min(t.a, t.b);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a > 12 || b < 0) continue;
    const k = `${a}-${b}`; if (seen.has(k)) continue; seen.add(k);
    tiles.push({ a, b, sure: t.sure !== false });
  }
  return json({ ok: true, tiles, note: String(use.input.note || '').slice(0, 200) });
}
