#!/usr/bin/env bun
// Google-Slides -> Quarto reveal.js generator, FULL-FIDELITY (1:1) mode.
// Every element (text boxes AND images) is placed absolutely at its original
// coordinates, with original font size / weight / colour / alignment. Speaker
// notes preserved. Animations are NOT reproducible (the Slides API exposes no
// build/animation timeline) and are rebuilt by hand in the later motion pass.
// Re-runnable from /tmp/adhd_deck.json; the qmd is then hand-owned for polish.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const DIR = import.meta.dir;
const RAW = "/tmp/adhd_deck.json";
const CANVAS_W = 1050, CANVAS_H = 700;
const EMU_W = 9144000, EMU_H = 5143500;
const PT_TO_PX = CANVAS_W / 720; // 720pt = 10in page width -> canvas px

const deck = JSON.parse(readFileSync(RAW, "utf8"));
const imgFiles = readdirSync(`${DIR}/images`);
const imgFile = (n: number, k: number) =>
  imgFiles.find((f) => f.startsWith(`s${String(n).padStart(2, "0")}_${k}.`)) ?? null;

const round = (x: number) => Math.round(x);
function hex(c: any): string | null {
  const rgb = c?.opaqueColor?.rgbColor;
  if (!rgb) return null;
  const h = (v = 0) => Math.round((v || 0) * 255).toString(16).padStart(2, "0");
  return `#${h(rgb.red)}${h(rgb.green)}${h(rgb.blue)}`;
}
const alignCss = (a?: string) => (a === "CENTER" ? "center" : a === "END" ? "right" : "left");

// geometry of a pageElement: rendered box in canvas px
function box(el: any) {
  const t = el.transform ?? {};
  const w = (el.size?.width?.magnitude ?? 0) * (t.scaleX ?? 1);
  const h = (el.size?.height?.magnitude ?? 0) * (t.scaleY ?? 1);
  return {
    left: round((t.translateX ?? 0) / EMU_W * CANVAS_W),
    top: round((t.translateY ?? 0) / EMU_H * CANVAS_H),
    width: round(w / EMU_W * CANVAS_W),
    height: round(h / EMU_H * CANVAS_H),
    wFrac: w / EMU_W, hFrac: h / EMU_H,
  };
}

let out = `---
pagetitle: "Still Living with AD(H)D in Infosec"
format:
  revealjs:
    theme: [default, adhd-theme.scss]
    embed-resources: true
    slide-number: true
    width: ${CANVAS_W}
    height: ${CANVAS_H}
    transition: fade
---

`;

for (const [i, slide] of deck.slides.entries()) {
  const n = i + 1;
  const els: any[] = slide.pageElements ?? [];

  // background = full-bleed image if present, else the shared texture
  let bgK = -1;
  els.forEach((el, k) => {
    if (el.image) { const b = box(el); if (b.wFrac > 0.92 && b.hFrac > 0.92) bgK = k; }
  });
  const bgImg = bgK >= 0 ? imgFile(n, bgK) : null;
  const bg = bgImg ? `images/${bgImg}` : "images/bg-texture.png";

  out += `## {background-image="${bg}" background-size="cover"}\n\n`;

  els.forEach((el, k) => {
    const b = box(el);
    if (el.image) {
      if (k === bgK) return;
      const f = imgFile(n, k);
      if (f) out += `![](images/${f}){.absolute top=${b.top} left=${b.left} width=${b.width}}\n\n`;
      return;
    }
    if (el.shape?.text) {
      const tes: any[] = el.shape.text.textElements ?? [];
      const runs = tes.filter((t) => t.textRun);
      const text = runs.map((t) => t.textRun.content).join("");
      if (!text.replace(/\s/g, "")) return;
      const st = runs[0]?.textRun?.style ?? {};
      const pm = tes.find((t) => t.paragraphMarker)?.paragraphMarker?.style ?? {};
      const sizePt = st.fontSize?.magnitude ?? 18;
      const fontPx = round(sizePt * PT_TO_PX);
      const color = hex(st.foregroundColor) ?? "#1a1a1a";
      const weight = st.bold ? 700 : 400;
      const align = alignCss(pm.alignment);
      const style = `top:${b.top}px;left:${b.left}px;width:${b.width}px;` +
        `font-size:${fontPx}px;color:${color};font-weight:${weight};text-align:${align};line-height:1.2;`;
      // preserve line breaks as markdown hard breaks (two trailing spaces)
      const body = text.replace(/\r/g, "").split("\n").map((l) => l.trimEnd())
        .filter((l, idx, arr) => !(l === "" && idx === arr.length - 1)).join("  \n");
      out += `:::{.absolute style="${style}"}\n${body}\n:::\n\n`;
    }
  });

  const notes = (
    (slide.slideProperties?.notesPage?.pageElements ?? [])
      .filter((e: any) => e.shape?.placeholder?.type === "BODY")
      .flatMap((e: any) => (e.shape.text?.textElements ?? []))
      .map((t: any) => t.textRun?.content ?? "").join("")
  ).trim();
  if (notes) out += `::: {.notes}\n${notes}\n:::\n\n`;
}

writeFileSync(`${DIR}/still_living_with_adhd_in_infosec_2026h1.qmd`, out);
console.log(`Wrote 1:1 qmd: ${deck.slides.length} slides`);
