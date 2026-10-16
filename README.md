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

## Deploy checklist (Cloudflare Pages)

1. **Rate limits shared across servers:** `npx wrangler kv namespace create RATE_KV`, then uncomment the binding in `wrangler.toml`.
2. **Real-site check:** nothing to set up. Every scan first does a live DNS lookup (Cloudflare DNS-over-HTTPS), so made-up domains and fake endings are refused before scanning.
3. **Plans and limits:** anonymous 15 scans/day, free accounts 60, pro 500 (per-minute bursts too). Change them with variables such as `RATE_ANON_PER_DAY`, `RATE_FREE_PER_DAY`, `RATE_PRO_PER_MINUTE`.
4. **Connect accounts (profiles/users):**
   - Backend: set `AUTH_VERIFY_URL` (https) to an endpoint that returns `{ "id", "plan" }` for `Authorization: Bearer <token>` (see `functions/lib/identity.js`).
   - Browser: in `js/config.js` set `getAuthToken` to return the session token and `historyBackend` to `"remote"`.
   - Result: limits become per-user, and history syncs across devices.
5. **Synced history:** `npx wrangler d1 create xray-db`, run `schema.sql`, uncomment the `[[d1_databases]]` block (binding `DB`).

## Production setup

- **Rate limiting:** bind a KV namespace as `RATE_KV` (see `wrangler.toml`) so limits are shared across isolates. Also add a Cloudflare Rate Limiting rule on `/api/scan`.
- **CORS:** `/api/scan` is same-origin only. Set `ALLOWED_ORIGINS` (comma-separated) to allow other sites.
- **Tests:** `npm test` (URL/SSRF guards, robots.txt parser, scoring). `npm run check` syntax-checks every source file.
- **Caching:** CSS/JS are always revalidated because filenames are not hashed.

## Scoring notes

- "Response time" is the server fetch time only (no Core Web Vitals yet).
- "Design" is never derived from other scores; it shows as not checked until a design scanner exists.

## Not yet built

- Performance (Lighthouse / CWV)
- Deep accessibility (axe rules)
- Advanced security (dependency / TLS grade)
- AI visibility
- Design critique
- Nyven / Forge integrations

## License

Private — VEXDYN
