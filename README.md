# VEXDYN X-Ray

Standalone website diagnosis product. Dark graphite + cyan X-Ray visual system.

## Features

- **Cinematic scan** — URL input → animated beam, grid, live callouts, phase statuses
- **Full report** — overall score (0–100), category scores, expandable findings with “Why it matters” + recommended fix
- **Modular scanner** — demo data today; swap `js/scanner/engine.js` for real engines without UI rewrite
- **Mobile-first** — premium glass panels, glow, micro-animations
- **No backend required** — pure static; ready for Cloudflare Pages

## Quick start

```bash
# Any static server
npx serve .
# or
python3 -m http.server 8080
```

Open `http://localhost:8080` (or the port shown).

## Project structure

```
vexdyn-xray/
├── index.html
├── css/
│   ├── main.css          # imports
│   ├── variables.css     # design tokens
│   ├── base.css
│   ├── layout.css
│   ├── scan.css          # viewport, beam, callouts
│   ├── results.css
│   └── responsive.css
├── js/
│   ├── app.js            # view orchestration
│   ├── data/
│   │   └── demo-scan.js  # structured demo payload
│   ├── scanner/
│   │   └── engine.js     # pluggable scan runner
│   └── ui/
│       ├── scan-view.js
│       └── results-view.js
└── README.md
```

## Extending scanners

```js
// js/scanner/engine.js
import { registerEngine } from "./engine.js";

registerEngine("lighthouse", async (url) => { /* … */ });
registerEngine("security", async (url) => { /* … */ });
```

UI consumes a single report object (`createDemoReport` shape). Replace `runScan` internals when real APIs are ready.

## Cloudflare Pages

1. Connect repo or upload the `vexdyn-xray` folder.
2. Build command: *(none — static)*
3. Output directory: `/` (or project root)
4. Deploy.

Optional `_headers` / `_redirects` can be added later for caching and SPA fallbacks.

## Design DNA

Preserved & upgraded from the original Claude X-Ray demo:

- Graphite background (`#07080a`)
- Cyan beam & glow (`#62E6FF`)
- Scan grid + medical/X-ray atmosphere
- Compact glass cards, animated score ring
- Flow: **SCAN → REVEAL → DIAGNOSE → FIX → RE-SCAN**
