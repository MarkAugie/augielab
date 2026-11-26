// POST /api/hit  {page, kind, n, ref}  -> adds to a daily counter in D1 (binding: DB).
// Stores only: day, page, kind, country, referring website, count. Nothing personal.
const PAGES = ['/', '/split/', '/darts/', '/passwords/', '/dice/', '/pomodoro/', '/opscon/', '/jukebox/', '/monkeys/', '/future/', '/glitch/', '/train/', '/nopeek/', '/mexican/', '/dominoes/', '/benford/', '/fibonacci/', '/refinery/', '/muons/', '/gps/', '/chaos/', '/coast/', '/lightning/', '/mt/', '/showdown/', '/puzzle/', '/bridge/', '/ss/', '/triplets/'];
const KINDS = ['view', 'split', 'darts', 'password', 'roll', 'flip', 'lotto', 'round', 'minute', 'kkeys', 'phrase', 'guess', 'deal', 'hand', 'draw', 'kdigits', 'kbytes', 'muon', 'fix', 'kdots', 'flame', 'measure', 'growth', 'kparticles', 'solve', 'count', 'kbits', 'puzzle', 'solved', 'deal', 'klives'];
let ready = false;

export async function ensureTable(db) {
  if (ready) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS hits (
    day TEXT, page TEXT, kind TEXT, country TEXT, ref TEXT, n INTEGER,
    PRIMARY KEY (day, page, kind, country, ref))`).run();
  ready = true;
}

export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());

export const dbOf = env => env.DB || env['augielab--stats'] || env['augielab-stats'] || env.augielab_stats;

export async function onRequestPost({ request, env }) {
  const DB = dbOf(env);
  const done = new Response(null, { status: 204 });
  try {
    if (!DB) return done;
    const b = await request.json().catch(() => ({}));
    const page = PAGES.includes(b.page) ? b.page : null;
    const kind = KINDS.includes(b.kind) ? b.kind : null;
    if (!page || !kind) return done;
    const n = Math.min(100000, Math.max(1, parseInt(b.n, 10) || 1));
    const country = (request.cf && request.cf.country) || '??';
    let ref = '';
    if (kind === 'view' && b.ref) {
      try { const h = new URL(b.ref).hostname.replace(/^www\./, ''); if (!/augielab\.(dev|pages\.dev)$/.test(h)) ref = h.slice(0, 60); } catch (e) {}
    }
    await ensureTable(DB);
    await DB.prepare(`INSERT INTO hits (day, page, kind, country, ref, n) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
      ON CONFLICT (day, page, kind, country, ref) DO UPDATE SET n = n + excluded.n`)
      .bind(today(), page, kind, country, ref, n).run();
  } catch (e) {}
  return done;
}
