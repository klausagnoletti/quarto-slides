# Dansk IT incident-response webinar (9 Sept 2026)

Reveal.js deck on the RelationSec Slide Foundation skin. Source is English, delivered live in Danish. 38 slides, two live StrawPoll votes drawn by the deck itself (slides 5 and 27, results on 6 and 28), one live website embed (slide 33, uncounted).

## Render

```
quarto render dit_ir_webinar_2026/dit_ir_webinar_2026.qmd
```

Output: `_output/dit_ir_webinar_2026/dit_ir_webinar_2026.html` (self-contained, embed-resources).

## Show day: open the deck over localhost, never as a file

```
bash dit_ir_webinar_2026/serve.sh
```

Then open `http://localhost:8765/dit_ir_webinar_2026.html`. Keep that terminal running for the whole webinar.

Why: only the live website frame (slide 33) needs it; Chromium paints a cross-site iframe blank from `file://`. The polls fetch fine from a file (checked 10-09-2026), so if slide 33 is cut, the deck can be opened straight from disk.

## Live polls (StrawPoll, no iframe)

The two votes run on the Slide Foundation poll toolbox (`{{< poll >}}` shortcode, see `_extensions/klausagnoletti/slide-foundation/AGENTS.md`). The deck fetches results itself from StrawPoll's keyless results endpoint every 2 s while a result slide is up and draws the bars in the skin. No login, no cookie, no vendor page.

| Slide | Poll id | Question |
|---|---|---|
| 5 / 6 | `kjn1DGRJGyQ` | When did you last PRACTICE your incident response plan? A: Under 1 year / B: 1–3 years / C: Over 3 years / D: Don't know |
| 27 / 28 | `B2ZB9ej27gJ` | What do you do NOW? A: Pull the cable / B: Isolate the file server / C: Call leadership first |

Both polls are private (link/QR only), one vote per phone session, voters cannot edit. The API key lives in 1Password (`StrawPoll API`, Relations Security vault) and is only used by the CLI, never by the deck.

Before the talk, from the repo root:

    bun _extensions/klausagnoletti/slide-foundation/strawpoll.ts reset kjn1DGRJGyQ
    bun _extensions/klausagnoletti/slide-foundation/strawpoll.ts reset B2ZB9ej27gJ
    bun _extensions/klausagnoletti/slide-foundation/strawpoll.ts status kjn1DGRJGyQ

Then serve the deck, scan the QR on slide 5 with your own phone, vote, and watch slide 6 move. Repeat for 27 and 28. The audience scans a new QR for the second question (each poll has its own link).

To make a new poll for another deck: `strawpoll.ts create --title "Q" --options "A|B|C"` prints the id and the two shortcodes to paste. Voters who tap "Results" on their phone can see the running tally on strawpoll.com; the free tier shows StrawPoll's ads on the voting page.

## Why the live frames are created by script

`local-script.html` mounts the `.live-frame` div's iframe (slide 33, the M&M site) at runtime from `data-live-src`, on the current and the next slide. A static `<iframe src=...>` in the source does not survive `embed-resources`: Quarto fetches the URL at render time and inlines the unauthenticated page as a `data:text/html` URL, so the "live" frame is a frozen logged-out snapshot and renders blank. Found the hard way on 09-09-2026; do not put live iframes back into the qmd as plain tags. The polls used to be iframes too and failed on stage the same day (presenter-cookie dependency, mobile layout inside the frame); they are now API-driven, see above.

## Other traps met while building this deck

- reveal.js fragments render hidden in headless screenshots and `#/N/F` does not reveal them. `scratchpad/shot_frag.sh` in the build session rewrote `class="fragment"` to visible in a temp copy before shooting.
- A CSS keyframe that animates `transform` overrides an SVG `transform` attribute on the same element. Wrap the animated group in a plain positioning `<g>`.
- SVG/img wrappers inside `.vcenter` shrink unless the wrapper has `width:100%`.
- An SVG `<animate>` inside an `<img>` is unreachable from page script. Script-triggered SVG animation (the slide 27 countdown) must be inline SVG inside the fragment.
- `.gitignore` ignores `*.png`; image assets need `git add -f`.
- The slide 33 popup ("New to Malware & Monsters?") appears on every fresh load of the live site. Dismiss it before narrating.

## Abort lines (in the speaker notes)

If StrawPoll is down when slide 5 comes up (the note under the bars says "paused"), both votes become rhetorical questions. The wording is in the notes of slides 5 and 27.

## PDF export (design preserved)

    scripts/export-pdf.sh dit_ir_webinar_2026   # -> dit_ir_webinar_2026/dit_ir_webinar_2026.pdf

Runs DeckTape against the rendered deck: one vector page per slide, text
selectable, fonts embedded, design as presented, the uncounted live-site
slide included; 38 pages. The result slides print their option list with the
counts as they stood at export time (DeckTape runs the deck over http, so the
bars are live). Pass `--drop 6,28` to leave the result pages out. reveal's own
print mode re-lays out fragments and drops the motion, so it is not used.
