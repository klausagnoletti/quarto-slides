#!/usr/bin/env bun
// Google-Slides -> Quarto reveal.js generator, FULL-FIDELITY (1:1) mode.
// Places every text box + image at original EMU coords with original styling.
// Handles page-level backgrounds (solid colour + stretched picture). Speaker
// notes preserved. Animations are NOT in the Slides API and are rebuilt in the
// later motion pass. Re-runnable from /tmp/adhd_deck.json; qmd then hand-owned.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const DIR = import.meta.dir;
const RAW = "/tmp/adhd_deck.json";
const CANVAS_W = 1050, CANVAS_H = 700;
const EMU_W = 9144000, EMU_H = 5143500;
const PT_TO_PX = CANVAS_W / 720;
const LEGACY = new Set(["s06_0"]); // legacy green ADHD head — Klaus: remove

const deck = JSON.parse(readFileSync(RAW, "utf8"));
const imgFiles = readdirSync(`${DIR}/images`);
const stem = (f: string) => f.replace(/\.[^.]+$/, "");
const imgFile = (n: number, order: number) =>
  imgFiles.find((f) => f.startsWith(`s${String(n).padStart(2, "0")}_${order}.`)) ?? null;
const bgFile = (n: number) =>
  imgFiles.find((f) => f.startsWith(`s${String(n).padStart(2, "0")}_bg.`)) ?? null;

const round = (x: number) => Math.round(x);
function hex(c: any): string | null {
  const rgb = c?.opaqueColor?.rgbColor ?? c?.rgbColor;
  if (!rgb) return null;
  const h = (v = 0) => Math.round((v || 0) * 255).toString(16).padStart(2, "0");
  return `#${h(rgb.red)}${h(rgb.green)}${h(rgb.blue)}`;
}
const alignCss = (a?: string) => (a === "CENTER" ? "center" : a === "END" ? "right" : "left");
function box(el: any) {
  const t = el.transform ?? {};
  const w = (el.size?.width?.magnitude ?? 0) * (t.scaleX ?? 1);
  const h = (el.size?.height?.magnitude ?? 0) * (t.scaleY ?? 1);
  return {
    left: round((t.translateX ?? 0) / EMU_W * CANVAS_W),
    top: round((t.translateY ?? 0) / EMU_H * CANVAS_H),
    width: round(w / EMU_W * CANVAS_W),
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

  // image-order index per element (matches how images were downloaded: sNN_<order>)
  const orderOf = new Map<number, number>();
  let o = -1;
  els.forEach((el, k) => { if (el.image) { o++; orderOf.set(k, o); } });

  // background resolution: page solid colour > page picture > full-bleed element image > texture
  const pf = slide.pageProperties?.pageBackgroundFill ?? {};
  const head: string[] = [];
  let bgElK = -1;
  if (pf.solidFill?.color) {
    head.push(`background-color="${hex(pf.solidFill.color) ?? "#111111"}"`);
  } else if (pf.stretchedPictureFill) {
    const f = bgFile(n);
    if (f) head.push(`background-image="images/${f}"`, `background-size="cover"`);
  } else {
    els.forEach((el, k) => { if (el.image) { const b = box(el); if (b.wFrac > 0.92 && b.hFrac > 0.92) bgElK = k; } });
    if (bgElK >= 0) {
      const f = imgFile(n, orderOf.get(bgElK)!);
      if (f && !LEGACY.has(stem(f))) head.push(`background-image="images/${f}"`, `background-size="cover"`);
      else bgElK = -1;
    }
  }
  if (head.length === 0) head.push(`background-image="images/bg-texture.png"`, `background-size="cover"`);

  out += `## {${head.join(" ")}}\n\n`;

  els.forEach((el, k) => {
    const b = box(el);
    if (el.image) {
      if (k === bgElK) return;
      const f = imgFile(n, orderOf.get(k)!);
      if (!f || LEGACY.has(stem(f))) return; // drop legacy green head
      out += `![](images/${f}){.absolute top=${b.top} left=${b.left} width=${b.width}}\n\n`;
      return;
    }
    if (el.shape?.text) {
      const tes: any[] = el.shape.text.textElements ?? [];
      const runs = tes.filter((t) => t.textRun);
      const text = runs.map((t) => t.textRun.content).join("");
      if (!text.replace(/\s/g, "")) return;
      const styled = runs.find((t) => (t.textRun.content ?? "").trim()) ?? runs[0];
      const st = styled?.textRun?.style ?? {};
      const pm = tes.find((t) => t.paragraphMarker)?.paragraphMarker?.style ?? {};
      const fontPx = round((st.fontSize?.magnitude ?? 18) * PT_TO_PX);
      const color = hex(st.foregroundColor) ?? "#1a1a1a";
      const weight = st.bold ? 700 : 400;
      const style = `top:${b.top}px;left:${b.left}px;width:${b.width}px;` +
        `font-size:${fontPx}px;color:${color};font-weight:${weight};text-align:${alignCss(pm.alignment)};line-height:1.2;`;
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
