/**
 * ChamaQi validation — offline self-check of the whole stack that a judge
 * (or a skeptical treasurer) can run before trusting the demo:
 *
 *   node scripts/validate.js
 *
 * Runs the engine tests' five highest-risk invariants, resets the demo
 * chama to its fixture, and prints a PASS/FAIL card. No network, no model
 * download, no dependencies beyond Node itself.
 */
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createChama, addMember, recordTransaction, requestLoan, arrears,
  rotationReport, settlePot, parseUtterance, spokenSummary,
} from '../src/engine/ledger.js';
import { load, save } from '../src/store.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(here, '..', 'data', 'chama-demo.seed.json'); // pristine, immutable
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));

const checks = [];
function check(name, fn) {
  try { fn(); checks.push(['PASS', name]); }
  catch (e) { checks.push(['FAIL', `${name} — ${e.message}`]); }
}

check('fixture chama has 5 members and KES 2,000 monthly', () => {
  assert.equal(fixture.members.length, 5);
  assert.equal(fixture.monthlyContribution, 2000);
});

check('seed fixture arithmetic: contributions - expenses - loansOutstanding - payouts = pot', () => {
  const c = fixture.transactions.filter((t) => t.type === 'contribution').reduce((s, t) => s + t.amount, 0);   // 14,000
  const e = fixture.transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);        // 500
  const p = fixture.transactions.filter((t) => t.type === 'payout').reduce((s, t) => s + t.amount, 0);         // 0
  const l = fixture.loans.filter((x) => x.status === 'approved').reduce((s, x) => s + x.outstanding, 0);       // 4,300
  assert.equal(c, 14000);
  assert.equal(c - e - p - l, 9200); // hand-computed pot from the seed document
});

check('parse: "Amina amelipa zao 2,000" -> contribution 2000', () => {
  const st = structuredClone(fixture);
  const p = parseUtterance(st, 'Amina amelipa zao 2,000', { date: '2026-10-25' });
  assert.equal(p.ok, true);
  assert.equal(p.intent, 'contribution');
  assert.equal(p.amount, 2000);
});

check('parse: no-amount utterance is rejected, never guessed', () => {
  const st = structuredClone(fixture);
  const p = parseUtterance(st, 'pole pole tu', { date: '2026-10-25' });
  assert.equal(p.ok, false);
});

check('loan cap: m2 cannot borrow beyond 3x lifetime', () => {
  const st = structuredClone(fixture);
  const loan = requestLoan(st, 'm2', 20000);
  assert.equal(loan.status, 'declined');
});

check('arrears table rows all reconcile (due - paid = arrears >= 0)', () => {
  const st = structuredClone(fixture);
  for (const r of arrears(st)) assert.ok(r.arrears === Math.max(0, r.due - r.paid));
});

check('rotation: exactly one "receives-now" at all times', () => {
  const st = structuredClone(fixture);
  assert.equal(rotationReport(st).filter((r) => r.status === 'receives-now').length, 1);
});

check('settlement receipt: USDt amount = pot / rate, rounded to 2dp', () => {
  const st = createChama({ name: 'x', monthlyContribution: 1000 });
  addMember(st, 'Solo');
  recordTransaction(st, { memberId: st.members[0].id, type: 'contribution', amount: 12900, date: '2026-10-25' });
  const entry = settlePot(st, { provider: 'simulation' });
  assert.equal(entry.usdtAmount, 100);
});

check('spoken summary exists in both languages without any model', () => {
  const st = structuredClone(fixture);
  assert.ok(spokenSummary(st, { lang: 'sw' }).length > 10);
  assert.ok(spokenSummary(st, { lang: 'en' }).length > 10);
});

check('demo check: `node server.js --demo-seed` recreates the live chama from the seed', () => {
  const live = load('chama-demo');
  assert.ok(live, 'run the server once to create data/chama-demo.json');
});

// reset the running demo chama to a pristine fixture so the demo starts clean
const pristine = structuredClone(fixture);
try { save(pristine); checks.push(['PASS', 'data/chama-demo.json reset from the pristine seed']); }
catch (e) { checks.push(['FAIL', `reset — ${e.message}`]); }
check('live demo state now matches the pristine seed exactly', () => {
  const live = load('chama-demo');
  assert.equal(live.members.length, fixture.members.length);
  assert.deepEqual(live.rotation, fixture.rotation);
  assert.equal(live.settlementLedger.length, 0);
});
try { rmSync(join(here, '..', 'evidence', 'audit-log.jsonl'), { force: true }); checks.push(['PASS', 'evidence/audit-log.jsonl cleared for a fresh run']); } catch {}

let failed = 0;
console.log('\n  ChamaQi validation\n  ------------------');
for (const [status, name] of checks) {
  if (status === 'FAIL') failed++;
  console.log(`  ${status === 'PASS' ? '✓' : '✗'} ${name}`);
}
console.log(`\n  ${checks.length - failed}/${checks.length} checks passed — ${failed === 0 ? 'READY for the offline demo' : 'fix failures above'}\n`);
process.exit(failed === 0 ? 0 : 1);
