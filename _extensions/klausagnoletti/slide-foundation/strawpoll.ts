#!/usr/bin/env bun
// StrawPoll v3 CLI for the slide foundation poll toolbox. The API key never
// reaches the deck: it is read here, at the presenter's terminal, from 1Password.
//
// Deck-level (polls declared in the qmd front matter under `polls:`):
//   bun strawpoll.ts rotate <deck-dir>    create a fresh poll per declaration, write polls.local.json
//   bun strawpoll.ts status <deck-dir>    per named poll: id, age, counts
//   bun strawpoll.ts prune  <deck-dir> [--yes]
//                                         delete the previous ids rotate recorded (dry run without --yes)
//
// Single poll:
//   bun strawpoll.ts create --title "Question" --options "A|B|C|D"
//   bun strawpoll.ts status <id>          per-option counts (keyless endpoint)
//   bun strawpoll.ts reset  <id>          delete all votes, reopen
//   bun strawpoll.ts close  <id>          set the deadline to now
//   bun strawpoll.ts open   <id>          clear the deadline
//   bun strawpoll.ts delete <id>
//
// rotate never deletes: the old poll keeps working for anyone holding its link
// and is only removed by an explicit prune. polls.local.json is gitignored
// (the id is the join secret of a link-only poll and the repo is public).
//
// Key: env STRAWPOLL_API_KEY, else `op read` of STRAWPOLL_OP_REF
// (default op://Relations Security/StrawPoll API/credential).
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const API = "https://api.strawpoll.com/v3";
const OP_REF = process.env.STRAWPOLL_OP_REF || "op://Relations Security/StrawPoll API/credential";
const LOCAL = "polls.local.json";

function die(msg: string, code = 1): never {
  console.error("strawpoll: " + msg);
  process.exit(code);
}

let keyCache: string | null = null;
async function apiKey(): Promise<string> {
  if (keyCache) return keyCache;
  if (process.env.STRAWPOLL_API_KEY) return (keyCache = process.env.STRAWPOLL_API_KEY);
  let out = "", err = "", code = 1;
  try {
    const proc = Bun.spawn(["op", "read", OP_REF], { stdout: "pipe", stderr: "pipe" });
    out = (await new Response(proc.stdout).text()).trim();
    err = (await new Response(proc.stderr).text()).trim();
    code = await proc.exited;
  } catch (e: any) {
    err = e?.code === "ENOENT" ? "op (1Password CLI) is not installed or not on PATH" : String(e?.message || e);
  }
  if (code !== 0 || !out) die("could not read the API key from 1Password (" + (err || "op not available") + "). Set STRAWPOLL_API_KEY or install/sign in to op.");
  return (keyCache = out);
}

// Error bodies are truncated so a misbehaving API can never echo a header back into the terminal.
async function call(method: string, path: string, body?: unknown, keyed = true) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (keyed) headers["X-API-Key"] = await apiKey();
  const r = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!r.ok) die(method + " " + path + " -> HTTP " + r.status + " " + String(json?.error?.message || text).slice(0, 200));
  return json;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf("--" + name);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (v !== undefined && v.startsWith("--")) die("--" + name + " needs a value");
  return v;
}
const flag = (name: string) => process.argv.includes("--" + name);

const [cmd, target] = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && (i === 0 || !all[i - 1].startsWith("--")));

const PRIVATE_CONFIG = {
  is_private: true,                 // unlisted, reachable only by link/QR
  duplication_checking: "session",  // one vote per phone session; ip would block a shared venue NAT
  edit_vote_permissions: "nobody",
  hide_share_button: true,
  allow_comments: false,
  require_captcha: false,
};

async function createPoll(title: string, options: string[]) {
  if (options.length < 2) die("need at least two options (" + title + ")");
  return call("POST", "/polls", {
    title, type: "multiple_choice",
    poll_options: options.map((value) => ({ type: "text", value })),
    poll_config: PRIVATE_CONFIG,
  });
}

// PUT only the editable fields (title, type, options, config), never the
// server-owned ones, and read the poll back so a 200 that changed nothing is visible.
async function setDeadline(id: string, deadline_at: number | null) {
  const poll = await call("GET", "/polls/" + id, undefined, false);
  await call("PUT", "/polls/" + id, {
    title: poll.title, type: poll.type, poll_options: poll.poll_options,
    poll_config: { ...poll.poll_config, deadline_at },
  });
  const after = await call("GET", "/polls/" + id, undefined, false);
  if ((after.poll_config.deadline_at ?? null) !== deadline_at) die("deadline_at did not change (server has " + after.poll_config.deadline_at + ")");
  return after;
}

function printCounts(p: any, indent = "") {
  const opts = (p.poll_options || []).slice().sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
  const total = opts.reduce((s: number, o: any) => s + (o.vote_count || 0), 0);
  for (const o of opts) console.log(indent + String(o.vote_count || 0).padStart(5) + "  " + o.value);
  console.log(indent + "total " + total + (p.is_open === false ? "  (closed)" : ""));
  return total;
}

function age(createdAt: number | undefined) {
  if (!createdAt) return "age unknown";
  const s = Math.max(0, Math.floor(Date.now() / 1000) - createdAt);
  if (s < 3600) return Math.floor(s / 60) + " min old";
  if (s < 86400) return Math.floor(s / 3600) + " h old";
  return Math.floor(s / 86400) + " d old";
}

// ---- deck-level: declarations in the qmd front matter, ids in polls.local.json ----

type Declared = Record<string, { question: string; options: string[] }>;
type LocalEntry = { id: string; url: string; created_at: number; question: string; history: string[] };
type LocalFile = Record<string, LocalEntry>;

function deckPaths(dir: string) {
  const deck = resolve(dir);
  if (!existsSync(deck)) die("no such deck directory: " + dir);
  const qmds = readdirSync(deck).filter((f) => f.endsWith(".qmd") && !f.startsWith("_") && f !== "sample_design.qmd");
  const preferred = join(deck, basename(deck) + ".qmd");
  const qmd = existsSync(preferred) ? preferred : qmds.length === 1 ? join(deck, qmds[0]) : null;
  if (!qmd) die("cannot pick the deck qmd in " + dir + " (expected " + basename(deck) + ".qmd)");
  return { deck, qmd, local: join(deck, LOCAL) };
}

function declaredPolls(qmd: string): Declared {
  const text = readFileSync(qmd, "utf8");
  const m = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(text);
  if (!m) die("no YAML front matter in " + qmd);
  const meta: any = Bun.YAML.parse(m[1]);
  const polls = meta?.polls;
  if (!polls || typeof polls !== "object") die("no `polls:` block in the front matter of " + basename(qmd));
  const out: Declared = {};
  for (const [name, p] of Object.entries<any>(polls)) {
    if (!/^[A-Za-z][\w-]*$/.test(name)) die("poll name `" + name + "` must be an identifier");
    const question = String(p?.question || "").trim();
    const options = Array.isArray(p?.options) ? p.options.map((o: any) => String(o).trim()).filter(Boolean) : [];
    if (!question) die("polls." + name + " has no question");
    if (options.length < 2) die("polls." + name + " needs at least two options");
    out[name] = { question, options };
  }
  return out;
}

function readLocal(path: string): LocalFile {
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return die("cannot parse " + path); }
}
function writeLocal(path: string, data: LocalFile) {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

switch (cmd) {
  case "rotate": {
    if (!target) die("deck directory required");
    const { qmd, local } = deckPaths(target);
    const decl = declaredPolls(qmd);
    const current = readLocal(local);
    // create-first: every new poll exists and is read back before the file changes,
    // so a failure mid-run leaves the deck pointing at polls that still exist.
    const fresh: Record<string, any> = {};
    for (const [name, p] of Object.entries(decl)) {
      const created = await createPoll(p.question, p.options);
      const back = await call("GET", "/polls/" + created.id, undefined, false);
      if (!back?.id || back.id !== created.id) die("poll " + name + " did not read back after create");
      fresh[name] = back;
    }
    const next: LocalFile = {};
    for (const [name, back] of Object.entries(fresh)) {
      const prev = current[name];
      const history = prev ? [...(prev.history || []), prev.id].filter((x, i, a) => a.indexOf(x) === i) : [];
      next[name] = { id: back.id, url: back.url, created_at: back.created_at, question: decl[name].question, history };
    }
    // declarations that were removed from the qmd keep their entry so prune can still find the ids
    for (const [name, entry] of Object.entries(current)) if (!next[name]) next[name] = entry;
    writeLocal(local, next);
    for (const [name, e] of Object.entries(next)) {
      if (!fresh[name]) continue;
      console.log(name + ": " + e.id + "  " + e.url + "  (previous kept: " + (e.history.length ? e.history.join(", ") : "none") + ")");
    }
    console.log("wrote " + local + " (gitignored). Now render the deck on this machine.");
    break;
  }
  case "prune": {
    if (!target) die("deck directory required");
    const { local } = deckPaths(target);
    const data = readLocal(local);
    const live = new Set(Object.values(data).map((e) => e.id));
    const victims: { name: string; id: string }[] = [];
    for (const [name, e] of Object.entries(data)) for (const id of e.history || []) if (!live.has(id)) victims.push({ name, id });
    if (!victims.length) { console.log("nothing to prune"); break; }
    for (const v of victims) console.log("would delete " + v.id + "  (" + v.name + ": " + data[v.name].question + ")");
    if (!flag("yes")) { console.log("dry run; add --yes to delete these " + victims.length); break; }
    for (const v of victims) {
      await call("DELETE", "/polls/" + v.id);
      data[v.name].history = data[v.name].history.filter((x) => x !== v.id);
      console.log("deleted " + v.id);
    }
    writeLocal(local, data);
    break;
  }
  case "create": {
    const title = arg("title") || die("--title required");
    const options = (arg("options") || die("--options \"A|B|C\" required")).split("|").map((s) => s.trim()).filter(Boolean);
    const poll = await createPoll(title, options);
    console.log(poll.id);
    console.log(poll.url);
    console.log("shortcodes (legacy id form; prefer a `polls:` declaration + name=):");
    console.log("  {{< poll id=\"" + poll.id + "\" >}}");
    console.log("  {{< poll id=\"" + poll.id + "\" mode=\"results\" labels=\"" + options.join("|") + "\" >}}");
    break;
  }
  case "status": {
    if (!target) die("poll id or deck directory required");
    if (existsSync(target)) {
      const { local } = deckPaths(target);
      const data = readLocal(local);
      if (!Object.keys(data).length) die("no " + LOCAL + " in " + target + " (run rotate first)");
      for (const [name, e] of Object.entries(data)) {
        const res = await call("GET", "/polls/" + e.id + "/results", undefined, false);
        console.log(name + ": " + e.id + "  " + age(e.created_at) + "  " + e.question);
        const total = printCounts(res, "  ");
        console.log("  " + (total === 0 ? "fresh" : "STALE: " + total + " vote(s) already in"));
      }
      break;
    }
    const res = await call("GET", "/polls/" + target + "/results", undefined, false);
    const poll = await call("GET", "/polls/" + target, undefined, false);
    printCounts({ ...res, is_open: poll.is_open });
    break;
  }
  case "reset": {
    if (!target) die("poll id required");
    await call("DELETE", "/polls/" + target + "/results");
    console.log("reset " + target);
    break;
  }
  case "close": {
    if (!target) die("poll id required");
    const after = await setDeadline(target, Math.floor(Date.now() / 1000));
    // Observed 2026-09-10: the API stores deadline_at but keeps reporting is_open: true;
    // the voting page enforces the deadline. Verify with `status`, not with is_open.
    console.log("closed " + target + " (deadline_at now " + after.poll_config.deadline_at + ")");
    break;
  }
  case "open": {
    if (!target) die("poll id required");
    const after = await setDeadline(target, null);
    console.log("opened " + target + " (deadline_at now " + after.poll_config.deadline_at + ")");
    break;
  }
  case "delete": {
    if (!target) die("poll id required");
    await call("DELETE", "/polls/" + target);
    console.log("deleted " + target);
    break;
  }
  default:
    die("usage: strawpoll.ts rotate|status|prune <deck-dir> | create --title T --options \"A|B\" | status|reset|close|open|delete <id>", 2);
}
