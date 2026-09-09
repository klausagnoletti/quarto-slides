-- {{< poll id="StrawPollId" >}}                         -> join block: QR + short URL
-- {{< poll id="StrawPollId" mode="results" labels="A|B|C|D" >}}
--                                                        -> results block: one bar per label
--                                                           (pipe-separated, commas allowed),
--                                                           filled live by poll.js over http(s)
-- Optional: url="https://..." overrides the join URL (default https://strawpoll.com/<id>),
--           label="text" overrides the short URL text shown under the QR.
-- Only runs for HTML/revealjs output; other formats get nothing. Everything is
-- styled through the foundation token contract (poll.css); no skin-specific CSS.

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

return {
  ["poll"] = function(args, kwargs)
    if not quarto.doc.is_format("html:js") then
      return pandoc.Null()
    end
    local id = kw(kwargs, "id")
    if not id then
      -- visible, non-fatal fallback so a missing id doesn't break the render
      return pandoc.RawBlock("html",
        '<div class="poll-join poll-join--missing" title="poll shortcode: id missing">[poll: id missing]</div>')
    end
    local mode = kw(kwargs, "mode") or "join"
    local url = kw(kwargs, "url") or ("https://strawpoll.com/" .. id)

    if mode == "results" then
      local labels = split_labels(kw(kwargs, "labels") or "")
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

    -- join mode
    local resolver = script_dir() .. "resolve-qr.ts"
    local ok, svg = pcall(pandoc.pipe, "bun", { resolver, url }, "")
    if not ok or svg == nil or svg == "" then
      quarto.log.warning("poll: QR not resolved for " .. url .. " (is the qrcode package installed? bun add qrcode)")
      svg = '<span class="poll-qr poll-qr--missing" title="QR not resolved">[QR]</span>'
    end
    local shown = kw(kwargs, "label") or url:gsub("^https?://", "")
    local host, path = shown:match("^([^/]+)/?(.*)$")
    return pandoc.RawBlock("html",
      '<div class="poll-join" data-poll-id="' .. esc(id) .. '">' ..
      '<a class="poll-join__qr" href="' .. esc(url) .. '" target="_blank" rel="noopener">' .. svg .. '</a>' ..
      '<div class="poll-join__code">' ..
      '<span class="poll-join__url">' .. esc(host or shown) .. '</span>' ..
      '<span class="poll-join__key">' .. esc(path or "") .. '</span>' ..
      '</div></div>')
  end
}
