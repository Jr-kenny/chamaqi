/**
 * ChamaQi audit-log tooling.
 *
 *   npm run audit-log            -> summarize evidence/audit-log.jsonl
 *   npm run audit-log -- --generate
 *
 * `--generate` runs a scripted demo of the AI layer directly (no server, no
 * network, no model download required) and appends real audit rows: every
 * deterministic parse, one honest refusal, the chat-digest fallback path.
 * With `./run.sh --model` already warmed up, the same phrases additionally
 * exercise the QVAC LLM path on a live server — the JSONL rows of those runs
 * carry `engine: qvac-llm` with measured latencies.
 */
import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseUtterance, spokenSummary } from '../src/engine/ledger.js';
import { intentFrom, treasurerChat } from '../src/ai/index.js';
import { load } from '../src/store.js';

const here = dirname(fileURLToPath(import.meta.url));
const LOG = join(here, '..', 'evidence', 'audit-log.jsonl');

const generate = process.argv.includes('--generate');

if (generate) {
  const state = load('chama-demo');
  if (!state) {
    console.log('[chamaqi] no live chama file — run `node server.js` once first');
    process.exit(1);
  }
  mkdirSync(join(here, '..', 'evidence'), { recursive: true });
  const phrases = [
    'Amina amelipa zao 2,000',
    'Baraka ameomba mkopo elfu tatu',
    'Cheptoo alipokea kando mia tano',
    'gharama ya matumizi 500',
    'tunapokea mwanachama mpya Faith',
    'hakuna kitu leo', // honest refusal — captured as evidence, not hidden
  ];
  for (const text of phrases) {
    await intentFrom(structuredCloneJSON(state), text, { date: new Date().toISOString().slice(0, 10) });
  }
  const chat = await treasurerChat(structuredCloneJSON(state), 'Ngapi imerudishwa?', { lang: 'sw' });
  if (!chat.ok) console.log('[chamaqi] chat used the deterministic digest fallback (no LLM resident)');

  console.log('[chamaqi] demo rows appended to evidence/audit-log.jsonl\n');
}

function structuredCloneJSON(x) { return JSON.parse(JSON.stringify(x)); }

// ---- summarize ----
if (!existsSync(LOG)) {
  console.log('[chamaqi] evidence/audit-log.jsonl not found yet.\n  Use the app (or `npm run audit-log -- --generate`) with the demo halted, then rerun this command.');
  process.exit(0);
}

const rows = readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const ai = rows.filter((r) => r.kind === 'ai' && r.event === 'parse');
const chat = rows.filter((r) => r.kind === 'ai' && r.event === 'chat');
const loaded = rows.filter((r) => r.event === 'model_loaded');
const wallet = rows.filter((r) => r.kind === 'wallet');

const byEngine = {};
for (const r of ai) byEngine[r.engine] = (byEngine[r.engine] || 0) + 1;
const lats = ai.filter((r) => typeof r.latencyMs === 'number').map((r) => r.latencyMs).sort((a, b) => a - b);
const pct = (p) => (lats.length ? lats[Math.min(lats.length - 1, Math.floor(p * lats.length))] : 0);

console.log(`
  ChamaQi evidence report — ${rows.length} rows
  -----------------------------------------
  model loads      : ${loaded.length}
  parses           : ${ai.length}  (${Object.entries(byEngine).map(([k, v]) => `${k}: ${v}`).join(', ') || 'none'})
  parse latency    : p50 ${pct(0.5)}ms · p95 ${pct(0.95)}ms · max ${lats[lats.length - 1] ?? 0}ms
  chat calls       : ${chat.length}
  wallet events    : ${wallet.length} (test-mode by design)
  refusals kept    : ${ai.filter((r) => r.ok === false).length}
`);
