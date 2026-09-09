# RelationSec slide template library

Shared, reusable RelationSec-identity templates for every deck in this repo.
Single source of truth: decks REFERENCE these files (`../relationsec/...`),
never copy them. Derived from the official graphic charter (Jan 2024) and the
typst document family (Label Rail CV template, rate-card / engagement docs);
logos vendored in `assets/` so nothing depends on files outside this repo.

## Files

| File | What |
|---|---|
| `fonts.html` | Google Fonts link (Bebas Neue + Source Sans 3). Always FIRST in include-in-header; Quarto's scss pipeline silently drops `@import url(...)`. |
| `skin-dark.html` | Dark deck tokens: Rich Black surface, Seasalt ink, Mikado accent. For talk decks. |
| `skin-light.html` | Light / document tokens: Seasalt surface, ink text, Rich Black bands. For document-style decks (pricing, offers, briefs). |
| `chrome.html` | Logo, slide number and menu button re-parented into the scaled slide box and pinned in slide coordinates, so they keep the same size and place relative to the content on every screen resolution and aspect ratio. Skin-agnostic; include after the skin. |
| `theme-dark.scss` | Dark theme: Bebas headings, two-tone `[x]{.accent}` display device, `.kicker`, measure-rule (Mikado head + neutral tail) under every h2. |
| `theme-light.scss` | Document grammar as a deck: h2 = Rich Black band, h3 = Label Rail section head + measure-rule, zebra tables with band header row, `.tint` and `.band-callout` callouts, `.card-light`, `.price` Bebas figures. |
| `assets/relationsec-yellow-logo.png` | Logo for DARK surfaces (use with skin-dark). |
| `assets/relationsec-navy-logo.png` | Logo for LIGHT surfaces (use with skin-light). |
| `doc-template-sample.qmd` | Element demo of the light/document template (placeholder content, no real rates). |

## Usage (deck front matter)

```yaml
format:
  klausagnoletti/slide-foundation-revealjs:   # _extensions at repo root
    theme: ../relationsec/theme-dark.scss     # or theme-light.scss
    include-in-header:
      - ../relationsec/fonts.html             # fonts FIRST
      - ../relationsec/skin-dark.html         # or skin-light.html
      - ../relationsec/chrome.html            # chrome scales with the slide
    logo: ../relationsec/assets/relationsec-yellow-logo.png   # navy on light
    embed-resources: true
    width: 1050
    height: 700
    transition: fade
```

## Hard rules

- Mikado `#FFC800` is NEVER body text on the light surface (1.6:1 contrast);
  it lives on Rich Black bands and in the measure-rule device only.
- Logo per charter: always horizontal, never stacked; yellow on dark, navy on light.
- Verify by rendering: headless per-slide screenshots before claiming anything looks right.
