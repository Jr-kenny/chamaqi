#!/usr/bin/env bash
# Print beat filename<TAB>text lines (shared by make-voiceover.sh and make-voiceover-edge.sh)
cat << 'EOT'
01-intro	This is ChamaQi. Kenya's chamas — savings groups — still run on one notebook, held by one treasurer, at one meeting. Watch what happens when that notebook gets an AI, and the AI never leaves the device. Everything you are about to see runs with the internet switched off.
02-contribution	The treasurer speaks Swahili, not spreadsheets. She says Amina has paid her dues — two thousand shillings — and the pot updates instantly. That phrase was parsed by the built-in grammar engine. No API, no cloud, no cost.
03-loan	"Now Baraka asks for a loan of three thousand. The engine checks he has earned it, adds ten percent interest by rule, and books it. The engine computes the money in pure, integer-tested code. The AI translates; it never does the arithmetic."
04-payout-and-member	Cheptoo receives the merry-go-round payout, and the rotation moves to the next name. Faith joins the chama, and the schedule extends itself.
05-hard-mode	"Here is the part most demos fake. This sentence is loose, spoken-style Swahili that the deterministic grammar cannot parse. So a local language model takes the call. But it does not get the last word. The engine re-derives the booking from the ledger, and if the model invents an action nobody actually said, the app refuses to book it. An honest refusal is a feature you can rely on."
06-settle	"At the end of the cycle, the whole pot converts into dollars-backed Tether, and settles to a self-custodial wallet. The twelve-word seed is generated in memory, on this machine, and never leaves it. In test mode, settlement produces a real wallet and a draft receipt — before a single real transfer happens."
07-outro	"One notebook. One treasurer. Zero servers. This is offline agentic finance: intelligence and money, owned by the people holding the notebook."
EOT
