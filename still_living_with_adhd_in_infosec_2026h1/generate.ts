#!/usr/bin/env bun
// Deterministic Google-Slides → Quarto reveal.js generator.
// Reads deck-ir.json (text + notes + image geometry) + the downloaded images,
// emits an editable .qmd. Re-runnable; the qmd is then hand-owned for polish.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const DIR = import.meta.dir;
const CANVAS_W = 1050, CANVAS_H = 700; // Quarto reveal default logical canvas
const ir = JSON.parse(readFileSync(`${DIR}/deck-ir.json`, "utf8")) as any[];
const imgFiles = readdirSync(`${DIR}/images`);

// map sNN_k -> filename (with real extension)
function imgFile(n: number, k: number): string | null {
  const stem = `s${String(n).padStart(2, "0")}_${k}.`;
  return imgFiles.find((f) => f.startsWith(stem)) ?? null;
}

const px = (pct: number, dim: number) => Math.round((pct / 100) * dim);
const esc = (s: string) => s.replace(/\r/g, "").trimEnd();

// No `title:`/`author:` => Quarto generates no auto title slide; the designed
// s01 brand card opens the deck instead.
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

for (const s of ir) {
  const n = s.n as number;
  const texts: string[] = s.texts ?? [];
  const images: any[] = s.images ?? [];
  const notes: string = (s.notes ?? "").trim();

  // resolve the background image (role bg) if any
  const bgIdx = images.findIndex((im) => im.role === "bg");
  const bgFile = bgIdx >= 0 ? imgFile(n, bgIdx) : null;

  // heading + attributes
  const headAttrs: string[] = [];
  if (bgFile) {
    headAttrs.push(`background-image="images/${bgFile}"`, `background-size="cover"`);
  } else {
    headAttrs.push(`background-image="images/bg-texture.png"`, `background-size="cover"`);
  }

  const hasText = texts.length > 0;
  let title = "";
  let bodyBlocks: string[] = [];
  if (hasText) {
    const firstLines = esc(texts[0]).split("\n").filter((l) => l.trim());
    title = firstLines[0] ?? "";
    const restOfFirst = firstLines.slice(1);
    bodyBlocks = [...restOfFirst, ...texts.slice(1).flatMap((t) => esc(t).split("\n"))]
      .map((l) => l.trim()).filter(Boolean);
  }

  // heading line: use title text if present, else an empty centered heading
  out += `## ${title ? title : ""} {${headAttrs.join(" ")}${title ? "" : " .center"}}\n\n`;

  // body bullets
  if (bodyBlocks.length) {
    out += bodyBlocks.map((b) => `- ${b}`).join("\n") + "\n\n";
  }

  // non-background images placed absolutely at their original coordinates
  images.forEach((im, k) => {
    if (k === bgIdx) return;
    const f = imgFile(n, k);
    if (!f) return;
    const left = px(im.xpct, CANVAS_W);
    const top = px(im.ypct, CANVAS_H);
    const w = px(im.wpct, CANVAS_W);
    out += `![](images/${f}){.absolute top=${top} left=${left} width=${w}}\n\n`;
  });

  if (notes) {
    out += `::: {.notes}\n${notes}\n:::\n\n`;
  }
}

writeFileSync(`${DIR}/still_living_with_adhd_in_infosec_2026h1.qmd`, out);
console.log(`Wrote qmd: ${ir.length} slides`);
