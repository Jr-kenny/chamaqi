/**
 * ChamaQi server — zero-dependency Node HTTP server (stdlib only).
 * Serves the offline UI and a small JSON API. Everything the treasurer
 * needs on demo day runs from this single process with no build step, no
 * bundler, no package install required for the base app (QVAC and WDK are
 * optional runtime upgrades, not boot requirements).
 *
 * Routes (JSON):
 *   GET  /api/state                        full chama state + reports
 *   POST /api/utterance                    { text } -> parse via AI layer, book it
 *   POST /api/chat                         { question, lang } -> treasurerChat
 *   POST /api/member                       { name } -> add member
 *   POST /api/loan                         { memberId, amount } -> requestLoan
 *   POST /api/settle                       { provider: 'simulation'|'wdk', broadcast? }
 *   POST /api/reset                        re-seed from data fixture
 *   GET  /api/model                        model status; POST /api/model -> warm up
 */
import { createServer } from 'node:http';
import { readFileSync, cpSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createChama, addMember, recordTransaction, requestLoan, repayLoan,
  arrears, rotationReport, summary, settlePot, spokenSummary,
} from './src/engine/ledger.js';
import { load, save } from './src/store.js';
import { intentFrom, ensureModel, modelStatus, treasurerChat } from './src/ai/index.js';
import { getWalletProvider } from './src/wallet/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, 'public');
const FIXTURE = join(__dirname, 'data', 'chama-demo.seed.json');
const CHAMA_NAME = process.env.CHAMAQI_CHAMA || 'chama-demo';
const PORT = Number(process.env.PORT || 4173);

// Seed the chama state from the pristine seed fixture if the data dir is fresh or --demo-seed.
const forceSeed = process.argv.includes('--demo-seed');
let state = load(CHAMA_NAME);
if (!state || forceSeed) {
  state = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  save(state);
  console.log(`[chamaqi] seeded "${state.name}" (${state.members.length} members)`);
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  if (Buffer.isBuffer(body)) return res.end(body);
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try { return raw ? JSON.parse(raw) : {}; } catch { return { _bad: true }; }
}

/** Apply an intent produced by the AI layer to the ledger, idempotently. */
function applyIntent(state, intent, { lang = 'sw' } = {}) {
  let tx = null; let loan = null; let memberId = null;
  switch (intent.intent) {
    case 'add_member': {
      memberId = addMember(state, intent.name, {});
      tx = { memberId, type: 'member_added', amount: 0, note: 'member joined', source: 'entry' };
      break;
    }
    case 'contribution': {
      tx = recordTransaction(state, { memberId: intent.memberId, type: 'contribution', amount: intent.amount, date: intent.date, note: 'nakum (recorded offline)', source: 'utterance' });
      break;
    }
    case 'expense': {
      tx = recordTransaction(state, { memberId: intent.memberId, type: 'expense', amount: intent.amount, date: intent.date, note: intent.text?.slice(0, 80) || 'gharama', source: 'utterance' });
      break;
    }
    case 'payout': {
      tx = recordTransaction(state, { memberId: intent.memberId ?? null, type: 'payout', amount: intent.amount, date: intent.date, note: 'merry-go-round payout', source: 'utterance' });
      break;
    }
    case 'loan_request': {
      loan = requestLoan(state, intent.memberId, intent.amount, {});
      break;
    }
    case 'loan_repayment': {
      if (intent.loanId) loan = repayLoan(state, intent.loanId, intent.amount, { date: intent.date, source: 'utterance' });
      break;
    }
    default:
      return { ok: false, reason: `unknown intent ${intent.intent}` };
  }
  return { ok: true, tx, loan, memberId };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (req.method === 'POST') {
      const body = await readBody(req);
      if (body._bad) return send(res, 400, { ok: false, error: 'Invalid JSON' });

      if (url.pathname === '/api/utterance') {
        const parsed = await intentFrom(state, body.text, {});
        if (!parsed.ok) return send(res, 200, { ok: false, ...parsed, heartbeats: reportPackets() });
        const applied = applyIntent(state, parsed, { lang: body.lang || 'sw' });
        save(state);
        return send(res, 200, { ok: true, intent: parsed, applied, snapshot: snapshot() });
      }

      if (url.pathname === '/api/chat') {
        const r = await treasurerChat(state, body.question || '', { lang: body.lang || 'sw' });
        if (!r.ok) return send(res, 200, { ok: true, answer: r.fallback.text, engine: 'deterministic-digest' });
        return send(res, 200, { ok: true, answer: r.answer, engine: r.engine, latencyMs: r.latencyMs });
      }

      if (url.pathname === '/api/member') {
        if (!body.name) return send(res, 400, { ok: false, error: 'name required' });
        const id = addMember(state, body.name, { joined: body.date, phone: body.phone });
        save(state);
        return send(res, 200, { ok: true, memberId: id, snapshot: snapshot() });
      }

      if (url.pathname === '/api/loan') {
        try {
          const loan = requestLoan(state, body.memberId, body.amount, {});
          save(state);
          return send(res, 200, { ok: true, loan, snapshot: snapshot() });
        } catch (e) { return send(res, 400, { ok: false, error: e.message }); }
      }

      if (url.pathname === '/api/settle') {
        const providerName = body.provider || 'simulation';
        const provider = await getWalletProvider(providerName);
        const entry = settlePot(state, { provider: providerName });
        const receipt = await provider.settle({
          amountKes: entry.totalKes,
          usdtRateKes: entry.usdtRateKes,
          memo: `${state.name} pot ${entry.date}`,
          broadcast: body.broadcast === true,
        });
        save(state);
        return send(res, 200, { ok: true, ledgerEntry: entry, receipt, providerNote: provider.note });
      }

      if (url.pathname === '/api/reset') {
        state = JSON.parse(readFileSync(FIXTURE, 'utf8'));
        save(state);
        return send(res, 200, { ok: true, snapshot: snapshot() });
      }

      if (url.pathname === '/api/model') {
        const r = await ensureModel({ onProgress: (p) => { if (p?.percent != null) process.stdout.write(`\r[chamaqi] model ${p.percent}%   `); } });
        process.stdout.write('\n');
        return send(res, 200, { ok: r.ok, ...r, snapshot: snapshot() });
      }

      return send(res, 404, { ok: false, error: 'No such endpoint' });
    }

    // GET
    if (url.pathname === '/api/state') return send(res, 200, { ok: true, snapshot: snapshot() });
    if (url.pathname === '/api/model') return send(res, 200, { ok: true, ...modelStatus() });

    // static
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const path = join(PUBLIC_DIR, file);
    try {
      statSync(path); // throws if missing
      send(res, 200, readFileSync(path), MIME[extname(path)] || 'application/octet-stream');
    } catch {
      return send(res, 404, 'Not found', 'text/plain');
    }
  } catch (err) {
    console.error('[chamaqi] error', err);
    return send(res, 500, { ok: false, error: String(err?.message || err) });
  }
});

function reportPackets() {
  return {
    arrears: arrears(state),
    rotation: rotationReport(state),
    summary: summary(state),
  };
}

function snapshot() {
  return {
    state,
    arrears: arrears(state),
    rotation: rotationReport(state),
    summary: summary(state),
    spokenSw: spokenSummary(state, { lang: 'sw' }),
    spokenEn: spokenSummary(state, { lang: 'en' }),
    model: modelStatus(),
  };
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  ChamaQi running locally at http://localhost:${PORT}`);
  console.log('  Offline AI demo: everything except /api/settle works with the internet disconnected.\n');
});
