# Dansk IT incident-response webinar (9 Sept 2026)

Reveal.js deck on the RelationSec Slide Foundation skin. Source is English, delivered live in Danish. 38 slides, two live Wooclap votes (slides 5 and 27, results on 6 and 28), one live website embed (slide 33, uncounted).

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

Why: Chromium (Vivaldi included) paints a cross-site iframe as a blank white page when the parent document is `file://`. Over `http://localhost` the same frames load. If the deck is opened as a file anyway, the script skips the live frames and the result slides show the join code instead, so nothing breaks, you just alt-tab to Wooclap.

## Wooclap setup (event code SRCIDYA)

Account on the RelationSec email. Two questions of type **Poll** (Multiple choice demands a correct answer, Poll does not):

1. When did you last PRACTICE your incident response plan? A: Under 1 year / B: 1–3 years / C: Over 3 years / D: Don't know
2. What do you do NOW? A: Pull the cable / B: Isolate the file server / C: Call leadership first

Event settings:

- **Display answers automatically: ON.** With it off the result frame shows the question but the chart only appears after a manual click on the show-answers button. Participants do not see a running tally on their phones either way (checked 09-09-2026), so herding is not a concern.

Before 14:00, in the presenting browser:

1. Log in to Wooclap. Click **Start event** once; keep the projected screen (QR + code) in its own tab. Early joiners see "no vote in progress", which is normal.
2. Open the deck over localhost and go to slide 6. The Wooclap frame shows a **login inside the frame**: log in there once. The session cookie is not shared into a cross-site frame, so the frame needs its own login. It holds for the day in the same window.
3. Vote from your phone via the QR on slide 5, confirm the chart on slide 6, repeat for slides 27 and 28 (different question id, test it separately).

On air: push each question to the phones with the **arrow on the right** in the Wooclap tab when the vote slide is up. The result slide then shows the chart by itself.

## Why the live frames are created by script

`local-script.html` mounts every `.live-frame` div's iframe at runtime from `data-live-src`, on the current and the next slide. A static `<iframe src=...>` in the source does not survive `embed-resources`: Quarto fetches the URL at render time and inlines the unauthenticated page as a `data:text/html` URL, so the "live" frame is a frozen logged-out snapshot and renders blank. Found the hard way on 09-09-2026; do not put live iframes back into the qmd as plain tags.

The result frames (`.poll-frame`) show `wooclap.com SRCIDYA` behind a transparent iframe. When Wooclap paints, it covers the cue. When it does not, the room sees the code and the presenter alt-tabs to the Wooclap tab.

## Other traps met while building this deck

- reveal.js fragments render hidden in headless screenshots and `#/N/F` does not reveal them. `scratchpad/shot_frag.sh` in the build session rewrote `class="fragment"` to visible in a temp copy before shooting.
- A CSS keyframe that animates `transform` overrides an SVG `transform` attribute on the same element. Wrap the animated group in a plain positioning `<g>`.
- SVG/img wrappers inside `.vcenter` shrink unless the wrapper has `width:100%`.
- An SVG `<animate>` inside an `<img>` is unreachable from page script. Script-triggered SVG animation (the slide 27 countdown) must be inline SVG inside the fragment.
- `.gitignore` ignores `*.png`; image assets need `git add -f`.
- The slide 33 popup ("New to Malware & Monsters?") appears on every fresh load of the live site. Dismiss it before narrating.

## Abort lines (in the speaker notes)

If the Wooclap join page is not live when slide 5 comes up, both votes become rhetorical questions. The wording is in the notes of slides 5 and 27.
