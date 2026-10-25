# ChamaQi — Architecture & Design Decisions

A deeper companion to `README.md`: why each layer exists, what invariants are enforced, and how the offline/online boundary is drawn.

## 1. The product thesis in one sentence

> The treasurer speaks; a local LLM listens; a deterministic engine rules; settlement waits for you.

## 2. Layer responsibilities

### Deterministic core (`src/engine/ledger.js`)
- **Why a grammar-based parser at all?** Speech-to-ledger via pure LLM hallucinates amounts, invents members and picks wrong intents silently. Chama finance demands bitwise-reliable numbers, so the LLM must earn its involvement: the grammar covers the predictable 80% of meeting talk verbatim, the LLM covers improvisation.
- **Integer money.** `KES 2,000` is the integer 2000. No floats anywhere; if a float leaks in, `recordTransaction` rounds and validation tests catch it.
- **Pure state transform.** Every rule (`requestLoan`, `arrears`, `rotationReport`, `settlePot`…) is a pure function over a plain JSON state object. The store just persists it. That made 17 unit tests trivial and makes future porting trivial too.
- **Cycle semantics.** `elapsedCycles` counts *completed* monthly cycles (May → Oct 20 = 5, cycle 6 in progress). One definition, used by arrears and rotation alike, so the boards never contradict each other.
- **Spoken summaries** are generated *rule-side* so a demo with no model still sounds intelligent — Swahili first-class, English parity.

### AI layer (`src/ai/index.js`)
- **QVAC integration surface:** resolver `loadModel({ modelSrc: LLAMA_3_2_1B_INST_Q4_0, modelType:'llm', onProgress })` from `@qvac/sdk`; one worker, one client, one in-memory model across intents and chat — `completion({ modelId, history, maxTokens })`.
- **Intent contract:** both the grammar and the LLM must produce the same shape `{ ok, intent, memberId?, amount, text, date, engine }`. The LLM's output is *re-validated against the roster* before applying; anything that contradicts the engine's rules is discarded.
- **Degradation ladder:** deterministic hit → done (0ms). Grammar miss → LLM. LLM unavailable → deterministic result with a helpful hint. LLM error mid-stream → digestive fallback (`spokenSummary`) for chat. *Nothing in the AI layer can ever block the ledger.*
- **Audit-first:** every parse and chat event appends to `evidence/audit-log.jsonl` with latency and engine attribution — regenerable proof of on-device operation.

### Wallet layer (`src/wallet/index.js`)
- **One factory, one receipt shape.** `getWalletProvider('simulation' | 'wdk')` returns textually-identical receipt objects, so ledger math never special-cases.
- **Network boundary:** everything is offline until `broadcast:true`. Draft receipts carry `status:'prepared-draft'`; the UI quotes "test-mode" verbatim so no one mistakes a receipt for a transfer.
- **Seed hygiene:** `WDK.getRandomSeedPhrase()` lives in RAM only; fails fast to simulation; zero persistence path exists.

### Server (`server.js`) and store (`src/store.js`)
- **stdlib-only HTTP** — no framework, no build step. `npm start` is the entire runtime stack.
- **Write-through store**: one JSON per chama. `--demo-seed` resets from `data/chama-demo.json`. A fresh clone runs identically on first boot.

## 3. The offline/online split (WDK track compliance)

| Module | Network usage in test demo | At go-live |
|---|---|---|
| `src/engine/**` | none | none |
| `src/ai/**` (QVAC) | model is *pre-downloaded*; runtime is pure local inference | local-only by design |
| `src/wallet/**` | simulation provider: none. WDK provider: local seed/account only, `broadcast` defaults false | one funded chain call per settlement, explicit |
| UI | zero remote assets — no CDN, no fonts | same |

## 4. Failure playbook (demo day)

| Symptom | Expected behavior |
|---|---|
| LLM not loaded yet | parse card reads `engine: deterministic`, booking still instant |
| LLM load interrupted | next `/api/utterance` retries then degrades silently |
| Worker cold-start timeout | `RPC_INIT_TIMEOUT` surfaced in audit log, request continues deterministically |
| Internet fully unplugged mid-demo | only "Settle with WDKbroadcast" would notice; simulation + AI path unaffected |
| Double-click on booking | ids are sequential within chama state; duplicate utterances create distinct transactions (realistic — two identical payments happened twice), models can be de-duplicated at UI level later |

## 5. Design tokens (UI)

Dark OLED theme per the chama-fintech context: high-contrast AA text (`#F8FAFC` on `#020617`), `#22C55E` accent reserved for positive states, destructive `#EF4444` only for fail chips. All icons inline SVG (no emoji, no font dependency). `prefers-reduced-motion` disables transitions globally. Pressed states change color, never layout bounds.

## 6. Data model (pseudocode)

```
Chama:  name, monthlyContribution, cycleStart, members[].{id,name,joined,phone},
        transactions[].{id,memberId?,type,amount,date,note,source},
        loans[].{id,memberId,principal,interest,outstanding,dueDate,repayments[],status,reason?},
        rotation[].{memberId,position},
        settlementLedger[].{id,date,totalKes,usdtRateKes,usdtAmount,provider,status,treasurerNote},
        settings.{usdtRateKes, loanFactor, loanInterestPct}
Intent: {ok, intent, memberId?, amount, text, date, engine}
Receipt:{provider, status, amountKes, usdtRateKes, usdtAmount, …, txRef, settledAt}
```

## 7. Extending this product (roadmap honest-note)

1. **Press-to-talk** with a QVAC transcription plugin (`@qvac/transcription-parakeet` class) for hands-free field capture.
2. **Local parsing embeds + RAG** over meeting recordings so a month of voice notes becomes one structured ledger batch.
3. **M-Pesa inbox parser** as an offline pre-ingest layer.
4. **Multi-chama sessions** on one device (store already keys by chama file).
5. **On-device LoRA fine-tuning** (QVAC Fabric) on a treasurer's own corrections — data stays local by construction.
