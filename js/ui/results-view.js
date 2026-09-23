/**
 * Results / diagnose / fix renderer.
 */

export function createResultsView(root) {
  const scoreNum = root.querySelector("[data-score-num]");
  const scoreRing = root.querySelector("[data-score-ring]");
  const scoreLabel = root.querySelector("[data-score-label]");
  const scoreVerdict = root.querySelector("[data-score-verdict]");
  const roastEl = root.querySelector("[data-roast]");
  const tagsEl = root.querySelector("[data-tags]");
  const categoriesEl = root.querySelector("[data-categories]");
  const findingsEl = root.querySelector("[data-findings]");
  const urlLabel = root.querySelector("[data-result-url]");

  function render(report) {
    if (urlLabel) urlLabel.textContent = report.url;

    // Animated score
    animateScore(scoreNum, scoreRing, report.overallScore, report.verdictLevel);

    if (scoreLabel) scoreLabel.textContent = "out of 100";
    if (scoreVerdict) {
      scoreVerdict.textContent = report.verdict;
      scoreVerdict.className = `score-verdict ${report.verdictLevel}`;
    }

    if (roastEl) {
      roastEl.innerHTML = report.summary;
    }

    if (tagsEl) {
      tagsEl.innerHTML = (report.tags || [])
        .map((t) => `<span class="tag">${escapeHtml(t.label)}</span>`)
        .join("");
    }

    if (categoriesEl) {
      categoriesEl.innerHTML = (report.categories || [])
        .map(
          (c) => `
        <div class="score-cat">
          <div class="cat-score ${c.level}">${c.score}</div>
          <div class="cat-name">${escapeHtml(c.name)}</div>
        </div>`
        )
        .join("");
    }

    if (findingsEl) {
      findingsEl.innerHTML = (report.findings || [])
        .map((f, i) => findingCard(f, i === 0))
        .join("");

      // Expand/collapse
      findingsEl.querySelectorAll("[data-finding-toggle]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const card = btn.closest(".finding");
          const open = card.classList.toggle("is-open");
          btn.setAttribute("aria-expanded", open ? "true" : "false");
        });
      });
    }
  }

  function clear() {
    if (scoreNum) scoreNum.textContent = "0";
    if (scoreRing) {
      scoreRing.style.setProperty("--score-pct", "0%");
      scoreRing.style.setProperty("--score-color", "var(--scan)");
    }
  }

  return { render, clear };
}

function findingCard(f, defaultOpen = false) {
  const openClass = defaultOpen ? "is-open" : "";
  return `
    <div class="finding ${openClass}" data-finding-id="${escapeHtml(f.id)}">
      <button class="finding-header" type="button" data-finding-toggle aria-expanded="${defaultOpen}">
        <span class="finding-severity ${f.severity}"></span>
        <span class="finding-meta">
          <span class="finding-title">${escapeHtml(f.title)}</span>
          <span class="finding-tag">
            <span class="badge ${f.severity}">${escapeHtml(f.badge)}</span>
            ${escapeHtml(f.category)}
          </span>
        </span>
        <svg class="finding-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>
      <div class="finding-body">
        <div class="finding-why">
          <div class="finding-label">Why it matters</div>
          <div class="finding-text">${escapeHtml(f.why)}</div>
        </div>
        <div class="finding-fix">
          <div class="finding-label">Recommended fix</div>
          <div class="finding-text">${escapeHtml(f.fix)}</div>
        </div>
      </div>
    </div>`;
}

function animateScore(numEl, ringEl, target, level) {
  if (!numEl || !ringEl) return;

  const colors = {
    good: "var(--good)",
    warn: "var(--warn)",
    danger: "var(--danger)",
  };
  const color = colors[level] || "var(--scan)";
  ringEl.style.setProperty("--score-color", color);

  const duration = 1100;
  const start = performance.now();
  const from = 0;

  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const val = Math.round(from + (target - from) * eased);
    numEl.textContent = val;
    ringEl.style.setProperty("--score-pct", `${val}%`);
    if (t < 1) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
