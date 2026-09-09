#!/usr/bin/env node
/* Pixel-exact PDF of the rendered deck: one screenshot per slide from headless
   Chrome, every fragment shown, animations settled, then bound into a PDF.
   reveal's own ?print-pdf mode re-lays out fragments, drops the motion and
   moves the chrome, so it does NOT preserve the design; this does.

   Usage: node dit_ir_webinar_2026/export-pdf.cjs [out.pdf]
   Needs: rendered deck served on http://localhost:8765 (bash dit_ir_webinar_2026/serve.sh),
          puppeteer (PUP env = path to a node_modules/puppeteer), python3 with Pillow. */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const puppeteer = require(process.env.PUP || 'puppeteer');

const OUT = path.resolve(process.argv[2] || 'dit_ir_webinar_2026/dit_ir_webinar_2026.pdf');
const URL = process.env.DECK_URL || 'http://localhost:8765/dit_ir_webinar_2026.html';
const W = 1920, H = 1080;              // 16:9 export; slide is 1050x700 letterboxed
const SETTLE_MS = 2200;                // longest one-shot illustration animation + margin

(async () => {
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'deck-pdf-'));
  const b = await puppeteer.launch({ args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: W, height: H });
  await p.goto(URL, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1500));
  const n = await p.evaluate(() => Reveal.getTotalSlides());
  const files = [];
  for (let i = 0; i < n; i++) {
    // last fragment of the slide, so every fragment is visible
    await p.evaluate(i => {
      Reveal.slide(i, 0);
      const s = Reveal.getCurrentSlide();
      const frags = s.querySelectorAll('.fragment');
      Reveal.slide(i, 0, frags.length ? frags.length - 1 : undefined);
    }, i);
    await new Promise(r => setTimeout(r, SETTLE_MS));
    const f = path.join(tmp, String(i + 1).padStart(3, '0') + '.png');
    await p.screenshot({ path: f });
    files.push(f);
    process.stderr.write('slide ' + (i + 1) + '/' + n + '\r');
  }
  await b.close();
  // Pillow binds the PNGs losslessly; ImageMagick's default policy refuses PDF output.
  execFileSync('python3', ['-c', [
    'import sys',
    'from PIL import Image',
    'out = sys.argv[1]; files = sys.argv[2:]',
    'ims = [Image.open(f).convert("RGB") for f in files]',
    'ims[0].save(out, "PDF", resolution=144, save_all=True, append_images=ims[1:])',
  ].join('\n'), OUT, ...files]);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('\nwrote ' + OUT + ' (' + n + ' pages)');
})().catch(e => { console.error(e); process.exit(1); });
