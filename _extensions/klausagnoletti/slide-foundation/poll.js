<script>
/* Slide Foundation: live poll runtime (StrawPoll v3).
   Fills .poll-results[data-poll-id] blocks from the keyless endpoint
   GET https://api.strawpoll.com/v3/polls/{id}/results (CORS open, no key, ever),
   only while that slide is current (2 s interval) plus one prefetch when it is
   next. Widths are the only thing set from JS; colours and motion come from
   poll.css via the token contract. Works from file:// as well as http. */
window.addEventListener('load', function () {
  /* QR panel: keep modules dark on light whatever the skin (see poll.css).
     Colours are normalised through a canvas so oklch()/color() tokens parse too. */
  (function () {
    if (!window.SlideFoundation) return;
    var ctx = document.createElement('canvas').getContext('2d');
    function lum(c) {
      if (!c || !ctx) return null;
      ctx.fillStyle = '#000'; ctx.fillStyle = c;
      var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(ctx.fillStyle);
      if (!m) { m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(ctx.fillStyle); if (!m) return null; return (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255; }
      return (0.2126 * parseInt(m[1], 16) + 0.7152 * parseInt(m[2], 16) + 0.0722 * parseInt(m[3], 16)) / 255;
    }
    var surface = lum(SlideFoundation.tokenColor('--surface')), ink = lum(SlideFoundation.tokenColor('--ink'));
    if (surface === null || ink === null || surface <= ink) return;
    document.querySelectorAll('.poll-join__qr').forEach(function (el) { el.classList.add('poll-qr--light-skin'); });
  })();

  if (typeof Reveal === 'undefined') return;
  var API = 'https://api.strawpoll.com/v3/polls/';
  var INTERVAL_MS = 2000;
  var PAUSED = 'Live results paused';
  var blocks = Array.prototype.slice.call(document.querySelectorAll('.poll-results[data-poll-id]'));
  if (!blocks.length) return;

  function note(block, text) {
    var n = block.querySelector('.poll-results__note');
    if (n) n.textContent = text || '';
  }
  function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function pos(o) { return typeof o.position === 'number' ? o.position : 0; }

  function makeRow(label, i) {
    var li = document.createElement('li');
    li.className = 'poll-bar'; li.setAttribute('data-position', String(i));
    var lab = document.createElement('span'); lab.className = 'poll-bar__label'; lab.textContent = label;
    var track = document.createElement('span'); track.className = 'poll-bar__track';
    var fill = document.createElement('span'); fill.className = 'poll-bar__fill'; fill.style.width = '0%';
    track.appendChild(fill);
    var count = document.createElement('span'); count.className = 'poll-bar__count'; count.textContent = '–';
    li.appendChild(lab); li.appendChild(track); li.appendChild(count);
    return li;
  }

  /* Rows come from the shortcode labels. They are trusted only if they match the
     poll's options one to one (same count, same text after normalisation);
     otherwise the list is rebuilt from the API values so counts never land on
     the wrong answer. */
  function ensureRows(block, options) {
    var list = block.querySelector('.poll-bars');
    var rows = list.querySelectorAll('.poll-bar');
    var ok = rows.length === options.length;
    for (var i = 0; ok && i < rows.length; i++) {
      var lab = rows[i].querySelector('.poll-bar__label');
      if (!lab || norm(lab.textContent) !== norm(options[i].value)) ok = false;
    }
    if (ok) return rows;
    if (block.getAttribute('data-poll-rebuilt') !== '1') {
      console.warn('poll: labels in the deck do not match poll ' + block.getAttribute('data-poll-id') + '; using the poll’s own option text');
      block.setAttribute('data-poll-rebuilt', '1');
    }
    list.innerHTML = '';
    options.forEach(function (o, i) { list.appendChild(makeRow(o.value || ('Option ' + (i + 1)), i)); });
    return list.querySelectorAll('.poll-bar');
  }

  function render(block, data) {
    var options = (data.poll_options || []).slice().sort(function (a, b) { return pos(a) - pos(b); });
    var rows = ensureRows(block, options);
    var total = options.reduce(function (s, o) { return s + (o.vote_count || 0); }, 0);
    var max = options.reduce(function (m, o) { return Math.max(m, o.vote_count || 0); }, 0);
    options.forEach(function (o, i) {
      var row = rows[i]; if (!row) return;
      var c = o.vote_count || 0;
      var width = max > 0 ? (c / max) * 100 : 0;
      var pct = total > 0 ? Math.round((c / total) * 100) : 0;
      row.querySelector('.poll-bar__fill').style.width = width + '%';
      row.querySelector('.poll-bar__count').textContent = total > 0 ? (c + ' · ' + pct + '%') : '–';
      row.classList.toggle('poll-bar--lead', max > 0 && c === max);
    });
    note(block, total === 1 ? '1 vote' : total + ' votes');
  }

  var controllers = new Map();
  function fetchOnce(block) {
    var id = block.getAttribute('data-poll-id');
    var ac = typeof AbortController === 'function' ? new AbortController() : null;
    if (ac) controllers.set(block, ac);
    return fetch(API + encodeURIComponent(id) + '/results', { cache: 'no-store', signal: ac ? ac.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        if (!data || !Array.isArray(data.poll_options) || !data.poll_options.length) throw new Error('unexpected response');
        render(block, data); block.setAttribute('data-poll-state', 'live');
      })
      .catch(function (err) {
        if (err && err.name === 'AbortError') return;
        block.setAttribute('data-poll-state', 'error');
        note(block, PAUSED);
        console.warn('poll ' + id + ': ' + (err && err.message));
      });
  }

  /* file:// works too: StrawPoll reflects a null origin (checked 2026-09-10), so a
     deck opened straight from disk still shows live bars. */
  var timers = new Map();
  function start(block) {
    if (timers.has(block)) return;
    fetchOnce(block);
    timers.set(block, setInterval(function () { fetchOnce(block); }, INTERVAL_MS));
  }
  function stop(block) {
    var t = timers.get(block);
    if (t) { clearInterval(t); timers.delete(block); }
    var ac = controllers.get(block);
    if (ac) { ac.abort(); controllers.delete(block); }
  }
  function blocksIn(section) {
    return section ? Array.prototype.slice.call(section.querySelectorAll('.poll-results[data-poll-id]')) : [];
  }
  function topLevel(section) {
    /* a vertical sub-slide's parent is the horizontal section that getHorizontalSlides() knows */
    return section && section.parentNode && section.parentNode.nodeName === 'SECTION' ? section.parentNode : section;
  }
  function sync(current) {
    var live = blocksIn(current);
    blocks.forEach(function (b) { if (live.indexOf(b) < 0) stop(b); });
    live.forEach(start);
    /* one prefetch for the next horizontal slide so the bars are not empty on arrival */
    var hs = Reveal.getHorizontalSlides();
    var idx = hs.indexOf(topLevel(current));
    var next = idx >= 0 ? hs[idx + 1] : null;
    blocksIn(next).forEach(function (b) { if (!timers.has(b)) fetchOnce(b); });
  }
  Reveal.on('slidechanged', function (ev) { sync(ev.currentSlide); });
  var cur = Reveal.getCurrentSlide();
  if (cur) sync(cur);
});
</script>
