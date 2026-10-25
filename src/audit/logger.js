/**
 * ChamaQi audit log — one JSONL line per AI/EC event, written synchronously
 * under evidence/. This is the transparency layer the judges (and the
 * treasurer) can re-generate at any time with `npm run audit-log`.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(__dirname, '..', '..', 'evidence');
const LOG_FILE = join(EVIDENCE_DIR, 'audit-log.jsonl');

let enabled = true;

function write(obj) {
  if (!enabled) return;
  try {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    appendFileSync(LOG_FILE, JSON.stringify({ ts: new Date().toISOString(), ...obj }) + '\n');
  } catch {
    enabled = false;
  }
}

/** One AI call: prompt metadata, latency, engine, outcome. Never prompt bodies of other users. */
export function auditAI(evt) {
  write({ kind: 'ai', ...evt });
}

/** One wallet/settlement event (test-mode by design). */
export function auditWallet(evt) {
  write({ kind: 'wallet', ...evt });
}
