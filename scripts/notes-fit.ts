#!/usr/bin/env bun
/* Speaker-view notes fit check (SlideCraft speaker-view gate, panel row C10).
 *
 *   bun scripts/notes-fit.ts <deck-dir> [--layout default|wide|tall|notes-only] [--width 1100] [--height 700]
 *                                       [--stock] [--screenshots <dir>] [--top 3] [--json <file>] [--chrome <bin>]
 *
 * Opens the RENDERED deck (_output/<deck>/<deck>.html) over http in headless chromium, presses
 * the real notes plugin's open(), attaches to the popup it creates, sets the delivery layout,
 * walks every slide and measures #speaker-controls scrollHeight against clientHeight in a
 * <width>x<height> window (the size the plugin asks for). One line per slide; exit 1 only when
 * a notes block overflows. --stock switches the Slide Foundation speaker styling off inside the
 * popup (window.SlideFoundationSpeaker.off()) so the two looks can be compared; --screenshots
 * writes PNGs of the --top tallest blocks. The popup is driven over CDP directly: no puppeteer. */

import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const argv = process.argv.slice(2);
const VALUE_FLAGS = new Set(["--layout", "--width", "--height", "--screenshots", "--top", "--json", "--chrome"]);
function flag(name: string): string | undefined { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; }
const positional = argv.filter((a, i) => !a.startsWith("--") && !VALUE_FLAGS.has(argv[i - 1] ?? ""));
const deckArg = positional[0];
if (!deckArg) {
  console.error("usage: bun scripts/notes-fit.ts <deck-dir> [--layout L] [--width W] [--height H] [--stock] [--screenshots dir] [--top N] [--json file]");
  process.exit(2);
}
const repoRoot = resolve(import.meta.dir, "..");
const deck = basename(resolve(deckArg).replace(/\/$/, ""));
const outDir = join(repoRoot, "_output", deck);
const htmlName = deck + ".html";
if (!existsSync(join(outDir, htmlName))) { console.error("not rendered: " + join(outDir, htmlName)); process.exit(2); }
const LAYOUTS = ["default", "wide", "tall", "notes-only"];
const layout = flag("--layout") ?? "default";
if (!LAYOUTS.includes(layout)) { console.error("--layout must be one of " + LAYOUTS.join(", ")); process.exit(2); }
const num = (name: string, dflt: number) => {
  const n = Number(flag(name) ?? dflt);
  if (!Number.isFinite(n) || n <= 0 || n !== Math.floor(n)) { console.error(name + " must be a positive integer"); process.exit(2); }
  return n;
};
const width = num("--width", 1100);
const height = num("--height", 700);
const top = num("--top", 3);
const stock = argv.includes("--stock");
const shotDir = flag("--screenshots");
const jsonOut = flag("--json");
/* chromium: --chrome, NOTES_FIT_CHROME, a chrome-headless-shell on PATH, then the puppeteer
   cache (newest build first, the 152 build excluded: it hangs on load, seen 2026-09-13) */
function findChrome(): string | null {
  const explicit = flag("--chrome") ?? process.env.NOTES_FIT_CHROME;
  if (explicit) return existsSync(explicit) ? explicit : null;
  const onPath = Bun.which("chrome-headless-shell");
  if (onPath) return onPath;
  const cache = join(process.env.HOME ?? "", ".cache/puppeteer/chrome-headless-shell");
  if (!existsSync(cache)) return null;
  const builds = readdirSync(cache).filter((d) => /^linux-\d/.test(d) && !d.startsWith("linux-152.")).sort().reverse();
  for (const b of builds) {
    const bin = join(cache, b, "chrome-headless-shell-linux64", "chrome-headless-shell");
    if (existsSync(bin)) return bin;
  }
  return null;
}
const chromeBin = findChrome();
if (!chromeBin) {
  console.error("no chromium: pass --chrome <bin>, set NOTES_FIT_CHROME, put chrome-headless-shell on PATH, or run: bunx @puppeteer/browsers install chrome-headless-shell@149.0.7827.22");
  process.exit(2);
}

/* ---------- static server for the rendered deck ---------- */
const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch(req) {
    let p = decodeURIComponent(new URL(req.url).pathname);
    if (p === "/") p = "/" + htmlName;
    const file = join(outDir, p);
    if (!file.startsWith(outDir) || !existsSync(file) || statSync(file).isDirectory()) return new Response("not found", { status: 404 });
    return new Response(Bun.file(file));
  },
});
const deckUrl = "http://127.0.0.1:" + server.port + "/" + htmlName;

/* ---------- minimal CDP client ---------- */
type Msg = { id?: number; method?: string; params?: any; result?: any; error?: any; sessionId?: string };
class Cdp {
  private ws!: WebSocket;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private handlers: ((m: Msg) => void)[] = [];
  async connect(url: string) {
    this.ws = new WebSocket(url);
    await new Promise<void>((res, rej) => { this.ws.onopen = () => res(); this.ws.onerror = (e) => rej(new Error("ws error " + String(e))); });
    this.ws.onclose = () => { for (const p of this.pending.values()) p.reject(new Error("CDP socket closed")); this.pending.clear(); };
    this.ws.onmessage = (ev) => {
      const m = JSON.parse(String(ev.data)) as Msg;
      if (m.id && this.pending.has(m.id)) {
        const p = this.pending.get(m.id)!; this.pending.delete(m.id);
        m.error ? p.reject(new Error(m.method + " " + JSON.stringify(m.error))) : p.resolve(m.result);
      } else this.handlers.forEach((h) => h(m));
    };
  }
  send(method: string, params: any = {}, sessionId?: string): Promise<any> {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { if (this.pending.delete(id)) reject(new Error(method + " timed out after 60s")); }, 60000);
      this.pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
    });
  }
  on(h: (m: Msg) => void) { this.handlers.push(h); }
  close() { this.ws.close(); }
}
const verbose = argv.includes("--verbose") || !!process.env.NOTES_FIT_DEBUG;
const log = (s: string) => { if (verbose) console.error("[notes-fit] " + s); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => Promise<boolean>, what: string, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return; await sleep(150); }
  throw new Error("timeout waiting for " + what);
}

/* ---------- launch chromium ---------- */
const profile = join(tmpdir(), "notes-fit-" + process.pid);
const chrome = Bun.spawn([
  chromeBin, "--headless", "--remote-debugging-port=0", "--user-data-dir=" + profile, "--no-first-run", "--no-sandbox",
  "--disable-gpu", "--disable-dev-shm-usage", "--disable-popup-blocking", "--window-size=" + width + "," + height, "about:blank",
], { stderr: "pipe", stdout: "ignore" });
function cleanup() { try { chrome.kill(); } catch {} try { server.stop(true); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} }
process.on("exit", cleanup);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { cleanup(); process.exit(130); });
let wsUrl = "";
{
  const reader = chrome.stderr.getReader();
  let buf = "";
  const t0 = Date.now();
  while (!wsUrl && Date.now() - t0 < 20000) {
    const { value, done } = await Promise.race([reader.read(), sleep(20000).then(() => ({ value: undefined, done: true }))]);
    if (done) break;
    buf += new TextDecoder().decode(value);
    const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
    if (m) wsUrl = m[1];
  }
  if (!wsUrl) { console.error("chromium did not expose DevTools:\n" + buf); chrome.kill(); process.exit(2); }
  /* keep draining stderr: a full pipe blocks chromium's writer and freezes the renderer */
  (async () => {
    try { for (;;) { const { value, done } = await reader.read(); if (done) break; if (verbose) console.error("[chromium] " + new TextDecoder().decode(value).trim()); } } catch {}
  })();
}

log("chromium up: " + wsUrl + ", deck at " + deckUrl);
const cdp = new Cdp();
await cdp.connect(wsUrl);
log("cdp connected");
const evalIn = async (sid: string, expr: string) => {
  const r = await Promise.race([
    cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, sid),
    sleep(15000).then(() => { throw new Error("evaluate hung 15s: " + expr.slice(0, 120)); }),
  ]);
  if (r.exceptionDetails) throw new Error("eval failed: " + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text) + "\n" + expr.slice(0, 200));
  return r.result.value;
};

let exitCode = 0;
try {
  const { targetId: deckTarget } = await cdp.send("Target.createTarget", { url: deckUrl });
  const { sessionId: deckSid } = await cdp.send("Target.attachToTarget", { targetId: deckTarget, flatten: true });
  await cdp.send("Runtime.enable", {}, deckSid);
  log("deck target " + deckTarget);
  await until(() => evalIn(deckSid, "!!(window.Reveal && Reveal.isReady && Reveal.isReady())"), "Reveal ready");
  log("Reveal ready");
  await evalIn(deckSid, "localStorage.setItem('reveal-speaker-layout', " + JSON.stringify(layout) + "); true");

  /* open the real speaker window and attach to it (the new page target; chromium's own
     initial about:blank page is excluded by snapshotting the target list first) */
  const before = new Set<string>(((await cdp.send("Target.getTargets")).targetInfos as any[]).map((x) => x.targetId));
  await evalIn(deckSid, "Reveal.getPlugin('notes').open(); true");
  let popupTarget = "";
  await until(async () => {
    const { targetInfos } = await cdp.send("Target.getTargets");
    const t = targetInfos.find((x: any) => x.type === "page" && x.openerId === deckTarget)
      ?? targetInfos.find((x: any) => x.type === "page" && !before.has(x.targetId));
    if (t) popupTarget = t.targetId;
    return !!popupTarget;
  }, "speaker window", 15000);
  log("popup target " + popupTarget);
  const { sessionId: popSid } = await cdp.send("Target.attachToTarget", { targetId: popupTarget, flatten: true });
  await cdp.send("Runtime.enable", {}, popSid);
  await cdp.send("Page.enable", {}, popSid);
  await cdp.send("Page.enable", {}, deckSid);
  /* a JS dialog anywhere in a page freezes its main thread and every evaluate with it */
  cdp.on((m) => {
    if (m.method === "Inspector.targetCrashed") {
      console.error("notes-fit: renderer crashed (" + (m.sessionId === popSid ? "popup" : "deck") + ")");
      cleanup(); process.exit(2);
    }
    if (m.method === "Page.javascriptDialogOpening") {
      log("dialog in " + (m.sessionId === popSid ? "popup" : "deck") + ": " + JSON.stringify(m.params?.message));
      cdp.send("Page.handleJavaScriptDialog", { accept: true }, m.sessionId).catch(() => {});
    } else if (m.method === "Runtime.exceptionThrown") {
      log("exception in " + (m.sessionId === popSid ? "popup" : "deck") + ": " + (m.params?.exceptionDetails?.exception?.description ?? m.params?.exceptionDetails?.text ?? "").slice(0, 200));
    } else if (verbose && m.method && !/^(Runtime\.consoleAPICalled|Runtime\.executionContext|Page\.(frame|lifecycle|domContent|load))/.test(m.method)) {
      log("event " + m.method + (m.sessionId === popSid ? " (popup)" : ""));
    }
  });
  /* size the popup as a real window (Emulation.setDeviceMetricsOverride stalls layout in the
     headless shell popup, so the window bounds are set instead and the inner size is reported) */
  const { windowId } = await cdp.send("Browser.getWindowForTarget", { targetId: popupTarget });
  await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width, height } });
  await until(() => evalIn(popSid, "(function(){var c=document.querySelector('#connection-status');return !!c && c.style.display==='none';})()"), "speaker window handshake").catch(async (e) => {
    const diag = await evalIn(popSid, "(function(){var c=document.querySelector('#connection-status');var o='';try{o=window.opener&&window.opener.location.origin;}catch(x){o='err '+x.message;}return JSON.stringify({status:c?c.textContent:'no template',origin:window.location.origin,opener:o,ready:document.readyState,frames:document.querySelectorAll('iframe').length,frameSrc:(document.querySelector('iframe')||{}).src});})()").catch((x) => String(x));
    throw new Error(e.message + " " + diag);
  });
  /* the extension must have dressed the popup in both modes; otherwise the run would silently
     measure the stock look and report against the wrong window */
  await until(() => evalIn(popSid, "!!(window.SlideFoundationSpeaker && window.SlideFoundationSpeaker.active)"), "speaker styling (speaker-view.js did not dress the popup: is the deck on slide-foundation 0.5.0?)", 10000);
  log("handshake done");
  const styledAtOpen = await evalIn(popSid, "!!document.getElementById('sf-speaker-style')");
  if (stock) await evalIn(popSid, "window.SlideFoundationSpeaker.off(); true");
  await evalIn(popSid, "document.body.setAttribute('data-speaker-layout', " + JSON.stringify(layout) + "); true");

  /* enumerate slides in the deck */
  const slides: { h: number; v: number; title: string; text: string; hasNotes: boolean; markdown: boolean; hasBadge: boolean }[] = JSON.parse(await evalIn(deckSid, `(function(){
    var out=[]; Reveal.getHorizontalSlides().forEach(function(hs,h){
      var vs=Array.prototype.slice.call(hs.querySelectorAll(':scope > section'));
      (vs.length?vs:[hs]).forEach(function(s,v){
        /* reveal's own rule: data-notes (markdown) wins, else every aside.notes outside a fragment */
        var t=s.querySelector('h1,h2,h3'), text='', has=false, md=false;
        if(s.hasAttribute('data-notes')){ text=s.getAttribute('data-notes'); has=true; md=true; }
        else { var asides=Array.prototype.filter.call(s.querySelectorAll('aside.notes'),function(a){return !a.closest('.fragment');});
          has=asides.length>0; text=asides.map(function(a){return a.textContent;}).join(' '); }
        out.push({h:h,v:vs.length?v:0,title:((t&&t.textContent)||s.id||s.className||'').trim().replace(/\\s+/g,' ').slice(0,48),
          text:text.trim().replace(/\\s+/g,' '),hasNotes:has,markdown:md,hasBadge:!!s.querySelector('.poll-join__badge')});
      });
    }); return JSON.stringify(out); })()`));
  const deckStyled = await evalIn(deckSid, "!!document.getElementById('sf-speaker-style')");

  const measure = `(function(){var sc=document.querySelector('#speaker-controls'),nv=document.querySelector('.speaker-controls-notes .value'),cs=getComputedStyle(nv),tag=document.querySelector('.sf-tag');
    return JSON.stringify({needed:sc.scrollHeight,available:sc.clientHeight,notesHeight:Math.round(nv.getBoundingClientRect().height),fontSize:cs.fontSize,maxWidth:cs.maxWidth,
      tags:document.querySelectorAll('.sf-tag').length,tagOpacity:tag?getComputedStyle(tag).opacity:null,bg:getComputedStyle(document.body).backgroundColor,
      styled:!!document.getElementById('sf-speaker-style'),layout:document.body.getAttribute('data-speaker-layout'),winW:window.innerWidth,winH:window.innerHeight});})()`;
  /* poll.js badge inside the popup's current-slide receiver frame (speaker view only); a probe
     that cannot reach the frame reports 'unavailable' rather than failing the fit check */
  const badgeProbe = `(function(){try{var fr=document.querySelector('#current-slide iframe');var d=fr&&fr.contentDocument;var b=d&&d.querySelector('section.present .poll-join__badge');
    return b?JSON.stringify({hidden:b.hidden,text:b.textContent}):null;}catch(e){return 'cross-origin';}})()`;
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const popupNotes = "(function(){var n=document.querySelector('.speaker-controls-notes'),v=document.querySelector('.speaker-controls-notes .value');return n.classList.contains('hidden')?'':v.textContent;})()";
  async function goTo(s: { h: number; v: number; text: string; markdown: boolean }) {
    const previous = norm(await evalIn(popSid, popupNotes));
    await evalIn(deckSid, "Reveal.slide(" + s.h + "," + s.v + "); true");
    if (s.markdown) {
      /* data-notes are markdown rendered by the popup, so text equality cannot be used;
         wait for the pane to change (or settle) instead */
      await until(async () => norm(await evalIn(popSid, popupNotes)) !== previous, "notes change", 3000).catch(() => {});
    } else {
      await until(async () => norm(await evalIn(popSid, popupNotes)) === norm(s.text), "notes sync on slide " + s.h + "." + s.v, 20000);
    }
    await sleep(120);
  }

  const rows: any[] = [];
  log(slides.length + " slides enumerated");
  for (const s of slides) {
    await goTo(s);
    log("measured " + s.h + "." + s.v);
    const m = JSON.parse(await evalIn(popSid, measure));
    let badge: any = null;
    if (s.hasBadge) {
      const b = await evalIn(popSid, badgeProbe).catch(() => "unavailable");
      badge = b && b !== "cross-origin" && b !== "unavailable" ? JSON.parse(b) : b;
    }
    const overflow = s.hasNotes ? m.needed > m.available + 1 : false;
    rows.push({ slide: s.h + "." + s.v, title: s.title, hasNotes: s.hasNotes, words: s.text ? s.text.split(" ").length : 0, ...m, badge, overflow });
  }
  const lum = (rgb: string) => {
    if (/rgba\(0, 0, 0, 0\)/.test(rgb)) return "transparent, renders white";
    const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(rgb);
    return m ? ((0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255).toFixed(3) : "?";
  };
  const first = rows[0] ?? {};
  console.log("notes-fit " + deck + ": " + rows.length + " slides, window " + width + "x" + height + ", layout " + layout + ", " + (stock ? "STOCK look" : "Slide Foundation look"));
  console.log("  popup inner " + first.winW + "x" + first.winH + ", styled at open: " + styledAtOpen + ", deck document styled: " + deckStyled + ", body bg " + first.bg + " (luminance " + lum(first.bg ?? "") + "), notes font " + first.fontSize + ", max-width " + first.maxWidth);
  const withBadge = rows.filter((r) => r.badge && r.badge !== "cross-origin");
  if (withBadge.length) console.log("  poll badge in speaker frame: " + withBadge.map((r) => r.slide + " hidden=" + r.badge.hidden + " text=" + JSON.stringify(r.badge.text)).join("; "));
  for (const r of rows) {
    const tagInfo = r.tags ? " tags " + r.tags + " (opacity " + r.tagOpacity + ")" : "";
    console.log("  slide " + r.slide.padEnd(5) + (r.overflow ? "OVERFLOW " : "ok       ") + String(r.needed).padStart(4) + " / " + String(r.available).padStart(4) + " px  " + String(r.words).padStart(3) + " w  " + JSON.stringify(r.title) + tagInfo);
  }
  const over = rows.filter((r) => r.overflow);
  const tallest = [...rows].filter((r) => r.hasNotes).sort((a, b) => b.needed - a.needed).slice(0, top);
  console.log("  tallest: " + tallest.map((r) => r.slide + " (" + r.needed + "px)").join(", "));
  if (shotDir) {
    mkdirSync(shotDir, { recursive: true });
    for (const r of tallest) {
      const [h, v] = r.slide.split(".").map(Number);
      await goTo(slides.find((s) => s.h === h && s.v === v)!);
      const { data } = await cdp.send("Page.captureScreenshot", { format: "png" }, popSid);
      const file = join(shotDir, deck + "-" + layout + "-" + (stock ? "stock" : "sf") + "-" + r.slide + ".png");
      writeFileSync(file, Buffer.from(data, "base64"));
      console.log("  screenshot " + file);
    }
  }
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ deck, layout, width, height, stock, styledAtOpen, deckStyled, rows }, null, 2));
  console.log((over.length ? "FAIL" : "OK") + ": " + over.length + " of " + rows.length + " notes blocks overflow the speaker window" + (over.length ? " (" + over.map((r) => r.slide).join(", ") + ")" : ""));
  exitCode = over.length ? 1 : 0;
} catch (e) {
  console.error("notes-fit error: " + (e as Error).message);
  exitCode = 2;
} finally {
  cdp.close();
  try { chrome.kill(); await chrome.exited; } catch {}
  cleanup();
}
process.exit(exitCode);
