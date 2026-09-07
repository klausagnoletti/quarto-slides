// Offline icon resolver for the slide foundation.
//   bun resolve-icon.ts <set>:<name>
// Resolves an Iconify icon to a standalone inline <svg> string using currentColor
// (monotone), entirely offline, from the consumer's locally-installed
// @iconify-json/<set> package (e.g. `bun add @iconify-json/tabler`). Prints the
// SVG to stdout for a Quarto shortcode to inline, so embed-resources stays offline.
import { getIconData, iconToSVG, iconToHTML } from "@iconify/utils";
import { existsSync, readFileSync } from "node:fs";

const spec = process.argv[2] || "";
const [set, name] = spec.includes(":") ? spec.split(":") : ["", spec];
if (!set || !name) {
  console.error(`usage: resolve-icon.ts <set>:<name> (got "${spec}")`);
  process.exit(2);
}

// Candidate locations, in priority order: env override, then the standard
// installed-package path resolved from CWD (the render dir) and from this
// extension dir. No network, ever.
const candidates = [
  process.env.ICONIFY_JSON_DIR ? `${process.env.ICONIFY_JSON_DIR}/${set}.json` : "",
  `${process.cwd()}/node_modules/@iconify-json/${set}/icons.json`,
  `${import.meta.dir}/node_modules/@iconify-json/${set}/icons.json`,
  `${import.meta.dir}/../../node_modules/@iconify-json/${set}/icons.json`,
].filter(Boolean);

const path = candidates.find((p) => existsSync(p));
if (!path) {
  console.error(`icon set "${set}" not installed. Run: bun add @iconify-json/${set}`);
  process.exit(3);
}

const iconSet = JSON.parse(readFileSync(path, "utf8"));
const data = getIconData(iconSet, name);
if (!data) {
  console.error(`icon "${name}" not found in set "${set}"`);
  process.exit(4);
}

// height:1em so the icon tracks font-size; monotone body keeps currentColor.
const { attributes, body } = iconToSVG(data, { height: "1em" });
process.stdout.write(iconToHTML(body, attributes));
