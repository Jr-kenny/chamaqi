<div align="center">

# ChamaQi (Msaidizi wa Mweka Hazina)

**The offline-first AI treasurer copilot for chamas.**
Turn a treasurer's spoken Swahili or English into a clean ledger — **on the device, with the internet switched off** — then settle the pot self-custodially in USDT when connectivity returns.

`KES 12,200 in · "Amina amelipa zao 3000" · arrears auto-checked · merry-go-round auto-scheduled · KES → 94.57 USDT`

**Local AI · No cloud · No API keys · No network needed for the core feature**

</div>

---

## Why this exists

Kenya has hundreds of thousands of chamas — community savings groups whose entire financial brain lives in one notebook, held by one treasurer, at one meeting. Three hard walls break every attempt to digitize that brain:

| Wall | Why it kills existing tools |
|---|---|
| **No internet at the meeting** | Cloud chama apps (web dashboards, M-Pesa-linked portals) are unusable in the field, which is exactly where the ledger is written. |
| **No typing culture** | The treasurer talks. Fast. In Swahili or sheng, mid-meeting, over noise. Form-based apps expect a data clerk, not a treasurer. |
| **No trusted settlement** | Collecting cash and bills is fine; moving the pot needs either a bank, a stranger's MPC app, or blind trust. Chamas deserve self-custody. |

ChamaQi tears down all three at once:

- **On-device AI** via the **QVAC SDK** — a local LLM (Llama-3.2-1B-Instruct, Q4, ~738MB, cached once) parses spoken-style utterances into ledger intents. Wi-Fi router unplugged? It still parses. No API bill, no account, no data leaving the machine.
2. **A deterministic engine that beats the AI at reliability** — arrears math, merry-go-round schedules, loan caps, interest and settlement arithmetic are pure, integer-based, unit-tested code. The LLM only *extends* robustness to free speech; it can never corrupt a number.
3. **Self-custodial settlement** via Tether's **WDK** — the pot is converted to USDT at a configured rate and settled from a wallet whose 12-word seed is generated in RAM on the treasurer's device and never leaves it. Until the operator explicitly funds and broadcasts, settlement stays in a **test-mode draft**, so the offline demo is provably safe.

## The 60-second demo (internet physically off)

1. **`./run.sh`** → app at `http://localhost:4173`.
2. Turn off Wi-Fi. (The app was started offline — `/api/settle`, `/api/utterance`, `/api/chat` make zero network calls in simulation/test mode.)
3. Click a quick phrase: **"Amina amelipa zao 2000"** → the parse card shows `engine: deterministic` or `engine: qvac-llm`, the transaction appears on the arrears board, and the Swahili spoken summary at the bottom says today's pot, arrears and rotation out loud in text.
4. Try the messy one — *"Tunapokea mwanachama mpya Faith"* → new member, rotation ladder extends.
5. **LOAN "Baraka ameomba mkopo elfu tatu"** → the engine checks the 3x-lifetime cap, adds 10% flat interest, updates the arrears board.
6. **Settle**: choose *Simulation (offline-safe)* → full USDT receipt (rates, address, memo, ref) printed, stamped `simulated`. Choose *WDK* → a self-custodial **draft** receipt with a locally-derived wallet path. Real transfers stay behind an explicit `broadcast:true`, always visible in the UI copy.
7. Ask the chat box ("Ngapi imebaki kwa Baraka?") — answered from the ledger digest, locally, by the same LLM.

Nothing above touches a cloud. The **only** network-dependent step in the product is a real broadcast settlement, and it is disabled until the operator flips `broadcast` with a funded sandbox wallet.

## Quickstart (2 commands)

```bash
npm install        # one ~4-minute install; adds QVAC SDK + WDK (optional runtime upgrades)
./run.sh           # resets to the pristine demo chama, boots http://localhost:4173
```

Optional:

```bash
./run.sh --model   # also warm-loads the local LLM; first run downloads ~738MB ONCE into ~/.qvac
npm test           # 17 engine unit tests (parsing, arrears, loans, rotation, settlement)
npm run validate   # 11 end-to-end sanity checks + resets the demo chama to pristine state
npm run audit-log     # regenerate + summarize the AI evidence trail (offline, no server needed)
```

Every AI call the server makes is appended to **`evidence/audit-log.jsonl`** — engine used, prompt event, latency, outcome. Reproducibility is a first-class feature, not an afterthought.

## Architecture in one screen

```
┌────────────────────────────────────────────────────────────────────┐
│  browser UI (vanilla, zero remote assets — works truly offline)    │
│  public/index.html · app.js · styles.css                           │
└──────────────┬─────────────────────────────────────────────────────┘
               │ JSON /api/*
┌──────────────▼─────────────────────────────────────────────────────┐
│  server.js (stdlib Node http)                                      │
│  • /api/utterance → AI intent → engine books it → snapshot         │
│  • /api/chat      → ledger digest prompt → local LLM answer        │
│  • /api/settle    → ledger clamp → provider receipt (sim | wdk)    │
└──────────────┬────────────────┬────────────────────────────────────┘
               │                │
   ┌───────────▼─────────┐  ┌───▼───────────────────────────────┐
   │ src/ai/index.js     │  │ src/wallet/index.js               │
   │ QVAC @qvac/sdk      │  │ WDK @tetherto/wdk                 │
   │ loadModel→completion│  │ seed on device → account → receipt│
   │ fallback: always    │  │ TEST-MODE draft unless broadcast  │
   └───────────┬─────────┘  └───────────────────────────────────┘
               │
   ┌───────────▼─────────────────────────────────────────────────────┐
   │ src/engine/ledger.js — the deterministic spine (17 unit tests)  │
   │ intents · arrears · rotation · loan caps · settlement · speech   │
   └─────────────────────────────────────────────────────────────────┘
```

### The AI is an upgrade, never a dependency

Every utterance flows through this gate — the order matters:

1. **Deterministic grammar first** (instant, offline, always): matches ~40 Swahili/English verb constructions for contributions, loans, repayments, expenses, kando payouts and new members, with word-amount support (`elfu tatu` → 3,000, `mia tano` → 500, `2k` → 2,000).
2. **Local LLM only on a miss**: if the grammar can't confidently parse, the utterance goes to the QVAC LLM with the roster and intent menu, returning strict JSON. **The engine then re-validates it against the roster** — foreign ids, unknown members, zero or absurd amounts are rejected and the deterministic result (even an honest `ok:false` with a helpful Swahili hint) is returned instead.
3. **Graceful degradation everywhere**: no model? Unloaded mid-demo? Worker timeout? The app still parses, still books, still speaks the summary. The demo cannot be embarrassed by the AI layer.

## What's inside

| Path | Purpose |
|---|---|
| `src/engine/ledger.js` | The whole deterministic financial core (pure functions, integers, 17 tests) |
| `src/ai/index.js` | QVAC integration: model load, intent extraction, treasurer chat, degradation policy |
| `src/wallet/index.js` | WDK integration: on-device seed, account derivation, test-mode draft settlement |
| `src/store.js` | JSON-file persistence per chama (no DB, works on any laptop) |
| `src/audit/logger.js` | JSONL audit trail for every AI and wallet event |
| `server.js` | Stdlib Node HTTP server + JSON API (no framework, no build step) |
| `public/` | The offline dashboard: dark OLED theme, AA contrast, reduced-motion support |
| `data/chama-demo.seed.json` | The pristine demo chama (5 members, 3 months of history, two open loans) — `--demo-seed` copies it to the live store |
| `test/` · `scripts/validate.js` | Engine test suite + end-to-end offline sanity checks |
| `evidence/audit-log.jsonl` | Runtime audit trail — regenerated by real AI calls (`npm run audit-log -- --generate` creates one offline) |

## Track fit: On-device agentic finance (WDK)

The brief calls for a self-custodial finance workflow where **offline AI and network actions are clearly separated**. ChamaQi does this *architecturally, not declaratively*:

- **Offline AI portion** — utterance parsing, ledger booking, arrears/rotation/loan logic, spoken summaries, treasurer Q&A: **zero network calls, ever**. The simulation receipt path (default) is also fully offline and safe for live judging.
- **Online finance portion** — only inside `src/wallet/index.js`'s WDK adapter. It is imported to generate a **self-custodial seed locally** and derive an account; **default behavior is a draft receipt with no broadcast**. The live path (`broadcast:true`) additionally requires the operator to have funded the derived wallet on a funded sandbox chain — there is no accidental spend, no wallet secret ever leaves the device, and no private key, mnemonic or password is ever written to the repo, the data files, the audit log or the UI.

That split means the core AI demo *cannot fail* because of connectivity, and the finance action *cannot fire* by accident. Judges get both the wires and the safety.

## Network-dependent features — full disclosure

| Feature | Network? | Default | How to go live |
|---|---|---|---|
| Speech/text → ledger on device | Never | Always on | — |
| Arrears / rotation / chat digest | Never | Always on | — |
| Simulation settlement receipt | Never | Always on | — |
| WDK seed generation + account derivation | No (keys on device) | Always on | — |
| **WDK broadcast of a USDT transfer** | **Yes** | **Off** (`prepared-draft`) | Explicit `broadcast:true` + funded sandbox wallet |
| Model file download (first run only) | Yes, once | Cached (~738MB, `~/.qvac`) | Run `./run.sh --model` before demo day |

No other network activity exists in the app. There is no telemetry, no analytics, no remote fonts, no CDN assets — the browser UI is fully self-contained on purpose.

## The QVAC integration (for judges and maintainers)

- **SDK**: `@qvac/sdk` `^0.22.0` (npm), JS/TS surface, Node ≥ 22.17 (we ship with Node 22 tested on macOS; the same `completion()` API shape runs on Bare/Expo with no import changes).
- **Model**: `LLAMA_3_2_1B_INST_Q4_0` (~738MB Q4, bundled constant shipped by the SDK), loaded **once** and memoized — re-runs reuse the cached model blob in `~/.qvac/models/`.
- **Files where QVAC is used**: `src/ai/index.js` (`loadModel`, `completion`), referenced nowhere else by design.
- **Calls**: `intentFrom(state, text)` (intent JSON extraction) and `treasurerChat(state, q)` (digest-conditioned question answering). Both stream-fail into the deterministic engine.
- **Audit**: every call writes `{ts, kind:'ai', engine, latencyMs, ok, note}` JSONL to `evidence/audit-log.jsonl`.
- **Licence**: QVAC SDK is Apache-2.0. Llama 3.2 is distributed under the Llama 3.2 Community License — model file fetched once via the SDK's own blob transport, no mirror, no fork.

## The WDK integration (for judges and maintainers)

- **SDK**: `@tetherto/wdk` `^1.0.0-beta.22` plus the chain module `@tetherto/wdk-wallet-evm` `^1.0.0-beta.24` (beta architecture: chain support ships as opt-in wallet modules).
- **Files where WDK is used**: `src/wallet/index.js` (`WDK.getRandomSeedPhrase()`, then `new WalletManagerEvm(seed)` → `wallet.getAccount(0)`), referenced nowhere else by design.
- **Self-custody invariant**: the 12-word BIP-39 seed is generated **in RAM by WDK on this device**, handed to no logger, included in no HTTP payload, persisted nowhere; the RPC provider URL is only attached at the explicit broadcast step (off by default). Bystanders see only the derived public address (`0x…`).
- **Deterministic receipts**: simulation and draft paths produce identical shapes (`amountKes`, `usdtRateKes`, `usdtAmount`, `walletAddress`, `txRef`), so the UI/ledger cannot misrepresent reality.
- **Rate governance**: the KES→USDT rate is a `settings.usdtRateKes` value in the chama file, seeded at 129 in the demo — never fetched from the network, never inferred silently.

## Device requirements

- **Laptop demo (recommended)**: macOS/Windows/Linux, Node ≥ 22.17, ≥ 8GB RAM (the 1B Q4 model idles comfortably under ~1GB resident) — we ran the full demo on a 16GB MacBook (Apple silicon or Intel class) with the model resident.
- **Raspberry Pi path (stretch)**: same Node JS surface; model load works on 8GB boards (slower first token). The deterministic engine + sim receipts run even on 2GB boards with the LLM unloaded.
- **Reproducibility commands**: `npm install && npm test && npm run validate && ./run.sh` — each produces verifiable output.

## Limitations we call out honestly

- The bundled Llama-3.2-1B Q4 model keeps the on-device footprint tiny, but free-form *Swahili chat quality* is correspondingly modest — the structured intent path (flipside of the corroboration gate) is where the model shines, and the deterministic spoken digest covers chat answers when the model's reply would be off. A bigger resident model (e.g. Qwen-3-4B) is a drop-in upgrade on ≥16GB machines via the same `loadModel`/`completion` surface.
- Settlement **broadcast** requires a funded wallet and is not exercised by this repo's test-mode demo; the wiring (derive account → build transfer → send) is implemented behind that flag.
- The KES→USDT rate is configuration, not a live oracle — a production deployment would feed controlled market data with the operator's chosen licensing.
- Voice capture (press-to-talk mic) is not included in v1; typing + quick phrase chips is the offline-safe input path. OS-level dictation or the QVAC transcription plugins are the next integration step.
- Browser rendering assumes a modern engine (Chrome/Safari/Firefox, last 2 years).

## License

MIT — see `LICENSE`. All third-party runtime dependencies (QVAC SDK, WDK, model weights) are open, free and attributed above, and travel in their own packages, never vendored into this source.
