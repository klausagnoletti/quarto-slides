# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: roughly 23 to 25 live attendees of a one-hour remote webinar
("Incidence-respons-traening", Dansk IT / DIT Akademi, Wednesday 9 September
2026, 14:00 to 15:00 CEST), Danish public-sector and adjacent IT/security
professionals (kommuner including Aarhus, Ballerup, Gladsaxe, Vejle,
Ringsted, Hjoerring, Egedal, Faaborg-Midtfyn, plus Statens IT, Region
Midtjylland, Koebenhavns Kommune, SKI, Gjensidige, HjulmandKaptain, CapMon,
Erhvervsakademi Dania). Titles: infosec/digitalisation consultants, IT
architects, chefkonsulenter, Risk & Compliance managers, IT chiefs.
Compliance-driven (NIS2/ISO 27001 duty-holders), mostly non- or
semi-technical, roughly a third with no personal hands-on incident-response
exercise experience. They watch via Vimeo with cameras off; this is a
Dansk IT / DIT Akademi partner webinar, not a direct sales pitch from
RelationSec.

Secondary: Klaus himself, presenting live from home, reading the deck off a
browser screen-share one slide at a time, largely unscripted between fixed
beats. Carlos co-hosts and reads poll/chat results aloud; Troels (Dansk IT)
is the event planner.

## Product Purpose

A single-use, self-contained (Quarto `embed-resources: true`) reveal.js
slide deck carrying a live spoken 45 to 60 minute webinar. Its job is to
persuade this specific compliance-driven, semi-technical audience of one
thesis: it is not whether you train for incidents, it is how, and
game-based exercise engagement is what actually builds capability, not
tabletop paperwork. Success is attendees leaving with the free Malware &
Monsters (M&M) starter guide, and a subset self-selecting into a
facilitated-session lead via the closing two-tier CTA. The deck supports a
live talk, it is not a standalone read. On-slide text is deliberately
minimal by standing rule; meaning is carried in speech and in per-slide
speaker notes (keyword bullets plus verbatim on-air lines).

## Positioning

RelationSec's stance: security training built as tabletop compliance
paperwork (read the plan, discuss the plan) produces documents that satisfy
an audit, not instinct that survives a real incident. Malware & Monsters, a
TTRPG-derived game-based training format, produces observed behaviour under
constraint rather than stated intention, which no compliance-checklist
competitor offers. NIS2/ISO 27001 create the training obligation; the game
is what turns that obligation into competence. Spine line, used exactly
twice (open and close): "Questionnaires tell you what people SAY they would
do. An exercise shows you what they DO." Closing line: "sjov er ikke
useriøst, det er effektivt" (fun isn't unserious, it's effective).

## Operating Context

- Delivered live via Vimeo webinar, screen-shared from a browser on Klaus's
  own laptop, single self-contained HTML file so it needs no live asset
  server during delivery.
- Fixed 1050x700 slide canvas, RelationSec navy/Mikado-yellow brand skin
  (`_extensions/klausagnoletti/slide-foundation` +
  `relationsec/theme-dark.scss`, shared across sibling decks in this same
  repo), Bebas Neue display type, Source Sans 3 body type.
- One slide is a LIVE `background-iframe` of malwareandmonsters.com, not a
  screenshot. Known live-delivery risk: the real site shows a first-visit
  welcome popup that must be dismissed on camera, noted and rehearsed in
  that slide's speaker notes.
- Two scripted interaction points run as chat-vote polls (native Vimeo poll
  capability unverified at last check), read aloud by Carlos.
- Real-time constraints: cameras-off audience, so Q&A is seeded (pre-planted
  questions) rather than relying on live audience engagement; roughly 45 to
  60 spoken minutes at Danish pace.
- Language: deck source, on-slide text and speaker notes are English (since
  07-09-2026). Klaus delivers live in Danish, translating on the fly.

## Capabilities and Constraints

- Quarto + reveal.js static site generator. The theme is a shared extension
  (`klausagnoletti/slide-foundation-revealjs`) reused by other decks in this
  same repository (`dd_security_tool_wwhf_2025`,
  `malware_and_monsters_bsides_aarhus_2026`,
  `still_living_with_adhd_in_infosec_2026h1`): a change to the shared
  extension files (`foundation.css`, `theme-dark.scss`) must stay
  backward-compatible with those sibling decks.
- No company or client names spoken on air; anonymized client references
  only.
- No AI-generated rendered human faces anywhere in the deck. One hero image
  was hand-authored as an inline SVG silhouette scene instead, after two
  generation attempts failed this constraint.
- Local commits to `quarto-slides` are fine; nothing is pushed without
  Klaus's explicit word. The remote does not auto-deploy.

## Brand Commitments

RelationSec visual identity: surface `#111B2A` (navy/near-black), ink
`#F8F8FA`, accent Mikado yellow `#FFC800` (never used as text on a light
background), muted `#CCCCCC`, RelationSec logo (yellow variant) placed in
the deck lockup/footer. Malware & Monsters is Klaus's own product but is
explicitly its OWN separate brand with its own repo and visual identity;
M&M-specific slides in this deck reference it, they never re-badge it as
RelationSec.

## Evidence on Hand

- Real attendee list with employer and title breakdown grounds the users
  section above (`deltagere.txt` in the webinar planning directory).
- Real, already-vendored asset library in this deck's own `images/` and
  `svg/` folders: three presumption-deck workshop cards, the malmon logo
  and gaboongrabber art, two generated hero photographs, six hand-authored
  inline SVGs (dial, ECG readout, seat diagram, d20, countdown ring,
  kids-table silhouette), and a scannable QR code to
  malwareandmonsters.com.
- Full planning history (the original event-planner structure brief, four
  panel-reconciled revision rounds, expert Danish sign-off passes, a
  completed 35-slide render-verify pass that found and fixed 8 real
  rendering defects) lives outside this repo in
  `~/.claude/PAI/MEMORY/WORK/20260902-dit-webinar-summary/` and in
  persistent project memory (`project_dansk_it_webinar_2026_09.md`).
  Treat that history as the source of record for content decisions rather
  than re-deriving them from the qmd alone.
- Stated absences, do not fabricate past these: no confirmed final
  attendee count beyond "25+ registered, about 23 real"; no confirmed
  native Vimeo poll capability (a chat-vote fallback is assumed); a
  Designer per-slide sign-off pass and an airplane-mode delivery dry run
  have not yet happened, so the deck should not be represented as fully
  verified for live delivery.

## Product Principles

1. The slide supports a spoken performance, it is not the argument.
   On-slide text stays minimal; meaning lives in speech and in the speaker
   notes.
2. Demonstrate, do not describe: show one complete example (one game
   round, one live micro-decision) rather than enumerating features of the
   training format.
3. Every persuasive claim earns its place by pairing with concrete
   replacement evidence (what an exercise actually reveals). It never
   lands as a bare compliance attack the audience can only feel
   defensive about.
4. Brand consistency is enforced at the shared template layer
   (`foundation.css`, `theme-dark.scss`), not per slide. A fix defaults to
   that reusable layer unless it is genuinely deck-local content.
5. Nothing ships to the live audience with a rendering defect: rendered
   slides are screenshot-reviewed against a 4-point layout gate.

## Accessibility & Inclusion

No attendee-specific accessibility requirement was raised. Standing
practice was applied anyway: the brand's core text-on-background token
pairs are WCAG contrast-checked and passing (measured 11.13:1 accent on
surface, 10.77:1 muted on surface at build time). Captioning and
screen-reader accessibility were not a design input; this is
presenter-driven synchronous webinar delivery to a cameras-off audience,
not a self-serve interactive product.
