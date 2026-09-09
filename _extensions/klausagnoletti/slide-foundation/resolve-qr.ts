// Offline QR resolver for the slide foundation poll toolbox.
//   bun resolve-qr.ts <url>
// Prints a standalone inline <svg> for the URL, modules drawn in currentColor and
// no background, so the code takes the surrounding text colour of whatever skin
// the deck runs. Same contract as resolve-icon.ts: no network, stdout only, a
// Quarto shortcode inlines the result so embed-resources stays offline.
// Needs the `qrcode` package in the consumer repo (`bun add qrcode`).
const url = process.argv[2] || "";
if (!url) {
  console.error("usage: resolve-qr.ts <url>");
  process.exit(2);
}

let QRCode: any;
try {
  QRCode = (await import("qrcode")).default;
} catch {
  console.error("resolve-qr: the qrcode package is not installed; run `bun add qrcode` in the deck repo");
  process.exit(3);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
let svg: string = await QRCode.toString(url, {
  type: "svg",
  errorCorrectionLevel: "M",
  margin: 1,
  color: { dark: "#000000ff", light: "#00000000" }, // alpha 0 light: renderer emits no background rect
});
svg = svg
  .replace(/fill="#000000(ff)?"/g, 'fill="currentColor"')
  .replace(/stroke="#000000(ff)?"/g, 'stroke="currentColor"')
  .replace("<svg ", '<svg class="poll-qr" role="img" aria-label="QR code for ' + esc(url) + '" ');
process.stdout.write(svg.trim());
