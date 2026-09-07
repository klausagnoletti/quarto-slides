-- {{< icon set:name >}}  ->  inline monotone SVG (currentColor), resolved offline.
-- Optional: role=accent|muted|ink to bind the icon colour to a foundation token;
-- default inherits the surrounding text colour (currentColor).
-- Only runs for HTML/revealjs output; other formats get nothing.

local function script_dir()
  local src = debug.getinfo(1, "S").source:sub(2)
  return src:match("(.*[/\\])") or "./"
end

return {
  ["icon"] = function(args, kwargs)
    if not quarto.doc.is_format("html:js") then
      return pandoc.Null()
    end
    local spec = pandoc.utils.stringify(args[1] or "")
    if spec == "" then return pandoc.Null() end

    local resolver = script_dir() .. "resolve-icon.ts"
    local ok, svg = pcall(pandoc.pipe, "bun", { resolver, spec }, "")
    if not ok or svg == nil or svg == "" then
      -- visible, non-fatal fallback so a typo doesn't break the render
      return pandoc.RawInline("html",
        '<span class="icon-slot" title="icon not resolved: ' .. spec .. '">[' .. spec .. ']</span>')
    end

    local role = kwargs["role"] and pandoc.utils.stringify(kwargs["role"]) or ""
    local style = ""
    if role == "accent" then style = "color:var(--accent)"
    elseif role == "muted" then style = "color:var(--muted)"
    elseif role == "ink" then style = "color:var(--ink)" end

    return pandoc.RawInline("html",
      '<span class="icon-slot" style="' .. style .. '">' .. svg .. '</span>')
  end
}
