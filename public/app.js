/* ChamaQi UI — vanilla JS, no build step, no remote assets (offline demo safe). */
const $ = (sel) => document.querySelector(sel);
const fmt = (n) => `KES ${Math.round(n).toLocaleString('en-KE')}`;

const el = {
  chamaName: $('#chama-name'),
  modelChip: $('#model-chip-text'),
  utterForm: $('#utterance-form'),
  utterInput: $('#utterance'),
  parseCard: $('#parse-card'),
  parseEngine: $('#parse-engine'),
  parseIntent: $('#parse-intent'),
  parseSummary: $('#parse-summary'),
  spokenText: $('#spoken-text'),
  statRow: $('#stat-row'),
  arrearsTable: $('#arrears-table'),
  rotationList: $('#rotation-list'),
  settleBtn: $('#settle-btn'),
  settleProvider: $('#settle-provider'),
  settleResult: $('#settle-result'),
};

async function api(path, body = null) {
  const opts = body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined;
  const r = await fetch(path, opts);
  return r.json();
}

function renderStats(s) {
  el.statRow.innerHTML = '';
  const stats = [
    { label: 'Kikapu cha Chama (pot)', value: fmt(s.pot), hint: 'baada ya matumizi, malipo na mikopo', cls: 'stat-accent' },
    { label: 'Michango (collected to date)', value: fmt(s.contributions), hint: `${s.members} wanachama × ${fmt(s.monthlyContribution)}` },
    { label: 'Kiwango cha Ukusanyaji', value: `${s.collectionRatePct}%`, hint: 'expected-to-date collection' },
  ];
  for (const st of stats) {
    const d = document.createElement('div');
    d.className = `stat ${st.cls || ''}`;
    d.innerHTML = `<p class="stat-label">${st.label}</p><p class="stat-value">${st.value}</p><p class="stat-hint">${st.hint}</p>`;
    el.statRow.appendChild(d);
  }
}

function renderArrears(rows) {
  const head = `<div class="table-row head"><span>Member</span><span>Paid</span><span>Arrears</span><span>Standing</span></div>`;
  const body = rows.map((r) => {
    const badge = r.standing === 'clear' ? 'badge-clear' : r.standing === 'behind' ? 'badge-behind' : 'badge-never';
    const label = r.standing.replace('-', ' ');
    return `<div class="table-row"><span>${esc(r.name)}</span><span>${fmt(r.paid)}</span><span>${fmt(r.arrears)}</span><span><span class="badge ${badge}">${label}</span></span></div>`;
  }).join('');
  el.arrearsTable.innerHTML = head + (body || `<div class="table-row"><span>Hakuna wanachama</span></div>`);
}

function renderRotation(rows) {
  el.rotationList.innerHTML = rows.map((r) => {
    const now = r.status === 'receives-now';
    return `<li class="rot-item ${now ? 'rot-now' : ''}">
      <span><strong>${r.position + 1}.</strong> ${esc(r.name)}</span>
      <span class="badge ${now ? 'badge-clear' : ''}">${now ? 'anapokea sasa' : r.status}</span>
      <span>${fmt(r.expectedPayout)}</span></li>`;
  }).join('');
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function showParse(data) {
  const ok = data.ok !== false;
  el.parseCard.classList.remove('hidden', 'parse-fail');
  if (!ok) el.parseCard.classList.add('parse-fail');
  const intentMeta = {
    contribution: 'Michango (contribution) booked',
    loan_request: 'Mkopo ombi (loan request)',
    loan_repayment: 'Mkopo ulipwa (loan repayment)',
    expense: 'Matumizi (expense)',
    payout: 'Kando (payout) imetolewa',
    add_member: 'Mwanachama mpya (member added)',
  };
  el.parseEngine.textContent = ok ? `engine: ${data.engine || 'deterministic'}` : 'Imeshindikana';
  el.parseIntent.textContent = ok ? `✓ ${intentMeta[data.intent] || data.intent}` : `✗ ${data.reason || 'parse failed'}`;
  const amt = data.amount ? fmt(data.amount) : '';
  const who = data.memberName || data.memberId || '—';
  el.parseSummary.textContent = ok
    ? `${data.text || ''}  →  intent ${data.intent}, member ${who}, ${amt}`
    : warmHint(data);
}

/** Friendly, honest copy for a refusal — including the "AI still booting" case. */
function warmHint(data) {
  const ms = data.modelState;
  if (ms && ms.attempted && !ms.loaded) {
    return 'The built-in grammar could not match this phrase, and the local LLM is still booting (takes a few seconds from cache). Click again shortly — then it will parse.';
  }
  return data.hint || data.reason || 'Phrase not matched. Try: "<name> amelipa zao <amount>".';
}

async function refresh() {
  const r = await api('/api/state');
  if (!r.ok) return;
  renderSnapshot(r.snapshot);
}

// Warm the local QVAC LLM shortly after first open (cached locally, no network).
api('/api/model', {})
  .then(() => refresh())
  .catch(() => {});

function renderSnapshot(snap) {
  el.chamaName.textContent = `${snap.state.name} · ${snap.state.members.length} wanachama`;
  renderStats(snap.summary);
  renderArrears(snap.arrears);
  renderRotation(snap.rotation);
  el.spokenText.textContent = snap.spokenSw || 'Hakuna ripoti bado.';
  setModelChip(snap.model);
}

function setModelChip(model) {
  if (model.loaded) { el.modelChip.textContent = 'LLM: tayari'; el.modelChip.parentElement.classList.add('chip-ok'); }
  else if (model.attempted) { el.modelChip.textContent = 'LLM: inapakia…'; }
  else { el.modelChip.textContent = 'LLM: booting…'; }
}

el.utterForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = el.utterInput.value.trim();
  if (!text) return;
  const btn = el.utterForm.querySelector('.btn-primary');
  btn.disabled = true; btn.textContent = 'Inapakia…';
  try {
    const r = await api('/api/utterance', { text, lang: 'sw' });
    showParse(r.ok ? r.intent : r);
    await refresh();
    el.utterInput.value = '';
  } finally {
    btn.disabled = false; btn.textContent = 'Weka Rekodi';
  }
});

document.querySelectorAll('.chip-quick').forEach((chip) => {
  chip.addEventListener('click', () => {
    el.utterInput.value = chip.dataset.phrase;
    el.utterInput.focus();
  });
});

el.settleBtn.addEventListener('click', async () => {
  el.settleBtn.disabled = true;
  try {
    const r = await api('/api/settle', { provider: el.settleProvider.value });
    el.settleResult.classList.remove('hidden');
    el.settleResult.textContent = r.ok
      ? JSON.stringify({ ledgerEntry: r.ledgerEntry, receipt: r.receipt }, null, 2)
      : `✚ ${r.error || 'settle failed'}`;
    await refresh();
  } finally { el.settleBtn.disabled = false; }
});

// Two-step confirm: first click arms the button, second click wipes to the seed.
let resetArmed = null;
document.querySelector('#reset-demo').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  if (!resetArmed) {
    btn.classList.add('confirming');
    btn.textContent = ' ↺ Bonyeza tena kuthibitisha (click again to confirm)';
    resetArmed = setTimeout(() => { btn.classList.remove('confirming'); btn.textContent = ' ↺ Reset demo chama'; resetArmed = null; }, 3000);
    return;
  }
  clearTimeout(resetArmed); resetArmed = null;
  btn.classList.remove('confirming'); btn.textContent = ' ↺ Reset demo chama';
  const r = await api('/api/reset', {});
  if (r.ok) {
    el.parseCard.classList.add('hidden');
    el.settleResult.classList.add('hidden');
    await refresh();
  }
});

refresh();
