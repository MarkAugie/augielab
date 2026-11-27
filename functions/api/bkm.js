// POST /api/bkm  {text}  -> {ok, bkm}
// Turns messy troubleshooting notes (ticket thread, Slack, terminal history) into a structured
// Best Known Method plus a short quiz, using Claude. Text is redacted here before it leaves the server.
// Key: ANTHROPIC_API_KEY secret. Daily cap: BKM_DAILY_CAP (default 40). Model: BKM_MODEL (default claude-opus-5-5).
import { dbOf, today } from './hit.js';
import { recordUse } from './read-tiles.js';

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const redact = s => s
  .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '<ip>')
  .replace(/\b(?:[0-9a-f]{2}:){5}[0-9a-f]{2}\b/gi, '<mac>')
  .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
  .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
  .replace(/(Serial Number\s*:\s*)\S+/gi, '$1<serial>')
  .replace(/(password|passwd|token|apikey|api_key|secret)(\s*[=:]\s*)\S+/gi, '$1$2<redacted>');

const S = { type: 'string' }, SA = { type: 'array', items: { type: 'string' } };
const CMD = { type: 'array', items: { type: 'object', properties: { cmd: S, expect: S }, required: ['cmd', 'expect'] } };
const TOOL = {
  name: 'write_bkm',
  description: 'Return the Best Known Method and quiz.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Short, searchable: "<symptom> on <platform>: <cause>"' },
      summary: { type: 'string', description: 'Two sentences: what happens and what fixes it.' },
      tags: SA,
      platform: { type: 'string', description: 'Hardware/software this applies to, as stated or clearly implied in the notes.' },
      symptoms: { ...SA, description: 'How it shows up: alerts, errors, exact log signatures (Xid numbers, messages).' },
      quick_checks: { ...CMD, description: 'Fast commands to confirm this is the issue, with what you expect to see when it is.' },
      root_cause: { type: 'string' },
      fix_steps: { type: 'array', items: { type: 'object', properties: { step: S, cmd: S }, required: ['step'] }, description: 'Ordered. Drain before disruptive work. Use cmd only when there is a command.' },
      verify: { ...CMD, description: 'How to prove it is fixed before returning to service.' },
      escalate_when: { ...SA, description: 'Clear triggers for RMA / vendor case / escalation to L4.' },
      prevention: SA,
      customer_note: { type: 'string', description: 'Two or three calm, blame-free sentences a support engineer could send the affected customer.' },
      gaps: { ...SA, description: 'Things the notes did not establish that a reviewer should confirm. Empty if none.' },
      quiz: {
        type: 'array',
        description: '5 multiple-choice questions to train a new support engineer on this BKM. At least 2 must be "what do you run/do next" drills. Distractors must be plausible mistakes a junior would make.',
        items: { type: 'object', properties: { q: S, options: { type: 'array', items: S }, answer: { type: 'integer', description: '0-based index of the correct option' }, why: S }, required: ['q', 'options', 'answer', 'why'] },
      },
    },
    required: ['title', 'summary', 'tags', 'symptoms', 'quick_checks', 'root_cause', 'fix_steps', 'verify', 'escalate_when', 'prevention', 'customer_note', 'gaps', 'quiz'],
  },
};

const PROMPT = notes => `You are a senior L3/L4 support engineer at a GPU cloud (HGX/DGX H100/H200 clusters, NVLink/NVSwitch, InfiniBand, Slurm/Kubernetes, BMC/Redfish). A teammate solved a problem and left these messy notes. Turn them into a clean Best Known Method (BKM) that the next engineer can follow at 3 a.m., plus a short quiz for training new hires.

Rules:
- Base the BKM on what the notes show. You may add standard, well-known commands or checks that clearly fit, but do not invent facts about this incident (versions, part numbers, outcomes) that are not in the notes. List anything important that the notes leave unresolved under "gaps".
- Order matters: diagnose, drain before disruptive work, fix the cause, verify, then return to service.
- Keep commands copy-pasteable. Use <placeholders> for node names, bus IDs, IPs and similar.
- Quiz: exactly 5 questions, 4 options each, one correct answer, a one-sentence "why". At least 2 should be "what would you run or do next" drills. Wrong options should be realistic junior mistakes (e.g. RMA when a reset would do, resuming before verifying).
- Write plainly. No marketing language.

Call write_bkm with the result.

<notes>
${notes}
</notes>`;

async function underCap(env) {
  const DB = dbOf(env); if (!DB) return true;
  const cap = parseInt(env.BKM_DAILY_CAP, 10) || 40;
  try {
    await DB.prepare('CREATE TABLE IF NOT EXISTS bkm_use (day TEXT PRIMARY KEY, n INTEGER)').run();
    const row = await DB.prepare(`INSERT INTO bkm_use (day, n) VALUES (?1, 1) ON CONFLICT (day) DO UPDATE SET n = n + 1 RETURNING n`).bind(today()).first();
    return !row || row.n <= cap;
  } catch (e) { return true; }
}

export async function onRequestPost({ request, env }) {
  if (!env.ANTHROPIC_API_KEY) return json({ ok: false, error: 'setup' }, 503);
  const origin = request.headers.get('origin') || '';
  if (origin && !/^https:\/\/([a-z0-9-]+\.)?augielab\.(dev|pages\.dev)$/.test(origin)) return json({ ok: false, error: 'origin' }, 403);
  const body = await request.json().catch(() => null);
  const text = body && typeof body.text === 'string' ? redact(body.text).trim() : '';
  if (text.length < 80) return json({ ok: false, error: 'short' }, 400);
  if (text.length > 24000) return json({ ok: false, error: 'long' }, 400);
  if (!(await underCap(env))) return json({ ok: false, error: 'cap' }, 429);

  const model = env.BKM_MODEL || 'claude-opus-5-5';
  const ask = extra => fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': String(env.ANTHROPIC_API_KEY).trim(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(Object.assign({ model, max_tokens: 16000, tools: [TOOL], messages: [{ role: 'user', content: PROMPT(text) }] }, extra)),
  });
  let r;
  try { r = await ask({ tool_choice: { type: 'auto' } }); if (r.status === 400) r = await ask({}); }
  catch (e) { return json({ ok: false, error: 'network' }, 502); }
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    return json({ ok: false, error: r.status === 401 ? 'key' : /credit|billing/i.test(detail) ? 'credit' : 'api', status: r.status }, 502);
  }
  const data = await r.json().catch(() => null);
  await recordUse(env, (data && data.model) || model, data && data.usage);
  const content = (data && data.content) || [];
  let bkm = (content.find(c => c.type === 'tool_use') || {}).input;
  if (!bkm) {
    const t = content.filter(c => c.type === 'text').map(c => c.text).join('\n'), m = t.match(/\{[\s\S]*"title"[\s\S]*\}/);
    try { bkm = m && JSON.parse(m[0]); } catch (e) {}
  }
  if (!bkm || !bkm.title) return json({ ok: false, error: 'read' }, 502);
  bkm.quiz = (bkm.quiz || []).filter(q => Array.isArray(q.options) && q.options.length >= 2 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length).slice(0, 8);
  return json({ ok: true, bkm });
}
