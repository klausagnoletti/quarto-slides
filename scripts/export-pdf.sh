#!/usr/bin/env bash
# Design-preserving PDF of any rendered reveal.js deck in this repo, via DeckTape
# (https://github.com/astefanutti/decktape): it drives the deck in headless Chrome
# slide by slide and prints each state as a vector page, so fonts, illustrations
# and the deck chrome come out exactly as presented and the text stays selectable.
# reveal's own ?print-pdf mode re-lays out fragments and drops the motion; do not use it.
#
# Usage: scripts/export-pdf.sh [--drop 6,28] <deck-dir> [out.pdf]
#   e.g. scripts/export-pdf.sh --drop 6,28 dit_ir_webinar_2026
# Renders first if the output is missing, serves it on a free local port,
# runs DeckTape, stops the server. --drop removes the listed PDF pages
# afterwards (qpdf), for slides that only make sense live, such as Wooclap
# embeds. Needs bun (for bunx decktape) and a Chrome; CHROME_PATH overrides
# auto-detection.
set -euo pipefail
cd "$(dirname "$0")/.."

drop=""
if [ "${1:-}" = "--drop" ]; then drop="$2"; shift 2; fi
deck="${1:?deck directory, e.g. dit_ir_webinar_2026}"
deck="${deck%/}"
out="${2:-$deck/$deck.pdf}"
html="_output/$deck/$deck.html"
[ -f "$html" ] || quarto render "$deck/$deck.qmd"

chrome="${CHROME_PATH:-}"
if [ -z "$chrome" ]; then
  for c in google-chrome chromium chromium-browser; do
    command -v "$c" >/dev/null 2>&1 && chrome="$(command -v "$c")" && break
  done
  [ -n "$chrome" ] || chrome="$(ls -d "$HOME"/.cache/puppeteer/chrome-headless-shell/*/chrome-headless-shell-linux64/chrome-headless-shell 2>/dev/null | tail -1 || true)"
fi
[ -n "$chrome" ] || { echo "no Chrome found; set CHROME_PATH" >&2; exit 1; }

port=$(( 20000 + RANDOM % 20000 ))
( cd "_output/$deck" && python3 -m http.server "$port" >/dev/null 2>&1 ) &
server=$!
trap 'kill $server 2>/dev/null || true' EXIT
sleep 1

bunx decktape@3 reveal \
  --size 1920x1080 --pause 1500 --load-pause 2000 \
  --chrome-path "$chrome" --chrome-arg=--no-sandbox \
  "http://localhost:$port/$deck.html" "$out"

if [ -n "$drop" ]; then
  # qpdf keeps pages by range; build the complement of the drop list
  total=$(qpdf --show-npages "$out")
  keep=""
  for p in $(seq 1 "$total"); do
    case ",$drop," in *",$p,"*) continue ;; esac
    keep="${keep:+$keep,}$p"
  done
  qpdf "$out" --pages . "$keep" -- "$out.tmp" && mv "$out.tmp" "$out"
  echo "dropped pages $drop"
fi
echo "wrote $out ($(qpdf --show-npages "$out") pages)"
