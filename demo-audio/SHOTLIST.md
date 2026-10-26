# ChamaQi demo video — shot list + narration map

## Pick your narrator first (all free, no accounts)

Three full narration sets are already rendered in `demo-audio/`, 7 beats each.
**✅ FINAL: `demo-audio/Abeo/` (Abeo ♂, ~1:35)** — the chosen narrator. (Caveat noted by the operator: no free TTS tier captures a true Nigerian cadence; Abeo is simply the best voice available. Alternative sets remain cached below.)

| Folder | Voice | Accent | Total | Status |
|---|---|---|---|---|
| `demo-audio/Abeo/` | Abeo ♂ | en-NG | 1:35 | ✅ **FINAL** |
| `demo-audio/Elimu/` | Elimu ♂ | en-TZ | 1:47 | alternate |
| `demo-audio/Imani/` | Imani ♀ | en-TZ | 1:54 | alternate |
| `demo-audio/Asilia/` | Asilia ♀ | en-KE | 1:45 | alternate |
| `demo-audio/Ezinne/` | Ezinne ♀ | en-NG | 1:37 | alternate |
| `demo-audio/daniel/`, `demo-audio/beats/` | built-in Mac `say` | British / US robotic fallback | 1:54 | backup |

Audition any beat in your browser: open `demo-audio/audition.html`.

Any other voice/speed, one offline-ish command:

    ./scripts/make-voiceover-edge.sh Ezinne       # en-NG female
    ./scripts/make-voiceover-edge.sh Andrew       # en-US warm male
    RATE=+8% ./scripts/make-voiceover-edge.sh Abeo    # a bit faster

(Edge neural TTS is free without an account or key; each render is ~1MB/beat of network once, files stay on disk forever after. The old `say`-based generator stays at `scripts/make-voiceover.sh` if you ever want a 100% zero-network voice.)

Audio lives in `demo-audio/<voice>/`. You say nothing out loud — the voice files do the talking.

| # | Audio file (length, **Abeo** set) | On screen — you do this | Why judges care |
|---|---|---|---|
| 1 | `01-intro.mp3` (18s) | Title card "ChamaQi" for 2s → cut to `./run.sh` booting in a real terminal → browser opens the dashboard. Show the Wi-Fi icon getting switched OFF in the macOS menu bar *slowly* (2–3s). | "internet physically off" is the whole thesis; judges want to SEE it off. |
| 2 | `02-contribution.mp3` (16s) | Click the chip **¹ contribution** (`Amina amelipa zao 2000`). Parse card shows `engine: deterministic`. Pot number ticks up. | Speaking, not typing. Built-in grammar = instant + free. |
| 3 | `03-loan.mp3` (17s) | Click chip **² loan request** (`Baraka ameomba mkopo elfu tatu`). Arrears board shows the new loan with 10% interest. | Rules (cap check, interest) applied by tested code, not a model guess. |
| 4 | `04-payout-and-member.mp3` (9s) | Click chip **³ payout**, then chip **⁶ new member**. Rotation ladder visibly extends. | Merry-go-round rotation is bookkeeping only ChamaQi-type tools automate. |
| 5 | `05-hard-mode.mp3` (25s) | **Type free text**: `Sema tutumie zao ya Diana na Esther elfu moja` → **Weka Rekodi**. Parse card shows `engine: qvac-llm`. (Optional flex: clear the box and type gibberish like `saitani ndugu zangu wamekula benki` → shows the honest refusal card.) The model chip reads `LLM: tayari`. | This is the "AI extends, never corrupts" money-moment. The refusal card is unique marketing. |
| 6 | `06-settle.mp3` (19s) | Scroll to **Kuhamisha Kikapu (Settle)**. Choose *Simulation* → full USDT receipt, visibly stamped `simulated`. Then choose *WDK* → `prepared-draft` receipt + derived address. | WDK integration + honest `broadcast` gate = exactly the track brief. |
| 7 | `07-outro.mp3` (12s) | Full-screen the dashboard with the pot / arrears / rotation in frame, hold 3s, fade out under the final sentence. Leave the Wi-Fi icon OFF visible on the last frame. | Ends on the thesis, same way it opened. |

## Recording tips (you literally read nothing)

- Record **screen only** at full desktop Chrome maximized (`http://localhost:4173`). No webcam face required.
- Record each beat as a **separate clip** (screen record → do the clicks → stop). Then drop each audio beat under its clip on the timeline and trim to fit. In iMovie/QuickTime/Frame.io any editor works.
- If a clip is too long or too short for its audio: speed the clip (200%→75%) or hold a freeze-frame. Mismatch is invisible when the audio carries it.
- Before recording: click the **↺ Reset demo chama** chip twice, wait 3s, then let the LLM chip flip to `tayari` (fresh seed + warm model on camera).
- iMovie: Detach audio is irrelevant — just drag the .m4a below the clip track.
- CapCut/iMovie export 1080p, 30fps, ≤ 150MB.

## The one-time model note (put on screen as text, not narration)

During beat 5 flash a small caption: *"LLM: Llama-3.2-1B, 773MB, downloaded once — cached locally. Zero bytes leave this device."* It answers the judges' cost/offline question preemptively.
