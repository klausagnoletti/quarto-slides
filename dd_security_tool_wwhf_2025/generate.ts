#!/usr/bin/env bun
// Google-Slides -> Quarto reveal.js generator (1:1), theme-aware edition.
// Resolves backgrounds AND text colours through the slide -> layout -> master
// chain and the master colour scheme (themeColor -> RGB). Every element placed
// absolutely at original coords with original styling. Notes preserved.
// Animations are not in the Slides API (rebuilt later). Re-runnable.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const DIR = import.meta.dir;
const RAW = "/tmp/dd_deck.json";
const TITLE = "D&D: The Security Tool You Didn't Know You Needed";
const CANVAS_W = 1050, CANVAS_H = 700, EMU_W = 9144000, EMU_H = 5143500;
const PT_TO_PX = CANVAS_W / 720;
const LEGACY = new Set<string>(); // no legacy assets to drop on this deck

const deck = JSON.parse(readFileSync(RAW, "utf8"));
const imgFiles = readdirSync(`${DIR}/images`);
const stem = (f: string) => f.replace(/\.[^.]+$/, "");
const imgFile = (n: number, order: number) =>
  imgFiles.find((f) => f.startsWith(`s${String(n).padStart(2, "0")}_${order}.`)) ?? null;
const bgFile = (n: number) => imgFiles.find((f) => f.startsWith(`s${String(n).padStart(2, "0")}_bg.`)) ?? null;
const round = (x: number) => Math.round(x);

// theme colour map (themeColor -> #hex) from the master colour scheme
const theme: Record<string, string> = {};
const h2 = (v = 0) => Math.round((v || 0) * 255).toString(16).padStart(2, "0");
const rgbHex = (c: any) => `#${h2(c.red)}${h2(c.green)}${h2(c.blue)}`;
for (const m of deck.masters ?? []) {
  for (const c of m.pageProperties?.colorScheme?.colors ?? []) theme[c.type] = rgbHex(c.color ?? {});
}
function colorHex(color: any): string | null {
  if (!color) return null;
  if (color.themeColor) return theme[color.themeColor] ?? null;
  const rgb = color.opaqueColor?.rgbColor ?? color.rgbColor;
  return rgb ? rgbHex(rgb) : null;
}

// --- Slide Foundation retrofit ------------------------------------------------
// This deck's identity is two colours: a navy stage and parchment text. Map
// those onto the foundation's role tokens so the deck is centrally reskinnable
// (dd-skin.html sets :root) while 1:1 layout is preserved. The navy SURFACE is
// painted by the foundation (we omit per-slide background-color for it); parchment
// text becomes var(--ink). Deliberate off-palette colours (pure white/grey
// highlights, the one inverted parchment-background slide) stay literal.
const SURFACE = "#1a2735"; // foundation --surface
const INK = "#e2dfd3";     // foundation --ink
const eq = (a: string | null, b: string) => (a ?? "").toLowerCase() === b.toLowerCase();
const inkCss = (hex: string) => (eq(hex, INK) ? "var(--ink)" : hex);

// background fill resolution through slide -> layout -> master
const layoutById: Record<string, any> = {};
for (const l of deck.layouts ?? []) layoutById[l.objectId] = l;
const masterById: Record<string, any> = {};
for (const m of deck.masters ?? []) masterById[m.objectId] = m;
function pickFill(fill: any) {
  if (!fill) return null;
  if (fill.solidFill?.color) { const hex = colorHex(fill.solidFill.color); return hex ? { kind: "color", hex } : null; }
  if (fill.stretchedPictureFill?.contentUrl) return { kind: "pic" };
  return null;
}
function slideBg(slide: any) {
  const lid = slide.slideProperties?.layoutObjectId;
  const layout = lid ? layoutById[lid] : null;
  const master = layout ? masterById[layout.layoutProperties?.masterObjectId] : null;
  return pickFill(slide.pageProperties?.pageBackgroundFill)
    ?? pickFill(layout?.pageProperties?.pageBackgroundFill)
    ?? pickFill(master?.pageProperties?.pageBackgroundFill)
    ?? { kind: "none" };
}

const alignCss = (a?: string) => (a === "CENTER" ? "center" : a === "END" ? "right" : "left");
function box(el: any) {
  const t = el.transform ?? {};
  const w = (el.size?.width?.magnitude ?? 0) * (t.scaleX ?? 1);
  const ht = (el.size?.height?.magnitude ?? 0) * (t.scaleY ?? 1);
  return {
    left: round((t.translateX ?? 0) / EMU_W * CANVAS_W),
    top: round((t.translateY ?? 0) / EMU_H * CANVAS_H),
    width: round(w / EMU_W * CANVAS_W),
    wFrac: w / EMU_W, hFrac: ht / EMU_H,
  };
}

let out = `---
pagetitle: "${TITLE}"
format:
  klausagnoletti/slide-foundation-revealjs:
    theme: dd-theme.scss
    embed-resources: true
    slide-number: true
    width: ${CANVAS_W}
    height: ${CANVAS_H}
    transition: fade
    include-in-header: dd-skin.html
---

`;

for (const [i, slide] of deck.slides.entries()) {
  const n = i + 1;
  const els: any[] = slide.pageElements ?? [];
  const orderOf = new Map<number, number>();
  let o = -1;
  els.forEach((el, k) => { if (el.image) { o++; orderOf.set(k, o); } });

  // background
  const head: string[] = [];
  let bgElK = -1;
  const bg = slideBg(slide);
  // navy surface is painted by the foundation (--surface); only emit OFF-surface
  // colours (e.g. the inverted parchment-background slide) as explicit per-slide bg
  if (bg.kind === "color") { if (!eq(bg.hex, SURFACE)) head.push(`background-color="${bg.hex}"`); }
  else if (bg.kind === "pic") { const f = bgFile(n); if (f) head.push(`background-image="images/${f}"`, `background-size="cover"`); }
  // full-bleed element image overrides as background if no page fill picture
  if (!head.some((h) => h.startsWith("background-image"))) {
    els.forEach((el, k) => { if (el.image) { const b = box(el); if (b.wFrac > 0.92 && b.hFrac > 0.92) bgElK = k; } });
    if (bgElK >= 0) {
      const f = imgFile(n, orderOf.get(bgElK)!);
      if (f && !LEGACY.has(stem(f))) { head.length = 0; head.push(`background-image="images/${f}"`, `background-size="cover"`); }
      else bgElK = -1;
    }
  }
  // no explicit background -> the foundation's --surface token paints the stage
  out += head.length ? `## {${head.join(" ")}}\n\n` : `##\n\n`;

  els.forEach((el, k) => {
    const b = box(el);
    if (el.image) {
      if (k === bgElK) return;
      const f = imgFile(n, orderOf.get(k)!);
      if (!f || LEGACY.has(stem(f))) return;
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
      const color = colorHex(st.foregroundColor) ?? theme.LIGHT1 ?? "#1a1a1a";
      const weight = st.bold ? 700 : 400;
      const style = `top:${b.top}px;left:${b.left}px;width:${b.width}px;` +
        `font-size:${fontPx}px;color:${inkCss(color)};font-weight:${weight};text-align:${alignCss(pm.alignment)};line-height:1.2;`;
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

writeFileSync(`${DIR}/dd_security_tool_wwhf_2025.qmd`, out);
console.log(`Wrote 1:1 qmd: ${deck.slides.length} slides | theme colours: ${Object.keys(theme).length}`);
