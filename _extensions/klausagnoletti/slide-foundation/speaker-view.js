<script>
/* Slide Foundation: speaker-view styling (reveal notes window).
   The notes plugin opens about:blank, names it "reveal.js - Notes", writes its
   own template with document.write and later fills .speaker-controls-notes .value
   with the slide's notes HTML. That window is same-origin with this deck, so the
   deck can dress it: a dark surface for dark rooms, larger notes type, the
   measure capped at 26em, and leading bracketed cue tags ([PAUSE], [ABORT: x])
   dimmed. Colours are the deck's own role tokens (--surface --ink --accent
   --muted); a light skin is flipped (surface and ink swap) so the window is dark
   regardless. Nothing here touches the audience document or the receiver
   iframes; poll.js keeps its speaker-only badge untouched.
   Two entry points: window.open (fresh S press) and the heartbeat message the
   plugin uses to reconnect an orphaned window after a deck reload.
   The popup gets window.SlideFoundationSpeaker = { on, off, active } so the
   build-time fit check (scripts/notes-fit.ts) can compare with the stock look. */
(function () {
  if (/receiver/i.test(window.location.search)) return;
  var STYLE_ID = 'sf-speaker-style';
  var WINDOW_NAME = 'reveal.js - Notes';
  var dressed = typeof WeakSet === 'function' ? new WeakSet() : null;

  var CSS = [
    'body{background:var(--surface);color:var(--ink);font-family:system-ui,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;}',
    '#connection-status{background:var(--surface);color:var(--ink);}',
    '#current-slide iframe,#upcoming-slide iframe{border-color:color-mix(in srgb,var(--ink) 25%,var(--surface));}',
    '.overlay-element{background:color-mix(in srgb,var(--ink) 16%,var(--surface));color:var(--ink);}',
    '.overlay-element.interactive:hover{background:color-mix(in srgb,var(--ink) 26%,var(--surface));}',
    '#speaker-layout{color:var(--ink);}',
    '.speaker-controls-time,.speaker-controls-pace{border-bottom-color:color-mix(in srgb,var(--ink) 20%,var(--surface));}',
    '.speaker-controls-time .label,.speaker-controls-pace .label,.speaker-controls-notes .label{color:var(--muted);}',
    '.speaker-controls-time .reset-button{color:var(--muted);}',
    '.speaker-controls-time .timer{color:var(--accent);}',
    '.speaker-controls-notes .value{font-size:1.4em;line-height:1.45;max-width:26em;}',
    '.speaker-controls-notes .value ul,.speaker-controls-notes .value ol{padding-left:1.1em;margin:.2em 0;}',
    '.speaker-controls-notes .value li{margin:0 0 .35em;}',
    '.speaker-controls-notes .value p{margin:0 0 .5em;}',
    '.sf-tag{color:var(--muted);opacity:.75;font-size:.82em;letter-spacing:.04em;font-weight:400;}'
  ].join('\n');

  /* Role tokens for the popup: the deck's own, with surface/ink swapped when the
     skin is light. Muted is re-derived from the pair so it stays readable after
     a flip; accent passes through. */
  function palette() {
    var SF = window.SlideFoundation;
    var surface = SF ? SF.tokenColor('--surface') : '';
    var ink = SF ? SF.tokenColor('--ink') : '';
    var accent = SF ? SF.tokenColor('--accent') : '';
    if (!surface || !ink) { surface = '#14161a'; ink = '#e8e8e8'; }
    else if (SF.isLightSkin()) { var t = surface; surface = ink; ink = t; }
    if (!accent) accent = ink;
    return ':root{--surface:' + surface + ';--ink:' + ink + ';--accent:' + accent +
      ';--muted:color-mix(in srgb,' + ink + ' 62%,' + surface + ');}';
  }

  /* Wrap a leading [TAG] (upper-case first letter) at the start of a block in
     span.sf-tag. Idempotent: an already wrapped tag leaves no text node that
     still starts with a bracket, so re-running after a mutation is safe. */
  function dimTags(doc, root) {
    var walker = doc.createTreeWalker(root, 4), nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (t) {
      var p = t.parentNode;
      if (!p || (p.classList && p.classList.contains('sf-tag'))) return;
      var prev = t.previousSibling;
      if (prev && !(prev.nodeType === 3 && !prev.nodeValue.trim())) return;
      var m = /^(\s*)(\[[A-Z][^\]\n]{0,60}\])/.exec(t.nodeValue);
      if (!m) return;
      var span = doc.createElement('span');
      span.className = 'sf-tag';
      span.textContent = m[2];
      var rest = doc.createTextNode(t.nodeValue.slice(m[0].length));
      t.nodeValue = m[1];
      p.insertBefore(span, t.nextSibling);
      p.insertBefore(rest, span.nextSibling);
    });
  }
  function undimTags(doc, root) {
    Array.prototype.slice.call(root.querySelectorAll('.sf-tag')).forEach(function (s) {
      s.parentNode.replaceChild(doc.createTextNode(s.textContent), s);
    });
    root.normalize();
  }

  function dress(win) {
    var doc;
    try { doc = win.document; } catch (e) { return false; }
    if (!doc) return false;
    var value = doc.querySelector('.speaker-controls-notes .value');
    if (!value) return false;
    if (doc.getElementById(STYLE_ID)) return true;
    var style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = palette() + '\n' + CSS;
    (doc.head || doc.documentElement).appendChild(style);
    var observer = new win.MutationObserver(function () { dimTags(doc, value); });
    observer.observe(value, { childList: true, subtree: true });
    dimTags(doc, value);
    win.SlideFoundationSpeaker = {
      active: true,
      off: function () {
        var s = doc.getElementById(STYLE_ID); if (s) s.remove();
        observer.disconnect(); undimTags(doc, value); this.active = false;
      },
      on: function () {
        if (doc.getElementById(STYLE_ID)) return;
        (doc.head || doc.documentElement).appendChild(style);
        observer.observe(value, { childList: true, subtree: true });
        dimTags(doc, value); this.active = true;
      }
    };
    return true;
  }

  /* document.write runs synchronously right after window.open returns, so the
     first tick already finds the template; the loop covers slower cases. */
  function watch(win) {
    if (!win || (dressed && dressed.has(win))) return;
    if (dressed) dressed.add(win);
    var tries = 0;
    var timer = setInterval(function () {
      var done = false;
      try { done = win.closed || dress(win); } catch (e) { done = true; }
      if (done || ++tries > 100) clearInterval(timer);
    }, 100);
  }

  var nativeOpen = window.open;
  window.open = function (url, name) {
    var w = nativeOpen.apply(window, arguments);
    if (w && name === WINDOW_NAME) watch(w);
    return w;
  };
  window.addEventListener('message', function (ev) {
    if (typeof ev.data !== 'string' || ev.data.indexOf('reveal-notes') < 0 || !ev.source || ev.source === window) return;
    var d; try { d = JSON.parse(ev.data); } catch (e) { return; }
    if (d && d.namespace === 'reveal-notes' && (d.type === 'heartbeat' || d.type === 'connected')) watch(ev.source);
  });
})();
</script>
