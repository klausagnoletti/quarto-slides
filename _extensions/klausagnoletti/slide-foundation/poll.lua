-- Live poll shortcode (StrawPoll). Two forms:
--
--   {{< poll name="practice" >}}                  join block: QR + short URL
--   {{< poll name="practice" mode="results" >}}   results block: one bar per option
--
-- The poll is DECLARED once in the document front matter and never carries an
-- id in the qmd:
--
--   polls:
--     practice:
--       question: "When did you last practice your IR plan?"
--       options: ["A: Under 1 year", "B: 1-3 years", "C: Over 3 years", "D: Don't know"]
--
-- The id comes from polls.local.json next to the qmd, written by
-- `strawpoll.ts rotate <deck>` (gitignored: the id is the join secret of a
-- link-only poll). No id yet -> visible stub + warning, render still succeeds.
-- Plain `quarto render` never talks to the API.
--
-- Legacy form, kept for one version:
--   {{< poll id="StrawPollId" >}} / {{< poll id=".." mode="results" labels="A|B|C" >}}
--
-- Optional on both forms: url="https://..." overrides the join URL,
-- label="text" overrides the short URL text under the QR.
-- HTML/revealjs output only; everything is styled through the token contract (poll.css).

local function script_dir()
  local src = debug.getinfo(1, "S").source:sub(2)
  return src:match("(.*[/\\])") or "./"
end

local function esc(s)
  return (tostring(s):gsub("&", "&amp;"):gsub("<", "&lt;"):gsub(">", "&gt;"):gsub('"', "&quot;"))
end

local function split_labels(s)
  local out = {}
  for part in tostring(s):gmatch("[^|]+") do
    part = part:gsub("^%s+", ""):gsub("%s+$", "")
    if part ~= "" then table.insert(out, part) end
  end
  return out
end

local function kw(kwargs, name)
  local v = kwargs[name]
  if v == nil then return nil end
  v = pandoc.utils.stringify(v)
  if v == "" then return nil end
  return v
end

-- polls.local.json lives beside the input qmd; cached per render
local local_cache = nil
local function local_polls()
  if local_cache ~= nil then return local_cache end
  local_cache = {}
  local input = quarto.doc.input_file
  if not input then return local_cache end
  local dir = input:match("(.*[/\\])") or "./"
  local f = io.open(dir .. "polls.local.json", "r")
  if not f then return local_cache end
  local text = f:read("a"); f:close()
  local ok, data = pcall(quarto.json.decode, text)
  if ok and type(data) == "table" then local_cache = data end
  return local_cache
end

-- meta.polls.<name> -> { question=, options={...} } or nil
local function declared(meta, name)
  local polls = meta and meta.polls
  if type(polls) ~= "table" then return nil end
  local p = polls[name]
  if type(p) ~= "table" then return nil end
  local options = {}
  if type(p.options) == "table" then
    for _, o in ipairs(p.options) do table.insert(options, pandoc.utils.stringify(o)) end
  end
  return { question = p.question and pandoc.utils.stringify(p.question) or "", options = options }
end

local function stub(cls, text, title)
  return pandoc.RawBlock("html",
    '<div class="' .. cls .. ' poll--missing" title="' .. esc(title) .. '">' .. esc(text) .. '</div>')
end

local function results_block(id, url, labels)
  local rows = {}
  for i, lab in ipairs(labels) do
    table.insert(rows, string.format(
      '<li class="poll-bar" data-position="%d">' ..
      '<span class="poll-bar__label">%s</span>' ..
      '<span class="poll-bar__track"><span class="poll-bar__fill" style="width:0%%"></span></span>' ..
      '<span class="poll-bar__count">&ndash;</span></li>', i - 1, esc(lab)))
  end
  return pandoc.RawBlock("html",
    '<div class="poll-results" data-poll-id="' .. esc(id) .. '" data-poll-url="' .. esc(url) .. '">' ..
    '<ol class="poll-bars">' .. table.concat(rows) .. '</ol>' ..
    '<p class="poll-results__note"></p></div>')
end

local function join_block(id, url, shown_label, created_at)
  local resolver = script_dir() .. "resolve-qr.ts"
  local ok, svg = pcall(pandoc.pipe, "bun", { resolver, url }, "")
  if not ok or svg == nil or svg == "" then
    quarto.log.warning("poll: QR not resolved for " .. url .. " (is the qrcode package installed? bun add qrcode)")
    svg = '<span class="poll-qr poll-qr--missing" title="QR not resolved">[QR]</span>'
  end
  local shown = shown_label or url:gsub("^https?://", "")
  local host, path = shown:match("^([^/]+)/?(.*)$")
  local created = created_at and (' data-poll-created="' .. esc(created_at) .. '"') or ""
  return pandoc.RawBlock("html",
    '<div class="poll-join" data-poll-id="' .. esc(id) .. '"' .. created .. '>' ..
    '<a class="poll-join__qr" href="' .. esc(url) .. '" target="_blank" rel="noopener">' .. svg .. '</a>' ..
    '<div class="poll-join__code">' ..
    '<span class="poll-join__url">' .. esc(host or shown) .. '</span>' ..
    '<span class="poll-join__key">' .. esc(path or "") .. '</span>' ..
    -- speaker-view-only freshness badge, filled by poll.js; hidden in the audience window
    '<span class="poll-join__badge" hidden></span>' ..
    '</div></div>')
end

return {
  ["poll"] = function(args, kwargs, meta)
    if not quarto.doc.is_format("html:js") then
      return pandoc.Null()
    end
    local mode = kw(kwargs, "mode") or "join"
    local name = kw(kwargs, "name")
    local id, labels, created_at

    if name then
      local decl = declared(meta, name)
      if not decl then
        quarto.log.warning("poll: no `polls." .. name .. "` in the document front matter")
        return stub("poll-join", "[poll " .. name .. ": not declared]", "add polls." .. name .. " to the front matter")
      end
      local loc = local_polls()[name]
      id = loc and loc.id
      created_at = loc and loc.created_at
      if not id then
        quarto.log.warning("poll: no id for `" .. name .. "` (run: bun _extensions/klausagnoletti/slide-foundation/strawpoll.ts rotate <deck>)")
        return stub(mode == "results" and "poll-results" or "poll-join",
          "[poll " .. name .. ": run rotate]", "polls.local.json has no id for " .. name)
      end
      labels = decl.options
    else
      id = kw(kwargs, "id")
      if not id then
        return stub("poll-join", "[poll: name or id missing]", "poll shortcode: name or id missing")
      end
      labels = split_labels(kw(kwargs, "labels") or "")
    end

    local url = kw(kwargs, "url") or ("https://strawpoll.com/" .. id)
    if mode == "results" then
      return results_block(id, url, labels)
    end
    return join_block(id, url, kw(kwargs, "label"), created_at)
  end
}
