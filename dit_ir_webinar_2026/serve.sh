#!/bin/bash
# Serve the rendered deck over http://localhost so cross-site iframes
# (the Wooclap result frames) load. From file:// Chromium renders them blank.
# Usage: bash dit_ir_webinar_2026/serve.sh   then open the printed URL.
cd "$(dirname "$0")/../_output/dit_ir_webinar_2026" || exit 1
echo "Open: http://localhost:8765/dit_ir_webinar_2026.html"
exec python3 -m http.server 8765
