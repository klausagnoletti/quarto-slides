# quarto-slides

Reveal.js slide decks for talks by Klaus Agnoletti, built with [Quarto](https://quarto.org).

Each deck lives in its own top-level directory and builds to a **single self-contained HTML file** (fonts, images and video embedded via `embed-resources: true`), so it runs offline from a laptop or USB stick at the venue with no network and no external assets.

## Available decks

| Deck | Talk | Published |
|------|------|-----------|
| [`malware_and_monsters_bsides_aarhus_2026`](malware_and_monsters_bsides_aarhus_2026/) | Malware & Monsters: Contain It Before It Evolves (BSides Aarhus 2026) | [view](https://relationsec.net/slides/malware_and_monsters_bsides_aarhus_2026.html) |

Published links go live once the deploy is configured (see Publishing below). Until then, build locally.

## Layout convention

```
<deck-name>/
  <deck-name>.qmd        # the deck (or a single *.qmd in the directory)
  mm-theme.scss          # optional per-deck theme
  images/  fonts/  _extensions/
```

One deck per directory, one main `.qmd` per directory (files beginning with `_` are treated as includes and ignored). The build picks the single non-underscore `.qmd` in each directory.

## Build locally

```bash
quarto render <deck-name>/<deck-name>.qmd --to revealjs
# output: _output/<deck-name>/<deck-name>.html  (self-contained)
```

Asset note: `.gitignore` ignores `*.png` and `*.html` by default. Deck images are kept in the repo via `git add -f`; remember to force-add any new image: `git add -f <deck>/images/<file>.png`.

## Publishing

`.github/workflows/build-slides.yml` runs on every push to `main` (and on manual dispatch). It:

1. renders every deck to a self-contained HTML file,
2. uploads them as a workflow artifact (downloadable from the Actions run), and
3. deploys them over SSH to **relationsec.net** (EU-hosted at simply.com), where they are served as static files at `https://relationsec.net/slides/<deck-name>.html`.

The deploy step is skipped automatically until the SSH secrets are set, so the render and artifact steps work immediately.

### Deploy configuration (one-time)

Repository secrets (`Settings -> Secrets and variables -> Actions`):

| Secret | Value | Status |
|--------|-------|--------|
| `SLIDES_SSH_KEY` | private half of the ed25519 deploy key | set |
| `SLIDES_SSH_HOST` | simply.com SSH host for the relationsec.net web hotel | needed |
| `SLIDES_SSH_USER` | SSH/FTP username for that web hotel | needed |
| `SLIDES_DEPLOY_PATH` | absolute path to the `slides` directory under the web root | needed |
| `SLIDES_SSH_PORT` | SSH port (optional, defaults to 22) | optional |

The matching **public** key must be registered once in the simply.com control panel under `Website -> SSH-adgang` for the relationsec.net web hotel. simply.com SSH is public-key based and serves any real file or directory directly, so a real `slides/` directory sits alongside WordPress without being rewritten to it.
