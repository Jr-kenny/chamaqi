#!/usr/bin/env bash
# Generate the ChamaQi demo narration with Microsoft Edge neural TTS (free, no key).
# Needs internet once per render (~1MB/beat); the .mp3 files stay on disk afterwards.
# Install: python3 -m venv .venv-tts && .venv-tts/bin/pip install edge-tts
# Usage: ./scripts/make-voiceover-edge.sh <VOICE-SLUG>
#   e.g. Asilia (en-KE, female), Abeo (en-NG, male), Ezinne (en-NG, female),
#        Andrew (en-US, warm), Luke (en-ZA, male), Ryan (en-GB, male)
set -euo pipefail
TZSVEN=.venv-tts/bin/python
[ -x "$TZSVEN" ] || { echo "first: python3 -m venv .venv-tts && .venv-tts/bin/pip install edge-tts"; exit 1; }
SLUG="${1:-Asilia}"
case "$SLUG" in
  Asilia) VOICE=en-KE-AsiliaNeural ;;  Abeo) VOICE=en-NG-AbeoNeural ;;
  Ezinne) VOICE=en-NG-EzinneNeural ;;  Andrew) VOICE=en-US-AndrewNeural ;;
  AndrewM) VOICE=en-US-AndrewMultilingualNeural ;; Luke) VOICE=en-ZA-LukeNeural ;;
  Leah) VOICE=en-ZA-LeahNeural ;;     Ryan) VOICE=en-US-RyanNeural ;;
  Elimu) VOICE=en-TZ-ElimuNeural ;;   Imani) VOICE=en-TZ-ImaniNeural ;;
  *) VOICE="$SLUG" ;;
esac
RATE="${RATE:-+0%}"
OUT="demo-audio/$SLUG"
mkdir -p "$OUT"
./scripts/extract-beats.sh | while IFS=$'\t' read -r name text; do
  "$TZSVEN" -m edge_tts --voice "$VOICE" --rate "$RATE" --text "$text" --write-media "$OUT/$name.mp3" >/dev/null
  d=$(afinfo "$OUT/$name.mp3" | awk '/estimated duration/{print $3}')
  printf '✓ %-24s %.1fs\n' "$OUT/$name.mp3" "$d"
done
echo "total: $((${#OUT}))/beats done — voice: $VOICE, rate: $RATE"
