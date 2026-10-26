#!/usr/bin/env bash
# Generate the ChamaQi demo-video narration as offline .m4a files (one per beat).
# Uses macOS's built-in TTS (`say`) — no network, no API, consistent with the product story.
# Usage: ./scripts/make-voiceover.sh [voice]    (default: Tessa — en_ZA. Try Daniel for en_GB.)
set -euo pipefail
VOICE="${1:-Tessa}"
RATE="${RATE:-175}"
OUT="$(dirname "$0")/../demo-audio"
mkdir -p "$OUT/beats"

beat() { # beat <file-basename> <text>
  local name="$1"; local text="$2"
  say -v "$VOICE" -r "$RATE" -o "$OUT/beats/$name.aiff" "$text"
  afconvert -f m4af -d aac "$OUT/beats/$name.aiff" "$OUT/beats/$name.m4a" && rm "$OUT/beats/$name.aiff"
  printf '✓ %-16s %s\n' "$name.m4a" "$(afinfo "$OUT/beats/$name.m4a" | awk '/estimated duration/{print $3, "s"}')"
}

beat 01-intro "This is ChamaQi. Kenya's chamas — savings groups — still run on one notebook, held by one treasurer, at one meeting. Watch what happens when that notebook gets an AI, and the AI never leaves the device. Everything you are about to see runs with the internet switched off."

beat 02-contribution "The treasurer speaks Swahili, not spreadsheets. She says Amina has paid her dues — two thousand shillings — and the pot updates instantly. That phrase was parsed by the built-in grammar engine. No API, no cloud, no cost."

beat 03-loan "Now Baraka asks for a loan of three thousand. The engine checks he has earned it, adds ten percent interest by rule, and books it. The engine computes the money in pure, integer-tested code. The AI translates; it never does the arithmetic."

beat 04-payout-and-member "Cheptoo receives the merry-go-round payout, and the rotation moves to the next name. Faith joins the chama, and the schedule extends itself."

beat 05-hard-mode "Here is the part most demos fake. This sentence is loose, spoken-style Swahili that the deterministic grammar cannot parse. So a local language model takes the call. But it does not get the last word: the engine re-derives the booking from the ledger, and if the model invents an action nobody actually said, the app refuses to book it. An honest refusal is a feature you can rely on."

beat 06-settle "At the end of the cycle, the whole pot converts into dollars-backed Tether, and settles to a self-custodial wallet. The twelve-word seed is generated in memory, on this machine, and never leaves it. In test mode, settlement produces a real wallet and a draft receipt — before a single real transfer happens."

beat 07-outro "One notebook. One treasurer. Zero servers. This is offline agentic finance: intelligence and money, owned by the people holding the notebook."

echo "All beats generated in $OUT/beats (voice: $VOICE, rate: $RATE)"
