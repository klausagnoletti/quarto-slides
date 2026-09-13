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
# 3. notes-lint.ts checks the speaker notes (hard-fail set only: prep leakage, prep-meeting
#    names, undocumented tags, interactive slide without [ABORT:], forbidden words).
# 4. notes-fit.ts opens the real speaker view headless and asserts every notes block fits
#    the 1100x700 window at the delivery layout (NOTES_LAYOUT, default "default").
# 5. status prints each poll with its counts; every one must read "fresh".
#
# Lint runs first, on the source, so a failing deck does not rotate poll ids for nothing; fit
# runs after render. Both stop the build (exit 1). Deck-specific lint inputs:
#   NOTES_NAMES="Troels,Carlos" NOTES_COPRESENTERS="Carlos" scripts/build-talk.sh <deck>
#
# Rehearse BEFORE running this, not after: a rehearsal vote makes the poll stale.
# Needs the 1Password CLI signed in (or STRAWPOLL_API_KEY) and `bun install` done once.
set -euo pipefail
cd "$(dirname "$0")/.."

deck="${1:?deck directory, e.g. dit_ir_webinar_2026}"
deck="${deck%/}"
layout="${NOTES_LAYOUT:-default}"
cli="_extensions/klausagnoletti/slide-foundation/strawpoll.ts"
[ -d "$deck" ] || { echo "no such deck: $deck" >&2; exit 1; }
[ -d node_modules/qrcode ] || { echo "run: bun install   (qrcode package for the QR codes)" >&2; exit 1; }

lint_args=()
[ -n "${NOTES_NAMES:-}" ] && lint_args+=(--names "$NOTES_NAMES")
[ -n "${NOTES_COPRESENTERS:-}" ] && lint_args+=(--copresenters "$NOTES_COPRESENTERS")
echo "== notes lint"
bun scripts/notes-lint.ts "$deck" "${lint_args[@]}"
echo "== rotate"
bun "$cli" rotate "$deck"
echo "== render"
quarto render "$deck/$deck.qmd"
echo "== notes fit (layout: $layout)"
bun scripts/notes-fit.ts "$deck" --layout "$layout"
echo "== status"
bun "$cli" status "$deck"
echo
echo "Open _output/$deck/$deck.html (speaker view: press S; the join slide badge must read fresh)."
