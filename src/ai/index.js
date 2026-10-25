/**
 * ChamaQi AI Layer — QVAC local LLM behind an intent interface.
 * ------------------------------------------------------------
 * Everything here runs on-device through the QVAC SDK (`@qvac/sdk`, model
 * type 'llm'). There is no cloud inference and no API key anywhere in
 * the app.
 *
 * The AI has exactly two jobs:
 *   1. parseUtteranceLLM  — turn messy long-form Swahili/English narration
 *                           ("Tunalipa zao Amanda na Farida mia tano each")
 *                           into the same structured intent objects that
 *                           the deterministic grammar produces. When the
 *                           LLM disagrees or fails, the deterministic parse
 *                           wins. The LLM can only *improve* confidence.
 *   2. treasurerChat      — answer questions about the ledger using a
 *                           state-of-the-chama digest stamped into the
 *                           system prompt (a compact, deterministic form of
 *                           retrieval — the sharpened part stays on device).
 *
 * Failure policy: every QVAC call is wrapped so a broken worker, missing
 * model, or cold start degrades to the deterministic engine rather than
 * hanging the demo. The deterministic engine is always correct for the
 * phrases it matches; the LLM extends coverage to free speech.
 */

import { parseUtterance, extractAmount, arrears, rotationReport, summary, spokenSummary, formatKes, INTENT_CORROBORATION } from '../engine/ledger.js';
import { auditAI } from '../audit/logger.js';

let _modelId = null;
let _loadPromise = null;

let _qvac = null;
async function qvac() {
  if (_qvac) return _qvac;
  _qvac = await import('@qvac/sdk'); // dynamic: app still boots if SDK missing
  return _qvac;
}

/**
 * Try to load the LLM. Resolves { ok:true, modelId } or { ok:false, reason }.
 * Safe to call repeatedly — the load is memoized.
 */
export function ensureModel({ onProgress } = {}) {
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    try {
      const { loadModel, LLAMA_3_2_1B_INST_Q4_0 } = await qvac();
      const t0 = Date.now();
      const modelId = await loadModel({
        modelSrc: LLAMA_3_2_1B_INST_Q4_0,
        modelType: 'llm',
        onProgress: (p) => onProgress && onProgress(p),
      });
      _modelId = modelId;
      const ms = Date.now() - t0;
      auditAI({ event: 'model_loaded', model: 'LLAMA_3_2_1B_INST_Q4_0', loadMs: ms });
      return { ok: true, modelId, loadMs: ms };
    } catch (err) {
      auditAI({ event: 'model_load_failed', error: String(err?.message || err) });
      return { ok: false, reason: String(err?.message || err) };
    }
  })();
  return _loadPromise;
}

export function modelStatus() {
  return { loaded: _modelId !== null, attempted: _loadPromise !== null };
}

export function unloadModelSafe() {
  _modelId = null;
  _loadPromise = null;
  _qvac = null;
}

/**
 * Free-form utterance -> structured intent. Strategy:
 *   1. Run the deterministic parser first (instant, always).
 *   2. If it FAILED, ask the local LLM to extract the intent as JSON.
 *   3. Validate the LLM's JSON against the roster; reject anything that
 *      contradicts the engine. Return whichever parse is usable.
 */
export async function intentFrom(state, rawText, { date } = {}) {
  const det = parseUtterance(state, rawText, { date });
  if (det.ok) {
    auditAI({ event: 'parse', engine: 'deterministic', ok: true, latencyMs: 0, text: rawText });
    return { ...det, engine: 'deterministic' };
  }

  if (!_modelId) {
    const r = await ensureModel();
    if (!r.ok) {
      auditAI({ event: 'parse', engine: 'deterministic', ok: false, text: rawText, note: 'no-llm' });
      return { ...det, engine: 'deterministic' }; // degraded but honest
    }
  }

  const roster = state.members.map((m) => `${m.id}: ${m.name}`).join(', ');
  const knownTypes = ['contribution', 'loan_request', 'loan_repayment', 'expense', 'payout'];
  const sys = [
    'You are the intent parser inside ChamaQi, an offline chama-treasurer app.',
    `Chama roster (id: name): ${roster || '(empty)'}.`,
    `Allowed intents: ${knownTypes.join(', ')}.`,
    'Language: Swahili (incl. sheng) or English. The speaker often uses "zao" (their monthly contribution), "mkopo" (loan), "kando" (merry-go-round payout), "deni" (arrears).',
    'If several people are meant, choose contribution and use the FIRST person found; set amount to the per-person amount multiplied by the number of people mentioned ("elfu moja na nusu kila mtu" for two people = 3000).',
    'Choose the intent whose action words appear in the sentence. If in doubt between types, prefer "contribution".',
    'Extract ONE most likely intent. Reply ONLY with minified JSON, no commentary:',
    '{"intent":"<type>","memberId":"<roster id or null>","memberName":"<name if adding new member>","amount":<number>,"currency":"KES"}',
  ].join('\n');

  const t0 = Date.now();
  try {
    const out = await completeQVAC({ system: sys, user: rawText });
    const ms = Date.now() - t0;
    const json = extractJson(out);
    auditAI({ event: 'parse', engine: 'qvac-llm', ok: !!json, latencyMs: ms, text: rawText });
    if (!json || !knownTypes.includes(json.intent)) {
      return { ...det, engine: 'deterministic', llmSaid: out.slice(0, 200) };
    }    let memberId = json.memberId ?? null;
    if (json.intent === 'add_member') {
      const name = String(json.memberName || '').trim();
      if (!name) return { ...det, engine: 'deterministic' };
      return { ok: true, intent: 'add_member', name, amount: 0, text: rawText, date, engine: 'qvac-llm' };
    }
    const member = state.members.find((m) => {
      if (memberId && m.id === memberId) return true;
      if (json.memberName) {
        const said0 = String(json.memberName).toLowerCase();
        return said0.includes(m.name.toLowerCase()) || m.name.toLowerCase().includes(said0);
      }
      return false;
    });
    if (json.intent !== 'expense' && !member) return { ...det, engine: 'deterministic' };

    const said = rawText.toLowerCase();
    let finalIntent = json.intent;
    if (!(INTENT_CORROBORATION[finalIntent] || []).some((w) => said.includes(w))) {
      // Model mislabeled the action. Arbitrate by evidence: if exactly ONE
      // intent category appears in the speaker's words, use it together with
      // the member the model extracted. If zero or multiple appear,
      // refuse (deterministic verdict stands).
      const evidenced = Object.keys(INTENT_CORROBORATION).filter((k) => INTENT_CORROBORATION[k].some((w) => said.includes(w)));
      if (evidenced.length !== 1 || evidenced[0] === 'add_member') {
        auditAI({ event: 'parse', engine: 'qvac-llm', ok: false, note: 'intent-not-corroborated', text: rawText });
        return { ...det, engine: 'deterministic' };
      }
      finalIntent = evidenced[0];
    }
    // A repayment needs an open loan to return against: resolve the member's
    // first outstanding loan exactly like the deterministic parser does.
    let loanId;
    if (finalIntent === 'loan_repayment' && member) {
      const open = state.loans.find((l) => l.memberId === member.id && l.outstanding > 0)
        || state.loans.find((l) => l.outstanding > 0);
      if (!open) return { ...det, engine: 'deterministic' };
      loanId = open.id;
    }
    // Money is the engine's job, never the model's: whenever the deterministic
    // grammar can read the amount out of the sentence itself, it wins over the
    // model's arithmetic ("elfu moja na nusu" is 1,500, not what a 1B model
    // estimates). The model's number is used only as a last resort.
    const detAmount = extractAmount(said);
    const llmAmount = Math.round(Number(json.amount) || 0);
    const amount = detAmount > 0 ? detAmount : llmAmount;
    if (amount <= 0) return { ...det, engine: 'deterministic' };
    return {
      ok: true,
      intent: finalIntent,
      memberId: member ? member.id : null,
      amount,
      loanId,
      text: rawText,
      date,
      engine: 'qvac-llm',
    };
  } catch (err) {
    auditAI({ event: 'parse', engine: 'qvac-llm', ok: false, latencyMs: Date.now() - t0, error: String(err?.message || err) });
    return { ...det, engine: 'deterministic' };
  }
}

/** Q&A over the ledger: digest in the prompt, answer locally. */
export async function treasurerChat(state, question, { lang = 'sw' } = {}) {
  if (!_modelId) {
    const r = await ensureModel();
    if (!r.ok) return { ok: false, fallback: fallbackAnswer(state, lang) };
  }
  const s = summary(state);
  const ar = arrears(state).map((a) => `${a.name}: due ${formatKes(a.due)}, paid ${formatKes(a.paid)}, arrears ${formatKes(a.arrears)} (${a.standing})`).join('; ');
  const rot = rotationReport(state).map((r) => `${r.position + 1}. ${r.name} — ${r.status} (payout ${formatKes(r.expectedPayout)})`).join(', ');
  const loans = state.loans.map((l) => {
    const m = state.members.find((m) => m.id === l.memberId);
    return `${m ? m.name : l.memberId}: ${formatKes(l.principal)} +${l.interest} interest, outstanding ${formatKes(l.outstanding)} (${l.status})`;
  }).join(', ') || 'none';
  const digest = [
    `Chama: ${state.name}. Monthly contribution ${formatKes(state.monthlyContribution)} per member over ${s.members} members.`,
    `Collected ${formatKes(s.contributions)}; expenses ${formatKes(s.expenses)}; payouts ${formatKes(s.payouts)}; outstanding loans ${formatKes(s.loansOutstanding)}; pot=${formatKes(s.pot)}; collection rate ${s.collectionRatePct}%.`,
    `Arrears — ${ar}`,
    `Rotation — ${rot}`,
    `Loans — ${loans}`,
  ].join('\n');

  const sys = [
    'You are the ChamaQi treasurer copilot. Answer in the same language as the question.',
    'Be concise (max 3 sentences), concrete, and only use the digest below. Never invent numbers.',
    lang === 'sw' ? 'Default to Swahili.' : 'Default to English.',
    `--- CHAMA STATE DIGEST ---\n${digest}\n--- END DIGEST ---`,
  ].join('\n');

  const t0 = Date.now();
  try {
    const out = await completeQVAC({ system: sys, user: question, maxTokens: 220 });
    const ms = Date.now() - t0;
    auditAI({ event: 'chat', engine: 'qvac-llm', ok: true, latencyMs: ms, tokens: out.split(/\s+/).length });
    return { ok: true, answer: out.trim(), latencyMs: ms, engine: 'qvac-llm' };
  } catch (err) {
    auditAI({ event: 'chat', engine: 'qvac-llm', ok: false, latencyMs: Date.now() - t0, error: String(err?.message || err) });
    return { ok: false, fallback: fallbackAnswer(state, lang) };
  }
}

async function completeQVAC({ system, user, maxTokens = 160 }) {
  const { completion } = await qvac();
  const history = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
  const result = await completion({ modelId: _modelId, history, maxTokens });
  return typeof result === 'string' ? result : (result?.text ?? result?.content ?? result?.choices?.[0]?.message?.content ?? String(result));
}

/** Structured digest answer when the LLM is unavailable — still useful, never useless. */
function fallbackAnswer(state, lang) {
  return { text: spokenSummary(state, { lang }), engine: 'deterministic' };
}

function extractJson(out) {
  try {
    const m = String(out).match(/\{[^{}]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch {
    return null;
  }
}
