// PixelContent — construye el sitio completo a partir de los RSS.
// Uso: node scripts/build.js   (o npm run build)

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import Parser from "rss-parser";
import config from "../config.js";
import { summarizeNew } from "./ai.js";
import { renderSite } from "./render.js";
import { buildAnalysis } from "./analysis.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const parser = new Parser({
  timeout: 20000,
  headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml, */*" },
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
      ["media:group", "mediaGroup"],
      ["content:encoded", "contentEncoded"],
      ["description", "descriptionRaw"],
    ],
  },
});

// ── utilidades ────────────────────────────────────────────────
const readJSON = (f, d) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));
  } catch {
    return d;
  }
};
const writeJSON = (f, v) => fs.writeFileSync(path.join(DATA, f), JSON.stringify(v, null, 1));
const hash = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
function decode(s = "") {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
}
function stripHtml(s = "") {
  return decode(String(s).replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}
function cleanExcerpt(s) {
  let t = stripHtml(s)
    .replace(/The post .{0,200}? appeared first on .*$/i, "")
    .replace(/La nota .{0,300}? se publicó primero en .*$/i, "")
    .replace(/La entrada .{0,300}? se publicó primero en .*$/i, "")
    .replace(/(Read|Leer|Continue reading|Seguir leyendo)( more| más)?\.{0,3}\s*$/i, "")
    .replace(/\[(…|\.\.\.)\]\s*$/, "…")
    .trim();
  if (t.length > 260) t = t.slice(0, 250).replace(/\s+\S*$/, "") + "…";
  return t;
}

function attr(node, name) {
  if (!node) return undefined;
  if (node.$ && node.$[name]) return node.$[name];
  return node[name];
}

// Elige la mejor imagen que trae el RSS.
function imageFromItem(it) {
  const cands = [];
  const push = (url, w = 0, type = "") => {
    if (!url || typeof url !== "string") return;
    if (type && !/image/i.test(type) && !/\.(jpe?g|png|webp|gif|avif)/i.test(url)) return;
    if (/\.(mp4|mp3|m3u8)(\?|$)/i.test(url)) return;
    cands.push({ url: decode(url), w: Number(w) || 0 });
  };
  for (const m of it.mediaContent || []) push(attr(m, "url"), attr(m, "width"), attr(m, "medium") === "image" ? "image" : attr(m, "type") || "");
  const g = it.mediaGroup;
  if (g && g["media:content"]) for (const m of [].concat(g["media:content"])) push(attr(m, "url"), attr(m, "width"), attr(m, "type") || "");
  for (const m of it.mediaThumbnail || []) push(attr(m, "url"), attr(m, "width") || 1);
  if (it.enclosure?.url) push(it.enclosure.url, 0, it.enclosure.type || "image");
  if (it.itunes?.image) push(it.itunes.image, 1);
  if (!cands.length) {
    const html = [it.contentEncoded, it.content, it.descriptionRaw].filter(Boolean).join(" ");
    const m = html.match(/<img[^>]+src=["']([^"']+)["']/i) || decode(html).match(/<img[^>]+src=["']([^"']+)["']/i);
    if (m && !/pixel|feedburner|tracking|1x1|gravatar|emoji/i.test(m[1])) push(m[1], 1);
  }
  if (!cands.length) return "";
  cands.sort((a, b) => b.w - a.w);
  return upgradeImage(cands[0].url);
}

// Pide versiones más grandes a los CDN conocidos.
function upgradeImage(url) {
  if (!url) return url;
  if (url.startsWith("//")) url = "https:" + url;
  url = url.replace(/(ichef\.bbci\.co\.uk\/(?:ace\/)?(?:standard|ws)\/)\d+\//, "$1800/");
  url = url.replace(/(static01\.nyt\.com\/images\/.*?)-moth(\.\w+)/, "$1-superJumbo$2");
  return url;
}

// Si el RSS no trae foto, la buscamos en la página (og:image).
async function lookupOgImage(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 9000);
  const work = (async () => {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow", signal: ctrl.signal });
    if (!res.ok) return null;
    const reader = res.body.getReader();
    let html = "";
    while (html.length < 250000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += new TextDecoder().decode(value);
      if (/<\/head>/i.test(html)) break;
    }
    reader.cancel().catch(() => {});
    const metas = html.match(/<meta[^>]+>/gi) || [];
    for (const key of ["og:image", "og:image:url", "twitter:image", "twitter:image:src"]) {
      for (const m of metas) {
        if (new RegExp(`(property|name)=["']${key}["']`, "i").test(m)) {
          const c = m.match(/content=["']([^"']+)["']/i);
          if (c && /^https?:|^\/\//.test(c[1])) return upgradeImage(decode(c[1]));
        }
      }
    }
    return null;
  })();
  const limit = new Promise((r) => setTimeout(() => r(null), 10000));
  try {
    return await Promise.race([work.catch(() => null), limit]);
  } finally {
    clearTimeout(t);
    ctrl.abort();
  }
}

async function pool(items, n, fn) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    })
  );
  return out;
}

// ── 1. leer los RSS ───────────────────────────────────────────
async function fetchFeed(feed, lang) {
  try {
    const res = await fetch(feed.url, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const f = await parser.parseString(await res.text());
    const now = Date.now();
    return (f.items || []).slice(0, config.maxItemsPerFeed).flatMap((it) => {
      const link = (it.link || it.guid || "").trim();
      const title = stripHtml(it.title || "");
      if (!link.startsWith("http") || title.length < 12) return [];
      let date = Date.parse(it.isoDate || it.pubDate || "");
      const noDate = !date;
      if (!date || date > now + 3600e3) date = now;
      return [
        {
          id: hash(link.replace(/[?#].*$/, "")),
          lang,
          cat: feed.cat,
          source: feed.name,
          title,
          excerpt: cleanExcerpt(it.contentSnippet || it.descriptionRaw || it.summary || it.content || ""),
          link,
          image: imageFromItem(it),
          date: new Date(date).toISOString(),
          noDate,
        },
      ];
    });
  } catch (e) {
    console.warn(`  ✗ ${feed.name} (${feed.cat}): ${e.message.split("\n")[0]}`);
    return [];
  }
}

// ── 2. tendencias: cuántas fuentes cuentan la misma historia ─────
const STOP = new Set(
  "the a an and or of to in on for with from by at as is are was were be been it its this that these those after over into about new says say said will would could can amid more than up down out not but his her their they he she we you our your how why what who when where which just also yes no de la el los las un una unos unas y o del al en con por para que se su sus es son fue ser lo como más menos tras sobre entre este esta estos estas ese esa dice según ya muy hay ha han sin hasta desde cuando donde quien qué cómo por qué".split(
    " "
  )
);
const tokens = (s) =>
  new Set(
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9$%\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOP.has(w))
  );

function scoreStories(stories, lang) {
  const words = config.impactWords[lang] || [];
  const toks = stories.map((s) => tokens(s.title));
  // palabras que aparecen en muchos titulares no sirven para decir "es la misma historia"
  const df = new Map();
  for (const t of toks) for (const w of t) df.set(w, (df.get(w) || 0) + 1);
  const maxDf = Math.max(6, stories.length * 0.02);
  const distinct = toks.map((t) => new Set([...t].filter((w) => df.get(w) <= maxDf)));
  const now = Date.now();
  const down = config.downrankWords?.[lang] || [];
  const links = stories.map(() => []);
  stories.forEach((s, i) => {
    const related = new Set();
    for (let j = 0; j < stories.length; j++) {
      if (i === j || stories[j].source === s.source) continue;
      if (Math.abs(Date.parse(stories[j].date) - Date.parse(s.date)) > 48 * 3600e3) continue;
      let shared = 0;
      for (const w of distinct[i]) if (distinct[j].has(w)) shared++;
      if (shared >= 2) {
        related.add(stories[j].source);
        links[i].push(j);
      }
    }
    const text = ` ${s.title.toLowerCase()} `;
    const impact = words.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);
    const shopping = down.some((w) => text.includes(w));
    const ageH = (now - Date.parse(s.date)) / 3600e3;
    s.coverage = related.size + 1;
    s.score = +(
      Math.min(related.size, 6) * 3 +
      Math.min(impact, 4) * 1.5 +
      (s.image ? 1 : 0) +
      Math.max(0, 8 - ageH / 3) -
      (s.noDate ? 3 : 0) -
      (shopping ? 12 : 0)
    ).toFixed(2);
  });
  // agrupar: cada historia queda en el grupo de la nota mejor puntuada que la cuenta
  const order = stories.map((_, i) => i).sort((a, b) => stories[b].score - stories[a].score);
  for (const i of order) {
    if (stories[i].cluster) continue;
    stories[i].cluster = stories[i].id;
    for (const j of links[i]) if (!stories[j].cluster) stories[j].cluster = stories[i].id;
  }
}

// ── 3. mercados ───────────────────────────────────────────────
async function fetchMarkets() {
  const prev = readJSON("markets.json", []);
  const out = [];
  // Yahoo rechaza agentes de navegador completos; con uno corto responde bien.
  for (const m of config.markets.yahoo) {
    for (const host of ["query1", "query2"]) {
      try {
        const r = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(m.symbol)}?range=5d&interval=1d`, {
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(12000),
        });
        if (!r.ok) continue;
        const meta = (await r.json()).chart.result[0].meta;
        const price = meta.regularMarketPrice;
        const prevClose = meta.chartPreviousClose ?? meta.previousClose;
        const change = meta.regularMarketChangePercent ?? (prevClose ? ((price - prevClose) / prevClose) * 100 : 0);
        out.push({ key: m.symbol, label: m.label, price, change });
        break;
      } catch {}
    }
  }
  try {
    const ids = config.markets.coingecko.map((c) => c.id).join(",");
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`, { signal: AbortSignal.timeout(12000) });
    const j = await r.json();
    for (const c of config.markets.coingecko) if (j[c.id]) out.push({ key: c.id, label: c.label, price: j[c.id].usd, change: j[c.id].usd_24h_change });
  } catch {}
  const order = [...config.markets.yahoo.map((m) => m.symbol), ...config.markets.coingecko.map((c) => c.id)];
  const merged = order.map((k) => out.find((o) => o.key === k) || prev.find((o) => o.key === k)).filter(Boolean);
  writeJSON("markets.json", merged);
  return merged;
}

// ── principal ─────────────────────────────────────────────────
async function main() {
  fs.mkdirSync(DATA, { recursive: true });
  const t0 = Date.now();
  const ogCache = readJSON("og-cache.json", {});
  const editions = {};

  for (const lang of ["en", "es"]) {
    console.log(`\n▶ ${lang.toUpperCase()}: leyendo ${config.feeds[lang].length} fuentes…`);
    const results = await pool(config.feeds[lang], 8, async (f) => {
      const r = await fetchFeed(f, lang);
      if (process.env.VERBOSE) console.log(`  · ${f.name} (${f.cat}): ${r.length}`);
      return r;
    });
    const fresh = results.flat();
    console.log(`  ${fresh.length} noticias recibidas`);

    // mezclar con lo guardado en la corrida anterior
    const history = readJSON(`stories-${lang}.json`, []);
    const byId = new Map(history.map((s) => [s.id, s]));
    for (const s of fresh) {
      const old = byId.get(s.id);
      byId.set(
        s.id,
        old
          ? { ...old, ...s, image: s.image || old.image, date: s.noDate ? old.date : s.date, firstSeen: old.firstSeen }
          : { ...s, firstSeen: new Date().toISOString() }
      );
    }
    const keepMs = (cat) => (config.categories.find((c) => c.id === cat)?.keepDays || config.keepDays) * 86400e3;
    const seenTitles = new Set();
    const recent = [...byId.values()]
      .filter((s) => Date.parse(s.date) > Date.now() - keepMs(s.cat))
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
      .filter((s) => {
        const k = s.title.toLowerCase().replace(/[^a-z0-9áéíóúñü]/g, "").slice(0, 70);
        if (seenTitles.has(k)) return false;
        seenTitles.add(k);
        return true;
      });
    // cupo mínimo por sección: las secciones con pocas fuentes (p. ej. Freak News) no quedan fuera
    const keep = new Set();
    const perCat = {};
    for (const s of recent) if ((perCat[s.cat] = (perCat[s.cat] || 0) + 1) <= (config.minStoriesPerCat || 0)) keep.add(s);
    for (const s of recent) if (keep.size < config.maxStoriesPerLang) keep.add(s);
    let stories = recent.filter((s) => keep.has(s));

    // imágenes faltantes
    const missing = stories.filter((s) => !s.image && !(s.link in ogCache)).slice(0, config.maxImageLookupsPerRun);
    if (missing.length) {
      console.log(`  buscando ${missing.length} imágenes en las páginas…`);
      await pool(missing, 10, async (s) => {
        ogCache[s.link] = await lookupOgImage(s.link);
      });
    }
    for (const s of stories) if (!s.image && ogCache[s.link]) s.image = ogCache[s.link];
    const withImg = stories.filter((s) => s.image).length;
    console.log(`  ${stories.length} noticias guardadas, ${withImg} con imagen`);

    for (const s of stories) delete s.cluster;
    scoreStories(stories, lang);
    writeJSON(`stories-${lang}.json`, stories);
    editions[lang] = stories;
  }

  // limpiar caché de imágenes de enlaces que ya no existen
  const live = new Set([...editions.en, ...editions.es].map((s) => s.link));
  for (const k of Object.keys(ogCache)) if (!live.has(k)) delete ogCache[k];
  writeJSON("og-cache.json", ogCache);

  // resúmenes propios con IA (solo si hay clave)
  const summaries = {};
  for (const lang of ["en", "es"]) summaries[lang] = await summarizeNew(editions[lang], lang, DATA);

  const markets = await fetchMarkets();
  console.log(`\n▶ mercados: ${markets.length} indicadores`);

  // predicciones y análisis (máximo una vez al día; la calificación corre siempre)
  let analysis = null;
  try {
    analysis = await buildAnalysis(markets, DATA);
  } catch (e) {
    console.warn(`  ✗ predicciones: ${String(e.message || e).slice(0, 200)}`);
  }

  const pages = renderSite({ editions, summaries, markets, analysis, root: ROOT });
  console.log(`▶ ${pages} páginas generadas en public/ (${((Date.now() - t0) / 1000).toFixed(1)} s)\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
