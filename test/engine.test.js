/**
 * ChamaQi engine tests — node:test, no dependencies.
 * Covers: Swahili/English parsing, word amounts, loan caps, arrears,
 * merry-go-round rotation, settlement ledger, spoken summaries.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createChama, addMember, recordTransaction, requestLoan, repayLoan,
  arrears, rotationReport, summary, settlePot, parseUtterance,
  spokenSummary, extractAmount, elapsedCycles,
} from '../src/engine/ledger.js';

function seed() {
  const st = createChama({ name: 'chama-ya-mifano', monthlyContribution: 2000, cycleStart: '2026-05-01' });
  addMember(st, 'Amina', { joined: '2026-05-01' });
  addMember(st, 'Baraka', { joined: '2026-05-01' });
  addMember(st, 'Cheptoo', { joined: '2026-05-01' });
  return st;
}

// ---------------- parsing ----------------

test('parses a plain Swahili contribution', () => {
  const st = seed();
  const p = parseUtterance(st, 'Amina amelipa zao 2,000', { date: '2026-10-20' });
  assert.equal(p.ok, true);
  assert.equal(p.intent, 'contribution');
  assert.equal(p.memberId, st.members[0].id);
  assert.equal(p.amount, 2000);
});

test('parses English contribution', () => {
  const st = seed();
  const p = parseUtterance(st, 'Baraka paid 2500', { date: '2026-10-20' });
  assert.equal(p.ok, true);
  assert.equal(p.intent, 'contribution');
  assert.equal(p.amount, 2500);
  assert.equal(p.memberId, st.members[1].id);
});

test('parses worded amounts: elfu tatu, mia tano, 2k', () => {
  assert.equal(extractAmount('ameleta elfu tatu'), 3000);
  assert.equal(extractAmount('mia tano tu'), 500);
  assert.equal(extractAmount('ameleta 2k'), 2000);
  assert.equal(extractAmount('zake 12,000'), 12000);
});

test('parses loan request with the roster member', () => {
  const st = seed();
  const p = parseUtterance(st, 'Baraka ameomba mkopo elfu tatu', { date: '2026-10-20' });
  assert.equal(p.ok, true);
  assert.equal(p.intent, 'loan_request');
  assert.equal(p.amount, 3000);
});

test('parses loan repayment against an open loan', () => {
  const st = seed();
  recordTransaction(st, { memberId: st.members[1].id, type: 'contribution', amount: 6000, date: '2026-05-10' });
  const loan = requestLoan(st, st.members[1].id, 3000, { issuedAt: '2026-05-12' });
  const p = parseUtterance(st, 'amerejesha mkopo elfu moja', { date: '2026-06-01' });
  assert.equal(p.ok, true);
  assert.equal(p.intent, 'loan_repayment');
  assert.equal(p.loanId, loan.id);
  assert.equal(p.amount, 1000);
});

test('parses kando payout', () => {
  const st = seed();
  const p = parseUtterance(st, 'Cheptoo alipokea kando mia tano', { date: '2026-10-20' });
  assert.equal(p.ok, true);
  assert.equal(p.intent, 'payout');
  assert.equal(p.amount, 500);
});

test('parses expense', () => {
  const st = seed();
  const p = parseUtterance(st, 'gharama ya matumizi 500', { date: '2026-10-20' });
  assert.equal(p.ok, true);
  assert.equal(p.intent, 'expense');
  assert.equal(p.amount, 500);
});

test('reconstructs a new member intent', () => {
  const st = seed();
  const p = parseUtterance(st, 'tunapokea mwanachama mpya Faith', { date: '2026-10-20' });
  assert.equal(p.ok, true);
  assert.equal(p.intent, 'add_member');
  assert.equal(p.name, 'faith');
});

test('rejects utterances with no amount or no member safely', () => {
  const st = seed();
  const p1 = parseUtterance(st, 'hakuna kitu', { date: '2026-10-20' });
  assert.equal(p1.ok, false);
  const p2 = parseUtterance(st, 'mgeni alipa 200', { date: '2026-10-20' });
  assert.equal(p2.ok, false);
});

test('a bare "kwa" is not a thousands multiplier ("9000 kwa" = 9,000)', () => {
  const st = seed();
  const p = parseUtterance(st, 'Amina alipokea kando 9000 kwa wiki hii', { date: '2026-10-20' });
  assert.equal(p.ok, true);
  assert.equal(p.intent, 'payout');
  assert.equal(p.amount, 9000);
});

test("bare trailing 'k' still multiplies (2k = 2000)", () => {
  assert.equal(extractAmount('awa 2k tu'), 2000);
});

// ---------------- engine ----------------

test('arrears accumulate correctly per cycle', () => {
  const st = seed();
  recordTransaction(st, { memberId: 'm1', type: 'contribution', amount: 2000, date: '2026-05-04' });
  // cycleStart 2026-05-01, as of 2026-10-20: 5 completed cycles (May–Sep), cycle 6 in progress
  const rows = arrears(st, { asOf: '2026-10-20' });
  const amina = rows.find((r) => r.name === 'Amina');
  assert.equal(amina.cycles, 5);
  assert.equal(amina.due, 10000);
  assert.equal(amina.paid, 2000);
  assert.equal(amina.arrears, 8000);
  assert.equal(amina.standing, 'behind');
});

test('loan cap blocks greedy borrowing', () => {
  const st = seed();
  recordTransaction(st, { memberId: 'm1', type: 'contribution', amount: 1000, date: '2026-05-04' });
  const ok = requestLoan(st, 'm1', 1000);   // cap = 3 x 1000 = 3000
  assert.equal(ok.status, 'approved');
  const deny = requestLoan(st, 'm1', 5000);
  assert.equal(deny.status, 'declined');
});

test('repayment zeroes out a loan and clears status', () => {
  const st = seed();
  recordTransaction(st, { memberId: 'm1', type: 'contribution', amount: 4000, date: '2026-05-04' });
  const loan = requestLoan(st, 'm1', 2000, { issuedAt: '2026-05-04' });
  assert.equal(loan.outstanding, 2200); // 10% flat interest
  repayLoan(st, loan.id, 2200);
  assert.equal(loan.outstanding, 0);
  assert.equal(loan.status, 'cleared');
});

test('rotation always has exactly one current recipient', () => {
  const st = seed();
  const rows = rotationReport(st, { asOf: '2026-10-20' });
  assert.equal(rows.length, 3);
  assert.equal(rows.filter((r) => r.status === 'receives-now').length, 1);
  // elapsed 5 + current cycle 6 -> recipient index (6-1) % 3 = 2
  assert.equal(rows[0].status, 'received');
  assert.equal(rows[1].status, 'received');
  assert.equal(rows[2].status, 'receives-now');
});

test('summary pot math is subtraction-safe', () => {
  const st = seed();
  recordTransaction(st, { memberId: 'm1', type: 'contribution', amount: 5000, date: '2026-05-04' });
  recordTransaction(st, { type: 'expense', amount: 500, date: '2026-05-05' });
  recordTransaction(st, { memberId: 'm2', type: 'payout', amount: 1000, date: '2026-05-06' });
  const s = summary(st);
  assert.equal(s.contributions, 5000);
  assert.equal(s.pot, 3500);
});

test('settlement produces a rounded USDt test receipt', () => {
  const st = seed();
  recordTransaction(st, { memberId: 'm1', type: 'contribution', amount: 25800, date: '2026-05-04' });
  const entry = settlePot(st, { provider: 'simulation' });
  assert.equal(entry.totalKes, 25800);
  assert.equal(entry.usdtAmount, 200); // 25800 / 129
  assert.equal(entry.provider, 'simulation');
  assert.equal(entry.status, 'simulated');
});

test('spoken summary mentions the pot in Swahili', () => {
  const st = seed();
  recordTransaction(st, { memberId: 'm1', type: 'contribution', amount: 6000, date: '2026-05-04' });
  const spoken = spokenSummary(st, { lang: 'sw' });
  assert.ok(spoken.includes('KES'));
  assert.ok(spoken.length > 20);
});

test('elapsedCycles handles month boundaries', () => {
  assert.equal(elapsedCycles('2026-05-01', '2026-10-20'), 5);
  assert.equal(elapsedCycles('2026-05-01', '2026-05-20'), 0);
});
