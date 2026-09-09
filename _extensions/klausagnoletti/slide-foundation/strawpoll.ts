#!/usr/bin/env bun
// StrawPoll v3 CLI for the slide foundation poll toolbox. The API key never
// reaches the deck: it is read here, at the presenter's terminal, from 1Password.
//
//   bun strawpoll.ts create --title "Question" --options "A|B|C|D"
//   bun strawpoll.ts status <id>          per-option counts (keyless endpoint)
//   bun strawpoll.ts reset  <id>          delete all votes, reopen
//   bun strawpoll.ts close  <id>          set the deadline to now
//   bun strawpoll.ts open   <id>          clear the deadline
//   bun strawpoll.ts delete <id>
//
// Key: env STRAWPOLL_API_KEY, else `op read` of STRAWPOLL_OP_REF
// (default op://Relations Security/StrawPoll API/credential).
const API = "https://api.strawpoll.com/v3";
const OP_REF = process.env.STRAWPOLL_OP_REF || "op://Relations Security/StrawPoll API/credential";

function die(msg: string, code = 1): never {
  console.error("strawpoll: " + msg);
  process.exit(code);
}

async function apiKey(): Promise<string> {
  if (process.env.STRAWPOLL_API_KEY) return process.env.STRAWPOLL_API_KEY;
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
  return out;
}

async function call(method: string, path: string, body?: unknown, keyed = true) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (keyed) headers["X-API-Key"] = await apiKey();
  const r = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!r.ok) die(method + " " + path + " -> HTTP " + r.status + " " + (json?.error?.message || text));
  return json;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf("--" + name);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (v !== undefined && v.startsWith("--")) die("--" + name + " needs a value");
  return v;
}

const [cmd, id] = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && (i === 0 || !all[i - 1].startsWith("--")));

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

function printCounts(p: any) {
  const opts = (p.poll_options || []).slice().sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
  const total = opts.reduce((s: number, o: any) => s + (o.vote_count || 0), 0);
  for (const o of opts) console.log(String(o.vote_count || 0).padStart(5) + "  " + o.value);
  console.log("total " + total + (p.is_open === false ? "  (closed)" : ""));
}

switch (cmd) {
  case "create": {
    const title = arg("title") || die("--title required");
    const options = (arg("options") || die("--options \"A|B|C\" required")).split("|").map((s) => s.trim()).filter(Boolean);
    if (options.length < 2) die("need at least two options");
    const poll = await call("POST", "/polls", {
      title, type: "multiple_choice",
      poll_options: options.map((value) => ({ type: "text", value })),
      poll_config: {
        is_private: true,                 // unlisted, reachable only by link/QR
        duplication_checking: "session",  // one vote per phone session; ip would block a shared venue NAT
        edit_vote_permissions: "nobody",
        hide_share_button: true,
        allow_comments: false,
        require_captcha: false,
      },
    });
    console.log(poll.id);
    console.log(poll.url);
    console.log("shortcodes:");
    console.log("  {{< poll id=\"" + poll.id + "\" >}}");
    console.log("  {{< poll id=\"" + poll.id + "\" mode=\"results\" labels=\"" + options.join("|") + "\" >}}");
    break;
  }
  case "status": {
    if (!id) die("poll id required");
    const res = await call("GET", "/polls/" + id + "/results", undefined, false);
    const poll = await call("GET", "/polls/" + id, undefined, false);
    printCounts({ ...res, is_open: poll.is_open });
    break;
  }
  case "reset": {
    if (!id) die("poll id required");
    await call("DELETE", "/polls/" + id + "/results");
    console.log("reset " + id);
    break;
  }
  case "close": {
    if (!id) die("poll id required");
    const after = await setDeadline(id, Math.floor(Date.now() / 1000));
    // Observed 2026-09-10: the API stores deadline_at but keeps reporting is_open: true;
    // the voting page enforces the deadline. Verify with `status`, not with is_open.
    console.log("closed " + id + " (deadline_at now " + after.poll_config.deadline_at + ")");
    break;
  }
  case "open": {
    if (!id) die("poll id required");
    const after = await setDeadline(id, null);
    console.log("opened " + id + " (deadline_at now " + after.poll_config.deadline_at + ")");
    break;
  }
  case "delete": {
    if (!id) die("poll id required");
    await call("DELETE", "/polls/" + id);
    console.log("deleted " + id);
    break;
  }
  default:
    die("usage: strawpoll.ts create --title T --options \"A|B\" | status|reset|close|open|delete <id>", 2);
}
