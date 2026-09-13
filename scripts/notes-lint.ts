#!/usr/bin/env bun
/* Speaker-notes lint for a Quarto reveal.js deck (SlideCraft Rule 2, panel row C11).
 *
 *   bun scripts/notes-lint.ts <deck-dir | deck.qmd> [--names Troels,Carlos] [--copresenters Ronald]
 *                                                    [--forbid HackBack] [--prep PRE-SHOW,Rehearsed] [--tags path.json] [--json]
 *
 * Hard fail (exit 1), the objective safety set only:
 *   prep      prep content (PRE-SHOW, Rehearsed, cut list ...) in any notes block but slide 1
 *   name      a prep-meeting name used as attribution ("Troels said", "(Troels)", "per Troels")
 *   tag       a leading [TAG] that is not in the vocabulary JSON
 *   abort     an interactive element (poll shortcode, iframe, [CHAT]) with no [ABORT: ...] line
 *   forbid    a forbidden word anywhere on the slide or in its notes (default: HackBack)
 * Advisory (reported, never blocking): more than 5 cue bullets, a cue over 8 words, prose lines,
 * a first line that is a delivery cue instead of the slide's job, slides with no notes.
 * [VERBATIM], [READ] and [MEMORIZED] lines are exempt from the length rules.
 *
 * The vocabulary is _extensions/klausagnoletti/slide-foundation/speaker-notes-tags.json, the one
 * copy. --names (prep-meeting attendees, attribution is a hard fail) and --copresenters (a named
 * slot like [RONALD 30s] is allowed) are deck-specific and deliberately not stored anywhere shared. */

import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";

type Vocab = {
  core: Record<string, unknown>;
  extension: Record<string, unknown>;
  namedSlot: { pattern: string };
  prepPrefixes: { list: string[] };
};
type Finding = { level: "HARD" | "advisory"; kind: string; line: number; text: string };
type Slide = { index: number; title: string; startLine: number; body: string[]; notes: { line: number; text: string }[] };

const argv = process.argv.slice(2);
const VALUE_FLAGS = new Set(["--names", "--copresenters", "--forbid", "--prep", "--tags"]);
function flag(name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}
const target = argv.filter((a, i) => !a.startsWith("--") && !VALUE_FLAGS.has(argv[i - 1] ?? ""))[0];
if (!target) {
  console.error("usage: bun scripts/notes-lint.ts <deck-dir | deck.qmd> [--names a,b] [--forbid w] [--prep p] [--tags file] [--json]");
  process.exit(2);
}
const repoRoot = resolve(import.meta.dir, "..");
let qmdPath = resolve(target);
if (existsSync(qmdPath) && statSync(qmdPath).isDirectory()) qmdPath = join(qmdPath, basename(qmdPath) + ".qmd");
if (!existsSync(qmdPath)) {
  console.error("no such deck: " + qmdPath);
  process.exit(2);
}
const vocabPath = flag("--tags") ?? join(repoRoot, "_extensions/klausagnoletti/slide-foundation/speaker-notes-tags.json");
const vocab = JSON.parse(readFileSync(vocabPath, "utf8")) as Vocab;
const names = (flag("--names") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const forbidden = (flag("--forbid") ?? "HackBack").split(",").map((s) => s.trim()).filter(Boolean);
const prepPrefixes = [...vocab.prepPrefixes.list, ...(flag("--prep") ?? "").split(",").map((s) => s.trim()).filter(Boolean)];
const knownTags = new Set([...Object.keys(vocab.core), ...Object.keys(vocab.extension), ...prepPrefixes]);
const copresenters = (flag("--copresenters") ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
const namedSlot = copresenters.length ? new RegExp(vocab.namedSlot.pattern.replace("NAME", copresenters.join("|"))) : /^(?!)/;
const asJson = argv.includes("--json");

const LENGTH_EXEMPT = new Set(["VERBATIM", "READ", "MEMORIZED"]);
const DELIVERY_ONLY = new Set(["PAUSE", "SLOW", "POINT", "CLICK", "BREATHE"]);
const CUE_MAX_BULLETS = 5;
const CUE_MAX_WORDS = 8;

/* ---------- parse the qmd into slides with notes ---------- */
function parse(src: string): Slide[] {
  const lines = src.split(/\r?\n/);
  let i = 0;
  if (lines[0]?.trim() === "---") {
    i = 1;
    while (i < lines.length && lines[i].trim() !== "---") i++;
    i++;
  }
  const slides: Slide[] = [];
  let cur: Slide | null = null;
  let inFence = false;
  let inNotes = false;
  const open = (title: string, line: number) => {
    cur = { index: slides.length, title, startLine: line, body: [], notes: [] };
    slides.push(cur);
  };
  for (; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    if (/^(```|~~~)/.test(t)) inFence = !inFence;
    if (inFence) { cur?.body.push(raw); continue; }
    const heading = /^(#{1,2})\s*(.*)$/.exec(raw);
    if (heading && !inNotes) {
      const title = heading[2].replace(/\{[^}]*\}\s*$/, "").replace(/\[([^\]]*)\]\{[^}]*\}/g, "$1").trim();
      open(title || (heading[2].match(/\.([a-z-]+)/)?.[1] ?? "untitled"), i + 1);
      continue;
    }
    if (/^---\s*$/.test(t) && !inNotes) { open("untitled", i + 1); continue; }
    if (!cur) { if (!t) continue; open("preamble", i + 1); }
    if (/^:{3,}\s*\{?\.?notes\}?\s*$/.test(t)) { inNotes = true; continue; }
    if (inNotes && /^:{3,}\s*$/.test(t)) { inNotes = false; continue; }
    if (inNotes) cur!.notes.push({ line: i + 1, text: raw });
    else cur!.body.push(raw);
  }
  return slides;
}

/* ---------- tag helpers ---------- */
const bulletRe = /^\s*(?:[-*+]|\d+[.)])\s+/;
function stripBullet(s: string): string { return s.replace(bulletRe, ""); }
function leadingBracket(s: string): string | null {
  const m = /^\[([^\]]+)\]/.exec(stripBullet(s).trim());
  return m ? m[1] : null;
}
/* Names inside one bracket: split on commas, keep the upper-case opening words of each part;
   a lower-case part ("self-answer") is a qualifier, not a tag. */
function tagNames(bracket: string): string[] {
  const out: string[] = [];
  for (const part of bracket.split(",")) {
    const p = part.trim();
    if (!p) continue;
    if (namedSlot.test(p)) continue;
    const m = /^([A-Z][A-Z0-9?-]*(?: [A-Z][A-Z0-9?-]*)*)/.exec(p);
    if (!m) continue;
    let name = m[1];
    // longest known prefix wins ("HARD STOP 15:55" -> HARD STOP; "CLICK x3" -> CLICK)
    const words = name.split(" ");
    let found: string | null = null;
    for (let n = words.length; n > 0 && !found; n--) {
      const cand = words.slice(0, n).join(" ");
      if (knownTags.has(cand)) found = cand;
    }
    out.push(found ?? name);
  }
  return out;
}
function firstTag(s: string): string | null {
  const b = leadingBracket(s);
  return b ? tagNames(b)[0] ?? null : null;
}
function isPrep(s: string): boolean {
  const body = stripBullet(s).trim().replace(/^\[/, "");
  return prepPrefixes.some((p) => body.startsWith(p));
}
function words(s: string): number {
  return s.replace(/\[[^\]]*\]/g, " ").trim().split(/\s+/).filter(Boolean).length;
}
const attributionRes = names.map((n) => {
  const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    "\\b" + esc + "(?:'s\\b|\\s+(?:said|says|suggested|wanted|wants|asked|noted|mentioned|thinks|prefers|proposed|idea|point|feedback))" +
    "|\\(" + esc + "\\)" +
    "|\\b(?:per|from|via|according to)\\s+" + esc + "\\b",
  );
});
const forbiddenRes = forbidden.map((w) => new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));

/* ---------- lint ---------- */
function lint(slide: Slide): Finding[] {
  const f: Finding[] = [];
  const notesText = slide.notes.map((n) => n.text);
  const bodyText = slide.body.join("\n");

  for (const re of forbiddenRes) {
    for (const [k, l] of [...slide.body.map((t, i) => [t, slide.startLine + i] as const), ...slide.notes.map((n) => [n.text, n.line] as const)]) {
      if (re.test(k)) f.push({ level: "HARD", kind: "forbid", line: l, text: k.trim() });
    }
  }
  const interactive = /\{\{<\s*poll\b/.test(bodyText) || /<iframe\b/i.test(bodyText) || notesText.some((t) => /\[CHAT\b/.test(t));
  if (interactive && !notesText.some((t) => /\[ABORT:/.test(t))) {
    f.push({ level: "HARD", kind: "abort", line: slide.startLine, text: "interactive element without an [ABORT: condition] line" });
  }
  let cueBullets = 0;
  let firstLine: string | null = null;
  for (const n of slide.notes) {
    const t = n.text;
    if (!t.trim()) continue;
    if (firstLine === null) firstLine = t;
    if (slide.index > 0 && isPrep(t)) f.push({ level: "HARD", kind: "prep", line: n.line, text: t.trim() });
    for (const re of attributionRes) if (re.test(t)) f.push({ level: "HARD", kind: "name", line: n.line, text: t.trim() });
    const b = leadingBracket(t);
    if (b) for (const name of tagNames(b)) {
      if (!knownTags.has(name)) f.push({ level: "HARD", kind: "tag", line: n.line, text: "[" + name + "] not in speaker-notes-tags.json" });
    }
    const isBullet = bulletRe.test(t);
    if (!isBullet && !/^\s{2,}/.test(t)) f.push({ level: "advisory", kind: "prose", line: n.line, text: t.trim().slice(0, 80) });
    if (isBullet) {
      const tag = firstTag(t);
      const exempt = tag !== null && LENGTH_EXEMPT.has(tag);
      if (!exempt && !/"[^"]+"/.test(t)) {
        cueBullets++;
        const w = words(stripBullet(t));
        if (w > CUE_MAX_WORDS) f.push({ level: "advisory", kind: "long", line: n.line, text: w + " words: " + t.trim().slice(0, 80) });
      }
    }
  }
  if (cueBullets > CUE_MAX_BULLETS) f.push({ level: "advisory", kind: "bullets", line: slide.startLine, text: cueBullets + " cue bullets (max " + CUE_MAX_BULLETS + ")" });
  if (firstLine === null) f.push({ level: "advisory", kind: "nonotes", line: slide.startLine, text: "no notes block" });
  else {
    const tag = firstTag(firstLine);
    if (tag && DELIVERY_ONLY.has(tag)) f.push({ level: "advisory", kind: "anchor", line: slide.notes[0].line, text: "first line is a delivery cue, not the slide's job" });
  }
  return f;
}

const slides = parse(readFileSync(qmdPath, "utf8"));
const report = slides.map((s) => ({ slide: s.index + 1, title: s.title, line: s.startLine, findings: lint(s) }));
const hard = report.reduce((n, r) => n + r.findings.filter((x) => x.level === "HARD").length, 0);
const advisory = report.reduce((n, r) => n + r.findings.filter((x) => x.level === "advisory").length, 0);

if (asJson) {
  console.log(JSON.stringify({ deck: qmdPath, slides: slides.length, hard, advisory, report }, null, 2));
} else {
  console.log("notes-lint " + basename(qmdPath) + ": " + slides.length + " slides, names=" + (names.join(",") || "none") + ", forbid=" + forbidden.join(","));
  for (const r of report) {
    if (!r.findings.length) continue;
    console.log("slide " + r.slide + " (line " + r.line + ") " + JSON.stringify(r.title));
    for (const x of r.findings) console.log("  " + (x.level === "HARD" ? "HARD " : "adv  ") + x.kind.padEnd(8) + " L" + x.line + "  " + x.text);
  }
  console.log((hard ? "FAIL" : "OK") + ": " + hard + " hard, " + advisory + " advisory");
}
process.exit(hard ? 1 : 0);
