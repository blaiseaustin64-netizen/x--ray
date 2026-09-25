# VEXDYN X-Ray

Real website diagnostic scanner. Dark graphite + cyan X-Ray UI on Cloudflare Pages + Functions.

## Architecture

```
URL → Validate (SSRF-safe) → Secure Fetch → Evidence Extract
    → Independent Scanners → Score → Report → Frontend
```

Each scanner is isolated with its own timeout. One failure never kills the whole scan.

## Real checks (current)

| Scanner | What it inspects |
|---------|------------------|
| Title | Presence, length |
| Meta | Description, Open Graph |
| Headings | H1 count, structure |
| Canonical | link rel=canonical |
| Robots | /robots.txt fetch |
| Sitemap | /sitemap.xml |
| Images | Missing/empty alt |
| Links | Internal vs external |
| Viewport | Mobile meta |
| HTTPS | Protocol + mixed content |
| Headers | HSTS, CSP, X-CTO, XFO, RP |
| HTTP | Status, timing |

## Local development (VS Code / laptop)

```bash
cd vexdyn-xray
npm install
npm run dev
# → http://localhost:8788
```

Requires Node 18+ and a Cloudflare account login for some Wrangler features (`npx wrangler login`).

### Manual API test

```bash
curl -s -X POST http://localhost:8788/api/scan \
  -H 'content-type: application/json' \
  -d '{"url":"example.com"}' | jq .
```

### Security tests

```bash
# Should reject
curl -s -X POST http://localhost:8788/api/scan \
  -H 'content-type: application/json' \
  -d '{"url":"http://127.0.0.1"}' 

curl -s -X POST http://localhost:8788/api/scan \
  -H 'content-type: application/json' \
  -d '{"url":"http://169.254.169.254"}'
```

## Deploy (Cloudflare Pages)

1. Connect the GitHub repo to Pages
2. Build command: *(empty)*
3. Output directory: `/`
4. Functions are auto-detected from `/functions`

Or: `npm run deploy`

## Project layout

```
functions/
  api/scan.js              # POST /api/scan
  lib/
    validate.js            # URL + SSRF guards
    fetch-secure.js        # timeouts, redirects, size limits
    extract.js             # HTML evidence
    score.js / report.js
    rate-limit.js
    scanners/              # independent modules
js/scanner/engine.js       # client → /api/scan
index.html + css/          # unchanged visual system
```

## Not yet built

- Performance (Lighthouse / CWV)
- Deep accessibility (axe rules)
- Advanced security (dependency / TLS grade)
- AI visibility
- Design critique
- Nyven / Forge integrations

## License

Private — VEXDYN
