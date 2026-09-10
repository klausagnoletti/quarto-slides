#!/usr/bin/env bash
# Pre-talk build: fresh polls, then render, on the machine you present from.
#
#   scripts/build-talk.sh <deck-dir>          e.g. scripts/build-talk.sh dit_ir_webinar_2026
#
# 1. strawpoll.ts rotate  creates a new StrawPoll poll for every entry under
#    `polls:` in the deck's front matter and writes <deck>/polls.local.json
#    (gitignored; the id is the join secret). Nothing is deleted; `strawpoll.ts
#    prune <deck> --yes` removes the previous ids when you want them gone.
# 2. quarto render picks the new ids up, regenerates the QR codes.
# 3. status prints each poll with its counts; every one must read "fresh".
#
# Rehearse BEFORE running this, not after: a rehearsal vote makes the poll stale.
# Needs the 1Password CLI signed in (or STRAWPOLL_API_KEY) and `bun install` done once.
set -euo pipefail
cd "$(dirname "$0")/.."

deck="${1:?deck directory, e.g. dit_ir_webinar_2026}"
deck="${deck%/}"
cli="_extensions/klausagnoletti/slide-foundation/strawpoll.ts"
[ -d "$deck" ] || { echo "no such deck: $deck" >&2; exit 1; }
[ -d node_modules/qrcode ] || { echo "run: bun install   (qrcode package for the QR codes)" >&2; exit 1; }

echo "== rotate"
bun "$cli" rotate "$deck"
echo "== render"
quarto render "$deck/$deck.qmd"
echo "== status"
bun "$cli" status "$deck"
echo
echo "Open _output/$deck/$deck.html (speaker view: press S; the join slide badge must read fresh)."
