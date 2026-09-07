# Authoring slides with Slide Foundation (guide for AI and humans)

This extension is a theme-agnostic Quarto reveal.js foundation: one role-token
contract drives a library of elements and themes common toolboxes (icons,
diagrams, code windows). This file is the operating manual. Read it before
building a deck with this extension. `API.md` is the terse reference; this is the
how-and-why, including the conscious design decisions and the verification method.

## 1. The model in one paragraph

A **skin** sets role tokens on `:root` (via `include-in-header`). Every element
and every themed toolbox reads only those tokens, so setting the skin reskins the
whole deck. You never write component CSS in a deck; you set tokens and compose
elements. Light/dark is the same mechanism: flip `--surface`/`--ink`.

## 2. Token contract (the only thing a skin sets)

| Token | Role |
|---|---|
| `--surface` | background / card fill |
| `--ink` | body + heading text |
| `--accent` | emphasis: borders, diagram nodes, big numbers |
| `--muted` | labels, attributions, diagram edges |
| `--radius` | corner rounding |
| `--edge` | stroke/border weight (borders, rules, diagram strokes) |
| `--shadow` | depth |
| `--pad` / `--gap` | box padding / grid gap |
| `--motion-dur` / `--motion-ease` | animation timing |
| `--weight-strong` / `--weight-bold` / `--weight-mid` | typographic weight scale |

Colour tokens must pass WCAG AA on `--surface` (ink/muted ≥ 4.5:1, accent ≥ 3:1).

## 3. Elements (fenced divs)

`.lockup` (`.title`/`.subtitle`), `.divider`, `.card`, `.callout`,
`.feature-grid` (bullet list → 3 cards), `.quote` (`.quote-attr`), `.timeline`
(list, each item `[…]{.t-label}`), `.bignum`/`.bignum-label`, `.emblem`
(multi-fill SVG), `.icon-slot`. Layout: `::: {.rows}` + `::: {.row}`; centre a
sparse slide with `## Title {.vcenter}`. Motion: `[…]{.fragment .fx}`.

## 4. Toolbox theming and the conscious decisions

Harmony is enforced on four axes so toolbox content reads as part of the deck,
not as a foreign default. These are **deliberate choices**, recorded here:

- **Colour**: every toolbox maps to role tokens (nodes `--surface`, node text
  `--ink`, accents/borders `--accent`, edges/labels `--muted`).
- **Stroke weight**: diagram strokes bind to `--edge`, so lines match the deck's
  borders rather than reading thin.
- **Font family**: diagram text **inherits the deck font** (the foundation owns
  no font). Decision: diagrams match the slide's typeface. Override per skin if
  you want distinct diagram type.
- **Font size**: diagram labels stay the tool's native (slightly-smaller) size,
  NOT forced to body size, because forcing it blows up diagram layout. Decision:
  match family, not size.
- **Cross-engine consistency**: Mermaid and Graphviz both render as
  accent-outlined surface nodes with ink text and muted edges, so the two look
  like one system.

Per-toolbox notes and gotchas:
- **Icons**: `{{< icon set:name role=accent|muted|ink >}}` (omit role to inherit
  text colour). Needs `bun add @iconify/utils @iconify-json/tabler @iconify-json/lucide`.
  Icon stroke weight is intrinsic to the set (Tabler/Lucide are 2px) and is left
  as designed; do not try to force it to `--edge`.
- **Mermaid**: do NOT set a baked `mermaid.theme` (e.g. `neutral`); it overrides
  the token vars. Leave mermaid theme unset.
- **Code window**: `quarto add mcanouil/quarto-code-window` + the `code-window`
  filter. Chrome themes from tokens; the code BODY is governed by Quarto's
  `highlight-style` (pick a dark one for dark skins). Code stays monospace by
  design (it is code), so it does not inherit the deck font.

## 5. Composition rules (judgment the CSS cannot enforce)

- **Minimal on-slide text.** Put full sentences in speaker notes, keywords on the
  slide. The elements are designed for sparse, high-contrast content.
- **One focal element per slide.** A slide is a card, OR a diagram, OR a quote,
  not three competing blocks. Pair a diagram with at most a short caption.
- **Use `.vcenter` for sparse slides** so they don't pin to the top with empty
  space below. Do not use it with floated images.
- **Don't overcrowd.** A feature-grid is three items; a timeline is 3-6 nodes.
  More than that, split across slides.
- **Let the skin carry identity.** Don't reach for inline styles; if something
  needs to change deck-wide, it is a token, not a one-off.

## 6. Verify before claiming it works (mandatory)

Inserting an element is not the same as it rendering correctly. Always:
1. Render the deck (`quarto render deck.qmd`).
2. Screenshot **every** slide headless and look at the pixels (do not trust grep
   or element counts).
3. Check each toolbox against its failure signature:

| Thing | PASS | FAIL signature |
|---|---|---|
| Icons | real SVG icon | literal `[set:name]` text = resolver/deps missing |
| Mermaid | surface nodes, ink text, accent borders, muted edges | blue/white text, white boxes = theme forced or vars bypassed |
| Graphviz | accent-outlined nodes, ink text | black-on-white default = recolour missed |
| Code window | themed titlebar + accent border | OS-white window = chrome not bound |
| Elements | bordered, token-coloured | unstyled mono black/white = foundation CSS not loaded |
| `.vcenter` | content vertically centred | pinned to top = centring failed |

## 7. Making a skin

Create a `<style>:root{ … }</style>` and pass it via `include-in-header`. Set
only the tokens in section 2. Verify WCAG AA. To match diagram/element weight to
your deck, tune `--edge` and the `--weight-*` tokens; the whole deck follows.
Open-source value sources for picking accessible token values: Open Props and
Radix Colors (use them to choose values, then assign to these role tokens).
