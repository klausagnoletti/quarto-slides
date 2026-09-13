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

import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
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
const layout = flag("--layout") ?? "default";
const width = Number(flag("--width") ?? 1100);
const height = Number(flag("--height") ?? 700);
const stock = argv.includes("--stock");
const shotDir = flag("--screenshots");
const top = Number(flag("--top") ?? 3);
const jsonOut = flag("--json");
const chromeBin = flag("--chrome") ?? process.env.NOTES_FIT_CHROME ??
  join(process.env.HOME ?? "", ".cache/puppeteer/chrome-headless-shell/linux-149.0.7827.22/chrome-headless-shell-linux64/chrome-headless-shell");
if (!existsSync(chromeBin)) { console.error("chromium not found: " + chromeBin + " (set --chrome or NOTES_FIT_CHROME)"); process.exit(2); }

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
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
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
  "--disable-gpu", "--disable-popup-blocking", "--window-size=" + width + "," + height, "about:blank",
], { stderr: "pipe", stdout: "ignore" });
let wsUrl = "";
{
  const reader = chrome.stderr.getReader();
  let buf = "";
  const t0 = Date.now();
  while (!wsUrl && Date.now() - t0 < 20000) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += new TextDecoder().decode(value);
    const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
    if (m) wsUrl = m[1];
  }
  reader.releaseLock();
  if (!wsUrl) { console.error("chromium did not expose DevTools:\n" + buf); chrome.kill(); process.exit(2); }
}
function cleanup() { try { chrome.kill(); } catch {} server.stop(true); }

log("chromium up: " + wsUrl + ", deck at " + deckUrl);
const cdp = new Cdp();
await cdp.connect(wsUrl);
log("cdp connected");
const evalIn = async (sid: string, expr: string) => {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, sid);
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

  /* open the real speaker window and attach to it */
  await evalIn(deckSid, "Reveal.getPlugin('notes').open(); true");
  let popupTarget = "";
  await until(async () => {
    const { targetInfos } = await cdp.send("Target.getTargets");
    const t = targetInfos.find((x: any) => x.type === "page" && x.targetId !== deckTarget && (x.openerId === deckTarget || x.url === "about:blank"));
    if (t) popupTarget = t.targetId;
    return !!popupTarget;
  }, "speaker window", 15000);
  log("popup target " + popupTarget);
  const { sessionId: popSid } = await cdp.send("Target.attachToTarget", { targetId: popupTarget, flatten: true });
  await cdp.send("Runtime.enable", {}, popSid);
  await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, popSid);
  await until(() => evalIn(popSid, "(function(){var c=document.querySelector('#connection-status');return !!c && c.style.display==='none';})()"), "speaker window handshake").catch(async (e) => {
    const diag = await evalIn(popSid, "(function(){var c=document.querySelector('#connection-status');var o='';try{o=window.opener&&window.opener.location.origin;}catch(x){o='err '+x.message;}return JSON.stringify({status:c?c.textContent:'no template',origin:window.location.origin,opener:o,ready:document.readyState,frames:document.querySelectorAll('iframe').length,frameSrc:(document.querySelector('iframe')||{}).src});})()").catch((x) => String(x));
    throw new Error(e.message + " " + diag);
  });
  await until(() => evalIn(popSid, "!!(window.SlideFoundationSpeaker && window.SlideFoundationSpeaker.active)"), "speaker styling", 10000).catch(() => {});
  log("handshake done");
  const styledAtOpen = await evalIn(popSid, "!!document.getElementById('sf-speaker-style')");
  if (stock) await evalIn(popSid, "window.SlideFoundationSpeaker ? (window.SlideFoundationSpeaker.off(), true) : false");
  await evalIn(popSid, "document.body.setAttribute('data-speaker-layout', " + JSON.stringify(layout) + "); true");

  /* enumerate slides in the deck */
  const slides: { h: number; v: number; title: string; text: string }[] = JSON.parse(await evalIn(deckSid, `(function(){
    var out=[]; Reveal.getHorizontalSlides().forEach(function(hs,h){
      var vs=Array.prototype.slice.call(hs.querySelectorAll(':scope > section'));
      (vs.length?vs:[hs]).forEach(function(s,v){
        var n=s.querySelector('aside.notes'); var t=s.querySelector('h1,h2,h3');
        out.push({h:h,v:vs.length?v:0,title:((t&&t.textContent)||s.id||s.className||'').trim().replace(/\\s+/g,' ').slice(0,48),
          text:n?n.textContent.trim().replace(/\\s+/g,' '):''});
      });
    }); return JSON.stringify(out); })()`));
  const deckStyled = await evalIn(deckSid, "!!document.getElementById('sf-speaker-style')");

  const measure = `(function(){var sc=document.querySelector('#speaker-controls'),nv=document.querySelector('.speaker-controls-notes .value'),cs=getComputedStyle(nv),tag=document.querySelector('.sf-tag');
    var badge=null; try{var fr=document.querySelector('#current-slide iframe'); var b=fr&&fr.contentDocument&&fr.contentDocument.querySelector('.present .poll-join__badge'); if(b) badge={hidden:b.hidden,text:b.textContent};}catch(e){badge='cross-origin';}
    return JSON.stringify({needed:sc.scrollHeight,available:sc.clientHeight,notesHeight:Math.round(nv.getBoundingClientRect().height),fontSize:cs.fontSize,maxWidth:cs.maxWidth,
      tags:document.querySelectorAll('.sf-tag').length,tagOpacity:tag?getComputedStyle(tag).opacity:null,bg:getComputedStyle(document.body).backgroundColor,
      styled:!!document.getElementById('sf-speaker-style'),layout:document.body.getAttribute('data-speaker-layout'),badge:badge});})()`;
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  async function goTo(s: { h: number; v: number; text: string }) {
    await evalIn(deckSid, "Reveal.slide(" + s.h + "," + s.v + "); true");
    await until(async () => {
      const shown = await evalIn(popSid, "(function(){var n=document.querySelector('.speaker-controls-notes'),v=document.querySelector('.speaker-controls-notes .value');return n.classList.contains('hidden')?'':v.textContent;})()");
      return norm(shown) === norm(s.text);
    }, "notes sync on slide " + s.h + "." + s.v, 20000);
    await sleep(120);
  }

  const rows: any[] = [];
  log(slides.length + " slides enumerated");
  for (const s of slides) {
    await goTo(s);
    log("measured " + s.h + "." + s.v);
    const m = JSON.parse(await evalIn(popSid, measure));
    const overflow = s.text ? m.needed > m.available + 1 : false;
    rows.push({ slide: s.h + "." + s.v, title: s.title, words: s.text ? s.text.split(" ").length : 0, ...m, overflow });
  }
  const lum = (rgb: string) => { const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(rgb); return m ? ((0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255).toFixed(3) : "?"; };
  const first = rows[0] ?? {};
  console.log("notes-fit " + deck + ": " + rows.length + " slides, window " + width + "x" + height + ", layout " + layout + ", " + (stock ? "STOCK look" : "Slide Foundation look"));
  console.log("  popup styled at open: " + styledAtOpen + ", deck document styled: " + deckStyled + ", body bg " + first.bg + " (luminance " + lum(first.bg ?? "") + "), notes font " + first.fontSize + ", max-width " + first.maxWidth);
  const withBadge = rows.filter((r) => r.badge && r.badge !== "cross-origin");
  if (withBadge.length) console.log("  poll badge in speaker frame: " + withBadge.map((r) => r.slide + " hidden=" + r.badge.hidden + " text=" + JSON.stringify(r.badge.text)).join("; "));
  for (const r of rows) {
    const tagInfo = r.tags ? " tags " + r.tags + " (opacity " + r.tagOpacity + ")" : "";
    console.log("  slide " + r.slide.padEnd(5) + (r.overflow ? "OVERFLOW " : "ok       ") + String(r.needed).padStart(4) + " / " + String(r.available).padStart(4) + " px  " + String(r.words).padStart(3) + " w  " + JSON.stringify(r.title) + tagInfo);
  }
  const over = rows.filter((r) => r.overflow);
  const tallest = [...rows].filter((r) => r.words).sort((a, b) => b.needed - a.needed).slice(0, top);
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
  cleanup();
}
process.exit(exitCode);
