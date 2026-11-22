// Genera todas las páginas HTML del sitio en public/.

import fs from "node:fs";
import path from "node:path";
import config from "../config.js";

const T = {
  en: {
    tagline: "Economy, markets, tech & the world — what moves your money",
    trending: "Trending now",
    latest: "Just in",
    seeAll: "See all",
    readAt: "Read the full story at",
    whyMatters: "Why it matters",
    keyPoints: "Key points",
    related: "More stories",
    share: "Share",
    copy: "Copy link",
    copied: "Link copied",
    sources: "sources",
    via: "via",
    ad: "Advertisement",
    home: "Home",
    about: "About",
    privacy: "Privacy",
    updated: "Updated",
    summaryBy: "Summary written by the PixelContent newsroom from public reports. Original reporting belongs to",
    footer:
      "PixelContent gathers headlines from trusted outlets and links to the original reporting. Headlines, images and trademarks belong to their respective owners.",
    breaking: "Breaking",
    markets: "Markets",
    coveredBy: (n) => `${n} outlets covering`,
    langName: "English",
    other: "Español",
    catIntro: (c) => `The latest ${c.toLowerCase()} news from the world's leading outlets, updated around the clock.`,
  },
  es: {
    tagline: "Economía, bolsa, tecnología y el mundo — lo que mueve tu dinero",
    trending: "Tendencias",
    latest: "Lo último",
    seeAll: "Ver todo",
    readAt: "Lee la nota completa en",
    whyMatters: "Por qué importa",
    keyPoints: "Puntos clave",
    related: "Más noticias",
    share: "Compartir",
    copy: "Copiar enlace",
    copied: "Enlace copiado",
    sources: "fuentes",
    via: "vía",
    ad: "Publicidad",
    home: "Inicio",
    about: "Quiénes somos",
    privacy: "Privacidad",
    updated: "Actualizado",
    summaryBy: "Resumen escrito por la redacción de PixelContent a partir de información pública. La nota original pertenece a",
    footer:
      "PixelContent reúne titulares de medios confiables y enlaza a la nota original. Titulares, imágenes y marcas pertenecen a sus respectivos dueños.",
    breaking: "Última hora",
    markets: "Mercados",
    coveredBy: (n) => `${n} medios lo cubren`,
    langName: "Español",
    other: "English",
    catIntro: (c) => `Las noticias más recientes de ${c.toLowerCase()} de los principales medios, actualizadas todo el día.`,
  },
};

const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cats = config.categories;
const catOf = (id) => cats.find((c) => c.id === id) || cats[0];
const ICON = {
  economy: "M3 17l6-6 4 4 8-8M14 7h7v7",
  markets: "M4 19V9M10 19V5M16 19v-7M22 19H2",
  tech: "M4 5h16v11H4zM8 20h8M12 16v4",
  gadgets: "M12 2l2.4 5.6L20 10l-5.6 2.4L12 18l-2.4-5.6L4 10l5.6-2.4z",
  crypto: "M9 4v16M13 4v16M7 8h8a3 3 0 010 6H7m0 0h9a3 3 0 010 6H7",
  politics: "M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M12 3l9 5H3z",
  world: "M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18",
};
const icon = (id, size = 18) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON[id] || ICON.world}"/></svg>`;

function fmtPrice(m) {
  const p = m.price;
  if (p == null) return "—";
  const d = p >= 1000 ? 0 : p >= 10 ? 2 : 4;
  return p.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function renderSite({ editions, summaries, markets, root }) {
  const out = path.join(root, "public");
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, "assets"), { recursive: true });
  for (const f of fs.readdirSync(path.join(root, "src"))) fs.copyFileSync(path.join(root, "src", f), path.join(out, "assets", f));

  const site = (config.siteUrl || "").replace(/\/$/, "");
  const builtAt = new Date().toISOString();
  const ads = config.adsense;
  const sitemap = [];
  let count = 0;

  const write = (rel, html) => {
    const file = path.join(out, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, html);
    if (site) sitemap.push(`${site}/${rel.replace(/index\.html$/, "")}`);
    count++;
  };

  for (const lang of ["en", "es"]) {
    const t = T[lang];
    const other = lang === "en" ? "es" : "en";
    const stories = editions[lang];
    const sums = summaries[lang] || {};
    const base = lang === "en" ? "" : "es/";

    // depth → prefijo relativo hacia la raíz del sitio
    const prefixFor = (rel) => "../".repeat((base + rel).split("/").length - 1);
    const hasPage = (s) => !!sums[s.id];
    const headline = (s) => (sums[s.id]?.headline || s.title);
    const hrefFor = (s, pre) => (hasPage(s) ? `${pre}${base}story/${s.id}.html` : s.link);
    const ext = (s) => (hasPage(s) ? "" : ` target="_blank" rel="noopener nofollow"`);

    const distinct = (list) => {
      const seen = new Set();
      return list.filter((s) => !seen.has(s.cluster || s.id) && seen.add(s.cluster || s.id));
    };
    const byScore = distinct([...stories].sort((a, b) => b.score - a.score));
    const byDate = [...stories].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    const recentScored = byScore.filter((s) => Date.now() - Date.parse(s.date) < 36 * 3600e3);

    // ── piezas ──────────────────────────────────────────────
    const thumb = (s, cls = "") => {
      const c = catOf(s.cat);
      return `<div class="thumb ${cls}${s.image ? "" : " noimg"}" style="--c:${c.color}">
  <span class="ph">${icon(c.id, 34)}<b>${esc(c[lang])}</b></span>
  ${s.image ? `<img src="${esc(s.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('noimg');this.remove()">` : ""}
</div>`;
    };
    const kicker = (s, pre) => {
      const c = catOf(s.cat);
      return `<a class="kicker" href="${pre}${base}${c.id}.html" style="--c:${c.color}">${esc(c[lang])}</a>`;
    };
    const meta = (s) =>
      `<div class="meta"><span class="src">${esc(s.source)}</span><span class="dot"></span><time datetime="${s.date}">${s.date.slice(0, 10)}</time>${
        s.coverage >= 3 ? `<span class="hot" title="${esc(t.coveredBy(s.coverage))}">🔥 ${s.coverage}</span>` : ""
      }</div>`;

    const card = (s, pre, variant = "card") => {
      const h = hrefFor(s, pre);
      const ex = sums[s.id]?.summary?.split(/(?<=\.)\s/)[0] || s.excerpt;
      if (variant === "row")
        return `<article class="row"><a href="${esc(h)}"${ext(s)}>${thumb(s, "sm")}</a><div>${kicker(s, pre)}<h3><a href="${esc(h)}"${ext(s)}>${esc(headline(s))}</a></h3>${meta(s)}</div></article>`;
      if (variant === "mini")
        return `<article class="mini"><h3><a href="${esc(h)}"${ext(s)}>${esc(headline(s))}</a></h3>${meta(s)}</article>`;
      return `<article class="${variant}"><a href="${esc(h)}"${ext(s)} class="img-link">${thumb(s)}</a><div class="body">${kicker(s, pre)}<h3><a href="${esc(h)}"${ext(s)}>${esc(
        headline(s)
      )}</a></h3>${variant !== "small" && ex ? `<p>${esc(ex)}</p>` : ""}${meta(s)}</div></article>`;
    };

    const adBox = (slot, cls = "") => {
      if (ads.client && ads.slots[slot])
        return `<div class="ad ${cls}"><span class="ad-label">${t.ad}</span><ins class="adsbygoogle" style="display:block" data-ad-client="${esc(ads.client)}" data-ad-slot="${esc(
          ads.slots[slot]
        )}" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></div>`;
      if (!ads.client && ads.showPlaceholders) return `<div class="ad ad-ph ${cls}"><span class="ad-label">${t.ad}</span><span>AdSense · ${slot}</span></div>`;
      return "";
    };

    const trendingList = (list, pre) =>
      `<section class="trending"><h2 class="sec-title"><span>${t.trending}</span></h2><ol>${list
        .map(
          (s, i) =>
            `<li><span class="num">${i + 1}</span><div><a href="${esc(hrefFor(s, pre))}"${ext(s)}>${esc(headline(s))}</a>${meta(s)}</div></li>`
        )
        .join("")}</ol></section>`;

    const head = ({ title, desc, rel, image, jsonld = "", altRel }) => {
      const pre = prefixFor(rel);
      const canonical = site ? `${site}/${base}${rel.replace(/index\.html$/, "")}` : "";
      const alt = altRel !== undefined && site ? `${site}/${other === "es" ? "es/" : ""}${altRel.replace(/index\.html$/, "")}` : "";
      return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${canonical ? `<link rel="canonical" href="${canonical}">` : ""}
${alt ? `<link rel="alternate" hreflang="${lang}" href="${canonical}"><link rel="alternate" hreflang="${other}" href="${alt}">` : ""}
<meta property="og:type" content="${jsonld ? "article" : "website"}">
<meta property="og:site_name" content="${config.siteName}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
${canonical ? `<meta property="og:url" content="${canonical}">` : ""}
${image ? `<meta property="og:image" content="${esc(image)}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0b1020">
<link rel="icon" href="${pre}assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${pre}assets/styles.css">
${ads.client ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(ads.client)}" crossorigin="anonymous"></script>` : ""}
${jsonld}
</head>`;
    };

    const header = (rel, active, altRel) => {
      const pre = prefixFor(rel);
      const toggleHref = `${pre}${other === "es" ? "es/" : ""}${altRel ?? "index.html"}`;
      const tick = byDate.slice(0, 14);
      const now = new Date();
      return `<body data-lang="${lang}"${rel === "index.html" ? ` data-home="${lang}"` : ""}>
<div class="topbar"><div class="wrap">
  <span class="today" data-today>${now.toISOString().slice(0, 10)}</span>
  <span class="updated">${t.updated} <time datetime="${builtAt}">${builtAt.slice(11, 16)} UTC</time></span>
  <div class="lang"><a href="${pre}${base}${rel}" class="on" aria-current="true">${lang.toUpperCase()}</a><a href="${toggleHref}" data-setlang="${other}" hreflang="${other}">${other.toUpperCase()}</a></div>
</div></div>
<header class="masthead"><div class="wrap">
  <a class="logo" href="${pre}${base}index.html" aria-label="${config.siteName}"><span class="logo-mark">P</span><span class="logo-word">pixel<em>content</em></span></a>
  <p class="tagline">${t.tagline}</p>
  <button class="menu-btn" aria-label="Menu" data-menu>${'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>'}</button>
</div></header>
<nav class="catnav" data-nav><div class="wrap">
  <a href="${pre}${base}index.html" class="${active === "home" ? "on" : ""}">${t.home}</a>
  ${cats.map((c) => `<a href="${pre}${base}${c.id}.html" class="${active === c.id ? "on" : ""}" style="--c:${c.color}">${icon(c.id, 15)}${esc(c[lang])}</a>`).join("")}
</div></nav>
${
  markets.length
    ? `<div class="markets" aria-label="${t.markets}"><div class="mk-track">${[...markets, ...markets]
        .map(
          (m) =>
            `<span class="mk"><b>${esc(m.label)}</b> ${fmtPrice(m)} <i class="${m.change >= 0 ? "up" : "down"}">${m.change >= 0 ? "▲" : "▼"} ${Math.abs(m.change || 0).toFixed(2)}%</i></span>`
        )
        .join("")}</div></div>`
    : ""
}
<div class="breaking"><div class="wrap"><span class="b-label">${t.breaking}</span><div class="b-window"><div class="b-track">${[...tick, ...tick]
        .map((s) => `<a href="${esc(hrefFor(s, pre))}"${ext(s)}>${esc(headline(s))}</a>`)
        .join("<span class=\"sep\">•</span>")}</div></div></div></div>`;
    };

    const footer = (rel) => {
      const pre = prefixFor(rel);
      return `<footer class="footer"><div class="wrap">
  <div class="f-brand"><a class="logo" href="${pre}${base}index.html"><span class="logo-mark">P</span><span class="logo-word">pixel<em>content</em></span></a><p>${t.footer}</p></div>
  <div class="f-links">${cats.map((c) => `<a href="${pre}${base}${c.id}.html">${esc(c[lang])}</a>`).join("")}</div>
  <div class="f-links"><a href="${pre}${base}about.html">${t.about}</a><a href="${pre}${base}privacy.html">${t.privacy}</a><a href="${pre}${other === "es" ? "es/" : ""}index.html" data-setlang="${other}">${t.other}</a></div>
  <p class="copy">© ${new Date().getFullYear()} ${config.siteName}</p>
</div></footer>
<div class="toast" data-toast>${t.copied}</div>
<script src="${pre}assets/app.js" defer></script>
</body></html>`;
    };

    // ── portada ─────────────────────────────────────────────
    {
      const rel = "index.html";
      const pre = prefixFor(rel);
      const pool = recentScored.length > 10 ? recentScored : byScore;
      const used = new Set();
      const usedClusters = new Set();
      const take = (list, n, pred = () => true) => {
        const r = [];
        for (const s of list) {
          if (r.length >= n) break;
          if (used.has(s.id) || usedClusters.has(s.cluster) || !pred(s)) continue;
          used.add(s.id);
          usedClusters.add(s.cluster);
          r.push(s);
        }
        return r;
      };
      const [lead] = take(pool, 1, (s) => s.image);
      const seenCats = new Set([lead?.cat]);
      const second = take(pool, 4, (s) => s.image && !seenCats.has(s.cat) && seenCats.add(s.cat));
      if (second.length < 4) second.push(...take(pool, 4 - second.length, (s) => s.image));
      const latest = byDate.filter((s) => !used.has(s.id)).slice(0, 8);
      const trending = byScore.slice(0, 10);

      const sections = cats
        .map((c, i) => {
          const list = take(
            [...stories].filter((s) => s.cat === c.id).sort((a, b) => b.score - a.score),
            7
          );
          list.sort((a, b) => !!b.image - !!a.image);
          if (!list.length) return "";
          const [big, ...rest] = list;
          const side = rest.slice(0, 2);
          const bottom = rest.slice(2, 6);
          return `<section class="cat-sec" style="--c:${c.color}">
  <h2 class="sec-title"><span>${icon(c.id, 18)} ${esc(c[lang])}</span><a href="${pre}${base}${c.id}.html">${t.seeAll} →</a></h2>
  <div class="cat-grid">${card(big, pre, "card big")}<div class="cat-side">${side.map((s) => card(s, pre, "card small")).join("")}</div></div>
  ${bottom.length ? `<div class="grid4">${bottom.map((s) => card(s, pre, "row")).join("")}</div>` : ""}
</section>${i % 2 === 1 ? adBox("infeed", "wide") : ""}`;
        })
        .join("");

      const html =
        head({
          title: `${config.siteName} — ${t.tagline}`,
          desc: t.tagline,
          rel,
          image: lead?.image,
          altRel: "index.html",
        }) +
        header(rel, "home", "index.html") +
        `<main class="wrap">
${adBox("leaderboard", "wide top")}
<section class="hero">
  ${lead ? card(lead, pre, "card lead") : ""}
  <div class="hero-side">${second.map((s) => card(s, pre, "card small")).join("")}</div>
</section>
<div class="layout">
  <div class="main-col">${sections}</div>
  <aside class="side-col">
    <section class="latest"><h2 class="sec-title"><span><i class="live"></i>${t.latest}</span></h2>${latest.map((s) => card(s, pre, "mini")).join("")}</section>
    ${trendingList(trending, pre)}
    ${adBox("sidebar", "sticky")}
  </aside>
</div>
</main>` +
        footer(rel);
      write(base + rel, html);
    }

    // ── páginas por categoría ───────────────────────────────
    for (const c of cats) {
      const rel = `${c.id}.html`;
      const pre = prefixFor(rel);
      const list = stories.filter((s) => s.cat === c.id);
      const top = distinct([...list].sort((a, b) => b.score - a.score));
      const lead = top.find((s) => s.image) || top[0];
      const rest = list.filter((s) => s !== lead).sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 72);
      const chunks = [];
      for (let i = 0; i < rest.length; i += 12) chunks.push(rest.slice(i, i + 12));
      const html =
        head({ title: `${c[lang]} — ${config.siteName}`, desc: t.catIntro(c[lang]), rel, image: lead?.image, altRel: rel }) +
        header(rel, c.id, rel) +
        `<main class="wrap">
<div class="cat-head" style="--c:${c.color}"><span class="cat-icon">${icon(c.id, 28)}</span><div><h1>${esc(c[lang])}</h1><p>${esc(t.catIntro(c[lang]))}</p></div></div>
${adBox("leaderboard", "wide")}
<div class="layout">
  <div class="main-col">
    ${lead ? card(lead, pre, "card lead") : ""}
    ${chunks.map((ch) => `<div class="grid3">${ch.map((s) => card(s, pre, "card")).join("")}</div>`).join(adBox("infeed", "wide"))}
  </div>
  <aside class="side-col">${trendingList(top.slice(0, 8), pre)}${adBox("sidebar", "sticky")}</aside>
</div>
</main>` +
        footer(rel);
      write(base + rel, html);
    }

    // ── páginas de noticia (solo con resumen propio) ────────
    for (const s of stories) {
      const sum = sums[s.id];
      if (!sum) continue;
      const rel = `story/${s.id}.html`;
      const pre = prefixFor(rel);
      const c = catOf(s.cat);
      const related = byScore.filter((r) => r.cat === s.cat && r.id !== s.id).slice(0, 6);
      const jsonld = `<script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        headline: sum.headline,
        description: sum.summary.slice(0, 200),
        image: s.image ? [s.image] : undefined,
        datePublished: s.firstSeen || s.date,
        dateModified: sum.at,
        inLanguage: lang,
        publisher: { "@type": "Organization", name: config.siteName },
        isBasedOn: s.link,
      }).replace(/</g, "\\u003c")}</script>`;
      const html =
        head({ title: `${sum.headline} — ${config.siteName}`, desc: sum.summary.slice(0, 158), rel, image: s.image, jsonld }) +
        header(rel, c.id) +
        `<main class="wrap">
<div class="layout">
  <article class="story main-col">
    <nav class="crumbs"><a href="${pre}${base}index.html">${t.home}</a> › <a href="${pre}${base}${c.id}.html">${esc(c[lang])}</a></nav>
    ${kicker(s, pre)}
    <h1>${esc(sum.headline)}</h1>
    ${meta(s)}
    ${thumb(s, "story-img")}
    <div class="share" data-share data-title="${esc(sum.headline)}">
      <span>${t.share}</span>
      <button data-net="native" class="sh-native">↗</button>
      <a data-net="x" aria-label="X">𝕏</a><a data-net="facebook" aria-label="Facebook">f</a><a data-net="whatsapp" aria-label="WhatsApp">WA</a><a data-net="telegram" aria-label="Telegram">TG</a><a data-net="linkedin" aria-label="LinkedIn">in</a>
      <button data-net="copy">${t.copy}</button>
    </div>
    <div class="story-body">
      <p class="lede">${esc(sum.summary)}</p>
      <div class="why" style="--c:${c.color}"><h2>${t.whyMatters}</h2><p>${esc(sum.why_it_matters)}</p></div>
      ${adBox("article", "inline")}
      <h2>${t.keyPoints}</h2>
      <ul class="points">${(sum.key_points || []).map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
      <a class="cta" href="${esc(s.link)}" target="_blank" rel="noopener">${t.readAt} ${esc(s.source)} →</a>
      <p class="credit">${t.summaryBy} <a href="${esc(s.link)}" target="_blank" rel="noopener nofollow">${esc(s.source)}</a>.</p>
      <div class="tags">${(sum.tags || []).map((g) => `<span>#${esc(g)}</span>`).join("")}</div>
    </div>
    <h2 class="sec-title"><span>${t.related}</span></h2>
    <div class="grid3">${related.map((r) => card(r, pre, "card")).join("")}</div>
  </article>
  <aside class="side-col">${trendingList(byScore.slice(0, 8), pre)}${adBox("sidebar", "sticky")}</aside>
</div>
</main>` +
        footer(rel);
      write(base + rel, html);
    }

    // ── about / privacy (AdSense pide estas páginas) ────────
    const staticPage = (rel, title, bodyHtml) =>
      write(base + rel, head({ title: `${title} — ${config.siteName}`, desc: title, rel, altRel: rel }) + header(rel, "", rel) + `<main class="wrap"><article class="page">${bodyHtml}</article></main>` + footer(rel));

    const srcList = [...new Set(config.feeds[lang].map((f) => f.name))].join(", ");
    if (lang === "en") {
      staticPage(
        "about.html",
        "About",
        `<h1>About PixelContent</h1><p>PixelContent is an independent news hub covering the economy, stock markets, technology, gadgets, crypto, politics and geopolitics — the stories that move markets and your money.</p><p>We monitor leading outlets around the clock (${esc(srcList)}) and rank stories by how widely they are being reported and how much they matter economically. Our newsroom writes original summaries and context for the most important stories, and every item links to the original reporting.</p><p>Contact: <a href="mailto:${esc(config.contactEmail)}">${esc(config.contactEmail)}</a></p>`
      );
      staticPage(
        "privacy.html",
        "Privacy Policy",
        `<h1>Privacy Policy</h1><p>Last updated: ${builtAt.slice(0, 10)}</p><p>PixelContent does not require an account and does not collect personal information directly. Your language preference is stored only in your browser.</p><h2>Advertising and cookies</h2><p>We use Google AdSense to show ads. Google and its partners use cookies to serve ads based on your prior visits to this and other websites. You can opt out of personalized advertising at <a href="https://adssettings.google.com" target="_blank" rel="noopener">Google Ads Settings</a> or <a href="https://www.aboutads.info" target="_blank" rel="noopener">aboutads.info</a>. See <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener">how Google uses data from partner sites</a>.</p><h2>External links</h2><p>Stories link to third-party websites with their own privacy policies.</p><h2>Contact</h2><p><a href="mailto:${esc(config.contactEmail)}">${esc(config.contactEmail)}</a></p>`
      );
    } else {
      staticPage(
        "about.html",
        "Quiénes somos",
        `<h1>Quiénes somos</h1><p>PixelContent es un sitio independiente de noticias de economía, bolsa, tecnología, gadgets, cripto, política y geopolítica: las historias que mueven los mercados y tu dinero.</p><p>Seguimos a los principales medios todo el día (${esc(srcList)}) y ordenamos las noticias según cuántos medios las cubren y su impacto económico. Nuestra redacción escribe resúmenes y contexto propios para las más importantes, y cada noticia enlaza a la nota original.</p><p>Contacto: <a href="mailto:${esc(config.contactEmail)}">${esc(config.contactEmail)}</a></p>`
      );
      staticPage(
        "privacy.html",
        "Política de privacidad",
        `<h1>Política de privacidad</h1><p>Última actualización: ${builtAt.slice(0, 10)}</p><p>PixelContent no pide registro ni recopila datos personales directamente. Tu preferencia de idioma se guarda solo en tu navegador.</p><h2>Publicidad y cookies</h2><p>Usamos Google AdSense para mostrar anuncios. Google y sus socios usan cookies para mostrar anuncios según tus visitas a este y otros sitios. Puedes desactivar la publicidad personalizada en la <a href="https://adssettings.google.com" target="_blank" rel="noopener">configuración de anuncios de Google</a> o en <a href="https://www.aboutads.info" target="_blank" rel="noopener">aboutads.info</a>. Consulta <a href="https://policies.google.com/technologies/partner-sites?hl=es" target="_blank" rel="noopener">cómo usa Google los datos de sitios asociados</a>.</p><h2>Enlaces externos</h2><p>Las noticias enlazan a sitios de terceros con sus propias políticas de privacidad.</p><h2>Contacto</h2><p><a href="mailto:${esc(config.contactEmail)}">${esc(config.contactEmail)}</a></p>`
      );
    }
  }

  // ── archivos para buscadores y AdSense ────────────────────
  fs.writeFileSync(path.join(out, "robots.txt"), `User-agent: *\nAllow: /\n${site ? `Sitemap: ${site}/sitemap.xml\n` : ""}`);
  if (site)
    fs.writeFileSync(
      path.join(out, "sitemap.xml"),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap
        .map((u) => `<url><loc>${esc(u)}</loc><lastmod>${builtAt}</lastmod></url>`)
        .join("\n")}\n</urlset>\n`
    );
  if (ads.client) fs.writeFileSync(path.join(out, "ads.txt"), `google.com, ${ads.client.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n`);
  fs.writeFileSync(path.join(out, ".nojekyll"), "");
  if (site) fs.writeFileSync(path.join(out, "CNAME"), site.replace(/^https?:\/\//, "") + "\n");
  // Hostinger (Apache/LiteSpeed): https obligatorio, caché corta en páginas, compresión.
  fs.writeFileSync(
    path.join(out, ".htaccess"),
    `DirectoryIndex index.html
Options -Indexes
ErrorDocument 404 /index.html

<IfModule mod_rewrite.c>
RewriteEngine On
RewriteCond %{HTTPS} !=on
RewriteCond %{HTTP:X-Forwarded-Proto} !https
RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
</IfModule>

<IfModule mod_expires.c>
ExpiresActive On
ExpiresByType text/html "access plus 5 minutes"
ExpiresByType application/xml "access plus 1 hour"
ExpiresByType text/css "access plus 1 day"
ExpiresByType text/javascript "access plus 1 day"
ExpiresByType application/javascript "access plus 1 day"
ExpiresByType image/svg+xml "access plus 7 days"
</IfModule>

<IfModule mod_deflate.c>
AddOutputFilterByType DEFLATE text/html text/css text/javascript application/javascript application/xml image/svg+xml text/plain
</IfModule>
`
  );
  return count;
}
