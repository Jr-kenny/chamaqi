/**
 * ChamaQi Ledger Engine
 * ---------------------
 * Deterministic, dependency-free core of the product. Every financial rule
 * lives here so the app stays correct and fast even when the AI layer is
 * warming up, mid-stream, or completely unavailable.
 *
 * Money      -> integers only (Kenyan shillings, no floats).
 * Dates      -> ISO strings; cycle boundaries are configured, not guessed.
 * Purity     -> all functions are pure over a plain state object; the store
 *               persists state to disk and hands copies to the engine.
 */

/**
 * Creation defaults for a new chama.
 */
export function createChama({ name, monthlyContribution, cycleStart = '2026-01-01', rotationOrderHint = null }) {
  return {
    name,
    currency: 'KES',
    monthlyContribution: Math.max(0, Math.round(monthlyContribution)),
    cycleStart,
    createdAt: new Date().toISOString(),
    members: [],              // { id, name, joined, phone? }
    transactions: [],         // { id, memberId, type, amount, date, note, source }
    loans: [],                // { id, memberId, principal, issuedAt, dueDate, repayments: [], status }
    rotation: [],             // ordered memberIds for the merry-go-round
    settlementLedger: [],     // { id, date, totalKes, usdtRate, usdtAmount, provider, status, details }
    settings: {
      settlementEnabled: false,
      usdtRateKes: 129,       // test-mode rate; configurable, never from the network
      loanFactor: 3,          // a member may borrow up to loanFactor x lifetime contributions
      loanInterestPct: 10,    // flat interest per loan term
    },
  };
}

export function addMember(state, name, { joined = todayISO(), phone = '' } = {}) {
  const id = nextSeq(state, 'members');
  state.members.push({ id, name: name.trim(), joined, phone: phone.trim() });
  if (!state.rotation.some((r) => r.memberId === id)) {
    state.rotation.push({ memberId: id, position: state.rotation.length });
  }
  joinRotationAt(state, id, state.members.length - 1);
  return id;
}

function joinRotationAt(state, memberId, position) {
  state.rotation = state.rotation.filter((r) => r.memberId !== memberId);
  state.rotation.push({ memberId, position: Number.isInteger(position) ? position : state.rotation.length });
}

export function renameMember(state, memberId, name) {
  const m = findMember(state, memberId);
  if (m) m.name = name.trim();
  return m;
}

export function removeMember(state, memberId) {
  state.members = state.members.filter((m) => m.id !== memberId);
  state.rotation = state.rotation.filter((r) => r.memberId !== memberId);
}

/** Record a money movement of type 'contribution' | 'loan_repayment' | 'expense' | 'payout'. */
export function recordTransaction(state, { memberId, type, amount, date = todayISO(), note = '', source = 'manual' }) {
  const amt = Math.round(Number(amount));
  if (!Number.isFinite(amt) || amt <= 0) throw new Error(`Invalid amount: ${amount}`);
  const member = memberId ? findMember(state, memberId) : null;
  if (memberId && !member) throw new Error(`Unknown member: ${memberId}`);
  const tx = { id: nextSeq(state, 'transactions'), memberId: member ? member.id : null, type, amount: amt, date, note, source, recordedAt: new Date().toISOString() };
  state.transactions.push(tx);
  return tx;
}

/** Issue a loan to a member if eligible under the configured rules. */
export function requestLoan(state, memberId, amount, { issuedAt = todayISO(), termMonths = 3, applyInterest = true } = {}) {
  const member = findMember(state, memberId);
  if (!member) throw new Error(`Unknown member: ${memberId}`);
  const principal = Math.round(Number(amount));
  const lifetime = lifetimeContributions(state, memberId);
  const cap = state.settings.loanFactor * lifetime;
  const outstanding = outstandingLoanBalance(state, memberId);
  const eligible = principal + outstanding <= cap && principal > 0;
  const interest = applyInterest ? Math.round((principal * state.settings.loanInterestPct) / 100) : 0;
  const loan = {
    id: nextSeq(state, 'loans'),
    memberId,
    principal,
    interest,
    outstanding: principal + interest,
    issuedAt,
    dueDate: shiftMonths(issuedAt, termMonths),
    repayments: [],
    status: eligible ? 'approved' : 'declined',
    reason: eligible ? null : `Cap is ${cap} (loanFactor ${state.settings.loanFactor} x lifetime ${lifetime}) minus outstanding ${outstanding}`,
  };
  state.loans.push(loan);
  return loan;
}

export function repayLoan(state, loanId, amount, { date = todayISO(), source = 'manual' } = {}) {
  const loan = state.loans.find((l) => l.id === loanId);
  if (!loan) throw new Error(`Unknown loan: ${loanId}`);
  const amt = Math.round(Number(amount));
  const repayment = { amount: amt, date, source };
  loan.repayments.push(repayment);
  loan.outstanding = Math.max(0, loan.outstanding - amt);
  if (loan.outstanding === 0) loan.status = 'cleared';
  return loan;
}

/**
 * Arrears report: how much each member is behind on their monthly
 * contribution across the elapsed cycles since cycleStart.
 */
export function arrears(state, { asOf = todayISO() } = {}) {
  const cycles = elapsedCycles(state.cycleStart, asOf);
  return state.members.map((m) => {
    const paid = state.transactions
      .filter((t) => t.memberId === m.id && t.type === 'contribution')
      .reduce((s, t) => s + t.amount, 0);
    const due = cycles * state.monthlyContribution;
    const ar = Math.max(0, due - paid);
    return {
      memberId: m.id,
      name: m.name,
      cycles,
      due,
      paid,
      arrears: ar,
      standing: ar === 0 ? 'clear' : paid === 0 ? 'never-paid' : 'behind',
    };
  });
}

/** Merry-go-round: who receives the pot this cycle and projections. */
export function rotationReport(state, { asOf = todayISO() } = {}) {
  const ordered = [...state.rotation].sort((a, b) => a.position - b.position);
  const perPayout = ordered.length * state.monthlyContribution;
  const cycles = elapsedCycles(state.cycleStart, asOf) + 1; // current cycle is in progress
  const idx = (cycles - 1) % Math.max(1, ordered.length);
  return ordered.map((r, i) => {
    const m = findMember(state, r.memberId);
    return {
      memberId: r.memberId,
      name: m ? m.name : '??',
      position: r.position,
      status: i < idx ? 'received' : i === idx ? 'receives-now' : 'waiting',
      expectedPayout: perPayout,
    };
  });
}

/** Totals snapshot for the dashboard. */
export function summary(state, { asOf = todayISO() } = {}) {
  const contribTotal = state.transactions.filter((t) => t.type === 'contribution').reduce((s, t) => s + t.amount, 0);
  const expenseTotal = state.transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const payouts = state.transactions.filter((t) => t.type === 'payout').reduce((s, t) => s + t.amount, 0);
  const loanOut = state.loans.reduce((s, l) => s + (l.status === 'approved' ? l.outstanding : 0), 0);
  const members = state.members.length;
  const expected = members * state.monthlyContribution * elapsedCycles(state.cycleStart, asOf);
  return {
    members,
    monthlyContribution: state.monthlyContribution,
    contributions: contribTotal,
    expenses: expenseTotal,
    payouts,
    loansOutstanding: loanOut,
    expectedToDate: expected,
    collectionRatePct: expected > 0 ? Math.round((contribTotal / expected) * 100) : 100,
    pot: contribTotal - expenseTotal - payouts - loanOut,
  };
}

// ---------- settlement (online portion; simulated/test by default) ----------

export function settlePot(state, { date = todayISO(), provider = 'simulation', usdtRateKes = null } = {}) {
  const s = summary(state);
  const rate = usdtRateKes ?? state.settings.usdtRateKes;
  if (s.contributions - s.expenses - s.payouts <= 0) throw new Error('Nothing to settle: pot is empty or negative');
  const amount = Math.round(s.pot);
  const usdtAmount = +(amount / rate).toFixed(2);
  const entry = {
    id: nextSeq(state, 'settlementLedger'),
    date,
    totalKes: amount,
    usdtRateKes: rate,
    usdtAmount,
    provider,
    status: provider === 'simulation' ? 'simulated' : 'recorded',
    treasurerNote: `Pot of ${formatKes(amount)} moved to the chama wallet as ${usdtAmount} USDT (test rate ${rate} KES/USDT).`,
  };
  state.settlementLedger.push(entry);
  return entry;
}

// ---------- parsing: Swahili/English speech or text -> structured intent ----------
// The deterministic grammar below is the product's safety net: the LLM is an
// upgrade, not a dependency. If the LLM is unavailable the app still books
// the nakum.

const SWAHILI_PAY = ['amelipa', 'alipa', 'amelipa zao', 'lipa', 'malipo', 'zake', 'nalipa', 'tumelipa', 'walipa', 'wamelipa'];
const ENGLISH_PAY = ['paid', 'pays', 'contribution', 'contributed', 'deposited', 'sent'];
const LOAN_WORDS = { sw: ['amepewa mkopo', 'mkopo', 'ameomba mkopo'], en: ['loan', 'borrowed', 'borrow'] };
const LOAN_REPAY = { sw: ['amerejesha', 'amelipa mkopo', 'amerejesha mkopo', 'malipo ya mkopo', 'rudisha mkopo', 'rudishia'], en: ['repaid', 'repayment', 'loan payment'] };
const EXPENSE = { sw: ['matumizi', 'gharama', 'amenunua'], en: ['expense', 'bought', 'spent'] };
const PAYOUT = { sw: ['alipokea kando', 'amepewa kando', 'pokea kando'], en: ['payout', 'received the pot', 'took the pot'] };
const ADD_MEMBER = { sw: ['mwanachama mpya', 'jina mpya'], en: ['new member', 'add member'] };

/**
 * Corroboration keywords: an LLM-proposed intent must find at least one of
 * these in the raw utterance, or the deterministic verdict wins. This keeps
 * a small local model from inventing financial actions the speaker never
 * said — the engine is the auditor of its own AI.
 */
export const INTENT_CORROBORATION = {
  loan_request: [...LOAN_WORDS.sw, ...LOAN_WORDS.en, 'kopa', 'kwa mkopo', 'deni la mkopo'],
  loan_repayment: [...LOAN_REPAY.sw, ...LOAN_REPAY.en, 'rejesha', 'rudisha'],
  expense: [...EXPENSE.sw, ...EXPENSE.en, 'nunua', 'kunuwa', 'punguza'],
  payout: [...PAYOUT.sw, ...PAYOUT.en, 'kando'],
  add_member: [...ADD_MEMBER.sw, ...ADD_MEMBER.en],
  contribution: [...SWAHILI_PAY, ...ENGLISH_PAY, 'zao', 'malipo', 'weka', 'kamenesa'],
};

/** True when the utterance carries a Swahili worded amount phrase. */
export function hasWordAmount(text) {
  return /elfu\s+\w+/.test(text) || /mia\s+\w+/.test(text);
}

/**
 * Parse a raw Swahili/English utterance into an intent. Returns
 * { ok, intent?, memberId?, amount, rawTokens, confidence } — always an
 * object with ok:false and a hint when it cannot confidently match.
 */
export function parseUtterance(state, raw, { date = todayISO() } = {}) {
  const text = String(raw || '').trim().toLowerCase();
  if (!text) return { ok: false, reason: 'empty-utterance' };
  const amount = extractAmount(text);
  if (amount <= 0 && !ADD_MEMBER.sw.concat(ADD_MEMBER.en).some((w) => text.includes(w))) {
    return { ok: false, reason: 'no-amount', hint: 'Say an amount, e.g. "Amina amelipa zao 2,000".' };
  }

  // new member, no amount
  if (ADD_MEMBER.sw.concat(ADD_MEMBER.en).some((w) => text.includes(w))) {
    const name = extractName(state, text, true);
    if (name) return { ok: true, intent: 'add_member', name, amount, text, date };
    return { ok: false, reason: 'member-name-missing', hint: 'Include the member name.' };
  }

  const name = extractName(state, text, false);
  const memberId = name ? findByName(state, name)?.id ?? null : null;

  if (matchAny(text, LOAN_REPAY.sw) || matchAny(text, LOAN_REPAY.en)) {
    if (memberId) {
      const loans = state.loans.filter((l) => l.memberId === memberId && l.outstanding > 0);
      return loans.length > 0 ? { ok: true, intent: 'loan_repayment', memberId, amount, loanId: loans[0].id, text, date } : { ok: false, reason: 'no-open-loan' };
    }
    const loan = state.loans.find((l) => l.outstanding > 0);
    return loan ? { ok: true, intent: 'loan_repayment', memberId: loan.memberId, amount, loanId: loan.id, text, date } : { ok: false, reason: 'no-open-loan' };
  }

  if (matchAny(text, LOAN_WORDS.sw) || matchAny(text, LOAN_WORDS.en)) {
    return memberId ? { ok: true, intent: 'loan_request', memberId, amount, text, date } : { ok: false, reason: 'member-unknown', hint: 'Include a member name from the roster.' };
  }
  if (matchAny(text, EXPENSE.sw) || matchAny(text, EXPENSE.en)) {
    return { ok: true, intent: 'expense', memberId, amount, text, date };
  }
  if (matchAny(text, PAYOUT.sw) || matchAny(text, PAYOUT.en)) {
    return { ok: true, intent: 'payout', memberId, amount, text, date };
  }
  if (matchAny(text, SWAHILI_PAY) || matchAny(text, ENGLISH_PAY)) {
    return memberId ? { ok: true, intent: 'contribution', memberId, amount, text, date } : { ok: false, reason: 'member-unknown', hint: 'Include a member name from the roster.' };
  }
  return { ok: false, reason: 'intent-unknown', hint: 'Try: "<name> amelipa zao <amount>".' };
}

function matchAny(text, words) {
  return words.some((w) => text.includes(w));
}

/** Extract a number: digits, "2,000", "2k", "elfu tano" (thousand), "mia" (hundred). */
export function extractAmount(text) {
  const digitMatch = text.match(/(\d[\d,]*(?:\.\d+)?)\s*(k\b)?/);
  if (digitMatch) {
    let n = parseFloat(digitMatch[1].replace(/,/g, ''));
    if (digitMatch[2]) n *= 1000; // only a bare trailing "k" (word-bounded) is a multiplier
    return Math.round(n);
  }
  return extractWordAmount(text);
}

const ELFU = { moja: 1000, mbili: 2000, tatu: 3000, nne: 4000, tano: 5000, sita: 6000, saba: 7000, nane: 8000, tisa: 9000, kumi: 10000 };
function extractWordAmount(text) {
  if (/elfu\s+(\w+)/.test(text)) {
    const m = text.match(/elfu\s+(\w+)/);
    if (m[1] in ELFU) return ELFU[m[1]];
  }
  if (/mia\s+(\w+)/.test(text)) {
    const m = text.match(/mia\s+(\w+)/);
    const map = { moja: 100, mbili: 200, tatu: 300, nne: 400, tano: 500, sita: 600, saba: 700, nane: 800, tisa: 900 };
    if (m[1] in map) return map[m[1]];
  }
  return 0;
}

/**
 * Fuzzy member-name resolution: longest roster name found in the text; if
 * none, take the leading capitalized word group as a candidate for an
 * "add member" intent or for the LLM to confirm.
 */
export function extractName(state, text, allowAnyName) {
  let best = null;
  for (const m of state.members) {
    const lower = m.name.toLowerCase();
    if (text.includes(lower) && (!best || lower.length > best.length)) best = lower;
  }
  if (best) return best;
  if (allowAnyName) {
    const mt = text.match(/(?:mpya\s+(?:mwanachama\s+)?|new\s+member\s+|add\s+member\s+)([a-z][a-z' -]{1,30})/);
    if (mt) {
      const n = mt[1].split(' ').filter((w) => !['mpya', 'mwanachama', 'member', 'jina'].includes(w));
      if (n.length) return n.join(' ');
    }
  }
  // fall back to the first capitalized word in the original text
  return null;
}

export function findMember(state, memberId) { return state.members.find((m) => m.id === memberId) ?? null; }
export function findByName(state, name) { return state.members.find((m) => m.name.toLowerCase().includes(String(name).toLowerCase())) ?? null; }
export function lifetimeContributions(state, memberId) {
  return state.transactions.filter((t) => t.memberId === memberId && t.type === 'contribution').reduce((s, t) => s + t.amount, 0);
}
export function outstandingLoanBalance(state, memberId) {
  return state.loans.filter((l) => l.memberId === memberId && l.status === 'approved').reduce((s, l) => s + l.outstanding, 0);
}

// ---------- small helpers ----------

function nextSeq(state, collection) {
  const prefix = { members: 'm', transactions: 't', loans: 'l', settlementLedger: 's' }[collection] || 'x';
  let n = state[collection].length + 1;
  const taken = new Set(state[collection].map((x) => x.id));
  while (taken.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
export function shiftMonths(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}
export function elapsedCycles(cycleStartISO, asOfISO) {
  const start = new Date(cycleStartISO + 'T00:00:00Z');
  const now = new Date(asOfISO + 'T00:00:00Z');
  const months = (now.getUTCFullYear() - start.getUTCFullYear()) * 12 + (now.getUTCMonth() - start.getUTCMonth());
  return Math.max(0, months);
}
export function formatKes(n) {
  return `KES ${Math.round(n).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
}

/** Swahili/English spoken summary — produced without any model. */
export function spokenSummary(state, { lang = 'sw' } = {}) {
  const s = summary(state);
  const ars = arrears(state);
  const behind = ars.filter((a) => a.arrears > 0);
  const rot = rotationReport(state);
  const now = rot.find((r) => r.status === 'receives-now');
  if (lang === 'sw') {
    const b = behind.length ? ` Wana deni: ${behind.map((a) => `${a.name} (${formatKes(a.arrears)})`).join(', ')}.` : ' Kila mtu yuko sawa.';
    return `Tumepokea ${formatKes(s.contributions)} kwa jumla. Baki cha chama ni ${formatKes(s.pot)}. ${now ? `Wiki hii, ${now.name} ndiye atapokea ${formatKes(now.expectedPayout)}.` : ''}${b}`;
  }
  const b = behind.length ? ` In arrears: ${behind.map((a) => `${a.name} (${formatKes(a.arrears)})`).join(', ')}.` : ' Everyone is up to date.';
  return `Collected ${formatKes(s.contributions)} in total. Pot stands at ${formatKes(s.pot)}. ${now ? `${now.name} receives ${formatKes(now.expectedPayout)} this cycle.` : ''}${b}`;
}
