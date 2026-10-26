# ChamaQi demo video — shot list + narration map

Audio lives in `demo-audio/beats/` (Tessa, en_ZA) and `demo-audio/daniel/` (Daniel, en_GB).
Total runtime ≈ 1:54. You say NOTHING out loud — the voice files do the talking.

Regenerate anytime (offline, uses your Mac's built-in `say`):

    ./scripts/make-voiceover.sh Tessa      # or Daniel

| # | Audio file (length) | On screen — you do this | Why judges care |
|---|---|---|---|
| 1 | `01-intro.m4a` (18s) | Title card "ChamaQi" for 2s → cut to `./run.sh` booting in a real terminal → browser opens the dashboard. Show the Wi-Fi icon getting switched OFF in the macOS menu bar *slowly* (2–3s). | "internet physically off" is the whole thesis; judges want to SEE it off. |
| 2 | `02-contribution.m4a` (16s) | Click the chip **¹ contribution** (`Amina amelipa zao 2000`). Parse card shows `engine: deterministic`. Pot number ticks up. | Speaking, not typing. Built-in grammar = instant + free. |
| 3 | `03-loan.m4a` (16s) | Click chip **² loan request** (`Baraka ameomba mkopo elfu tatu`). Arrears board shows the new loan with 10% interest. | Rules (cap check, interest) applied by tested code, not a model guess. |
| 4 | `04-payout-and-member.m4a` (9s) | Click chip **³ payout**, then chip **⁶ new member**. Rotation ladder visibly extends. | Merry-go-round rotation is bookkeeping only ChamaQi-type tools automate. |
| 5 | `05-hard-mode.m4a` (25s) | **Type free text**: `Sema tutumie zao ya Diana na Esther elfu moja` → **Weka Rekodi**. Parse card shows `engine: qvac-llm`. (Optional flex: clear the box and type gibberish like `saitani ndugu zangu wamekula benki` → shows the honest refusal card.) The model chip reads `LLM: tayari`. | This is the "AI extends, never corrupts" money-moment. The refusal card is unique marketing. |
| 6 | `06-settle.m4a` (20s) | Scroll to **Kuhamisha Kikapu (Settle)**. Choose *Simulation* → full USDT receipt, visibly stamped `simulated`. Then choose *WDK* → `prepared-draft` receipt + derived address. | WDK integration + honest `broadcast` gate = exactly the track brief. |
| 7 | `07-outro.m4a` (10s) | Full-screen the dashboard with the pot / arrears / rotation in frame, hold 3s, fade out under the final sentence. Leave the Wi-Fi icon OFF visible on the last frame. | Ends on the thesis, same way it opened. |

## Recording tips (you literally read nothing)

- Record **screen only** at full desktop Chrome maximized (`http://localhost:4173`). No webcam face required.
- Record each beat as a **separate clip** (screen record → do the clicks → stop). Then drop each audio beat under its clip on the timeline and trim to fit. In iMovie/QuickTime/Frame.io any editor works.
- If a clip is too long or too short for its audio: speed the clip (200%→75%) or hold a freeze-frame. Mismatch is invisible when the audio carries it.
- Before recording: click the **↺ Reset demo chama** chip twice, wait 3s, then let the LLM chip flip to `tayari` (fresh seed + warm model on camera).
- iMovie: Detach audio is irrelevant — just drag the .m4a below the clip track.
- CapCut/iMovie export 1080p, 30fps, ≤ 150MB.

## The one-time model note (put on screen as text, not narration)

During beat 5 flash a small caption: *"LLM: Llama-3.2-1B, 773MB, downloaded once — cached locally. Zero bytes leave this device."* It answers the judges' cost/offline question preemptively.
