# shared/

Assets used by more than one deck. A deck never references another deck's directory; if two decks need a file, it moves here.

- `mm/` Malware & Monsters brand: `mm-theme.scss` (faces, colours, legacy classes such as `.round-flow`) and `mm-skin.html` (the Slide Foundation role tokens for the M&M black surface).
- `images/mm/` M&M artwork reused across decks (table photo, Type, Confidence and Readiness cards, roles around the d20).
- `illus/` inline SVG illustrations reused across decks (`seat-table.qmd`: round table, d20, six role seats as fragments; each deck styles the classes with its own tokens).

Per-deck one-offs stay in that deck's `images/`. RelationSec skins and chrome stay in `relationsec/`.
