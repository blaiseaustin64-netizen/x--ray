/**
 * Evidence extraction via Cloudflare HTMLRewriter (streaming, Workers-native).
 * No regex HTML parsing. fetchTextResource remains a plain text fetch helper
 * for robots.txt / sitemap.xml (non-HTML).
 */

/**
 * @typedef {Object} PageEvidence
 * @property {string|null} title
 * @property {string|null} metaDescription
 * @property {string|null} canonical
 * @property {string|null} viewport
 * @property {string|null} robotsMeta
 * @property {string|null} ogTitle
 * @property {string|null} ogDescription
 * @property {string[]} h1
 * @property {string[]} h2
 * @property {string[]} h3
 * @property {{src:string, alt:string|null, hasAltAttr:boolean}[]} images
 * @property {{href:string, text:string, rel:string}[]} links
 * @property {boolean} hasHtmlLang
 * @property {string|null} htmlLang
 * @property {number} htmlBytes
 * @property {boolean} truncated
 */

/**
 * Parse HTML with HTMLRewriter and return structured page evidence.
 * @param {string} html
 * @param {object} meta - fetch metadata (finalUrl, status, headers, …)
 * @returns {Promise<PageEvidence>}
 */
export async function extractEvidence(html, meta = {}) {
  const doc = html || "";

  const state = {
    titleParts: [],
    metaDescription: null,
    robotsMeta: null,
    viewport: null,
    ogTitle: null,
    ogDescription: null,
    canonical: null,
    h1: [],
    h2: [],
    h3: [],
    images: [],
    links: [],
    htmlLang: null,
    // heading text buffers
    _h1: "",
    _h2: "",
    _h3: "",
    _title: "",
    // current anchor
    _aHref: null,
    _aRel: "",
    _aText: "",
    _inA: false,
  };

  const rewriter = new HTMLRewriter()
    .on("html", {
      element(el) {
        const lang = el.getAttribute("lang");
        if (lang && !state.htmlLang) state.htmlLang = lang.trim();
      },
    })
    .on("title", {
      text(t) {
        state._title += t.text;
        if (t.lastInTextNode) {
          const cleaned = cleanText(state._title);
          if (cleaned) state.titleParts.push(cleaned);
          state._title = "";
        }
      },
    })
    .on("meta", {
      element(el) {
        const name = (el.getAttribute("name") || "").toLowerCase();
        const property = (el.getAttribute("property") || "").toLowerCase();
        const content = el.getAttribute("content");

        if (content == null) return;

        if (name === "description" && state.metaDescription == null) {
          state.metaDescription = content;
        } else if (name === "robots" && state.robotsMeta == null) {
          state.robotsMeta = content;
        } else if (name === "viewport" && state.viewport == null) {
          state.viewport = content;
        } else if (property === "og:title" && state.ogTitle == null) {
          state.ogTitle = content;
        } else if (property === "og:description" && state.ogDescription == null) {
          state.ogDescription = content;
        }
      },
    })
    .on('link[rel="canonical"]', {
      element(el) {
        const href = el.getAttribute("href");
        if (href && !state.canonical) state.canonical = href.trim();
      },
    })
    // Some pages use mixed-case rel; catch rel containing canonical
    .on("link", {
      element(el) {
        if (state.canonical) return;
        const rel = (el.getAttribute("rel") || "").toLowerCase();
        if (rel.split(/\s+/).includes("canonical")) {
          const href = el.getAttribute("href");
          if (href) state.canonical = href.trim();
        }
      },
    })
    .on("h1", {
      text(t) {
        if (state.h1.length >= 30) return;
        state._h1 += t.text;
        if (t.lastInTextNode) {
          const cleaned = cleanText(state._h1);
          if (cleaned) state.h1.push(cleaned);
          state._h1 = "";
        }
      },
    })
    .on("h2", {
      text(t) {
        if (state.h2.length >= 30) return;
        state._h2 += t.text;
        if (t.lastInTextNode) {
          const cleaned = cleanText(state._h2);
          if (cleaned) state.h2.push(cleaned);
          state._h2 = "";
        }
      },
    })
    .on("h3", {
      text(t) {
        if (state.h3.length >= 30) return;
        state._h3 += t.text;
        if (t.lastInTextNode) {
          const cleaned = cleanText(state._h3);
          if (cleaned) state.h3.push(cleaned);
          state._h3 = "";
        }
      },
    })
    .on("img", {
      element(el) {
        if (state.images.length >= 80) return;
        const src =
          el.getAttribute("src") ||
          el.getAttribute("data-src") ||
          "";
        // HTMLRewriter: missing attribute → null; present empty → ""
        const altAttr = el.getAttribute("alt");
        const hasAltAttr = altAttr !== null;
        state.images.push({
          src: (src || "").trim(),
          alt: hasAltAttr ? String(altAttr).trim() : null,
          hasAltAttr,
        });
      },
    })
    .on("a", {
      element(el) {
        if (state.links.length >= 120) return;
        state._inA = true;
        state._aHref = el.getAttribute("href");
        state._aRel = (el.getAttribute("rel") || "").toLowerCase();
        state._aText = "";
        // When element ends, HTMLRewriter doesn't give endElement on all
        // runtimes the same way — we flush on last text or next a start.
        el.onEndTag(() => {
          flushAnchor(state);
        });
      },
      text(t) {
        if (!state._inA || state.links.length >= 120) return;
        state._aText += t.text;
      },
    });

  // Transform discards rewritten HTML; we only need side-effect collection.
  const response = new Response(doc, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
  const transformed = rewriter.transform(response);
  // Drain the stream so all handlers run
  await transformed.arrayBuffer();

  // Flush any open anchor if onEndTag was not available
  if (state._inA) flushAnchor(state);

  const title =
    state.titleParts.length > 0
      ? cleanText(state.titleParts.join(" "))
      : null;

  return {
    title,
    metaDescription: cleanText(state.metaDescription),
    canonical: state.canonical || null,
    viewport: state.viewport ? state.viewport.trim() : null,
    robotsMeta: state.robotsMeta ? state.robotsMeta.trim() : null,
    ogTitle: cleanText(state.ogTitle),
    ogDescription: cleanText(state.ogDescription),
    h1: state.h1,
    h2: state.h2,
    h3: state.h3,
    images: state.images,
    links: state.links,
    hasHtmlLang: Boolean(state.htmlLang),
    htmlLang: state.htmlLang,
    htmlBytes: meta.htmlBytes ?? new TextEncoder().encode(doc).length,
    truncated: Boolean(meta.truncated),
    finalUrl: meta.finalUrl || null,
    status: meta.status ?? null,
    headers: meta.headers || {},
    elapsedMs: meta.elapsedMs ?? null,
    redirectChain: meta.redirectChain || [],
  };
}

function flushAnchor(state) {
  if (!state._inA) return;
  const href = state._aHref;
  if (href) {
    state.links.push({
      href: href.trim(),
      text: (cleanText(state._aText) || "").slice(0, 120),
      rel: state._aRel || "",
    });
  }
  state._inA = false;
  state._aHref = null;
  state._aRel = "";
  state._aText = "";
}

function cleanText(s) {
  if (s == null) return null;
  const out = String(s)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return out || null;
}

/**
 * Fetch robots.txt / sitemap with short timeout (best-effort, non-HTML).
 */
export async function fetchTextResource(url, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "VEXDYN-XRay/1.0 (+https://vexdyn.com; security research scanner)",
        Accept: "text/plain,text/xml,application/xml,*/*",
      },
    });
    if (!res.ok) return { ok: false, status: res.status, body: null };
    const text = await res.text();
    return { ok: true, status: res.status, body: text.slice(0, 200_000) };
  } catch {
    return { ok: false, status: 0, body: null };
  } finally {
    clearTimeout(timer);
  }
}
