// Predicciones y análisis de mercados.
// 1) Lee fuentes de análisis/opinión y una búsqueda de Google News por mercado.
// 2) Para cada mercado, Claude resume lo que dicen analistas con nombre (solo lo que
//    está en el material, con enlace) y escribe la postura propia de PixelContent para
//    los próximos días: dirección, rango objetivo, escenarios con probabilidad,
//    fundamentales, catalizadores y riesgos.
// 3) Cada predicción se guarda en un historial y, al vencer el plazo, se califica
//    contra el precio real (marcador público: aciertos y fallos).
// Se regenera como máximo cada config.analysis.refreshHours; la calificación corre siempre.

import fs from "node:fs";
import path from "node:path";
import Parser from "rss-parser";
import Anthropic from "@anthropic-ai/sdk";
import config from "../config.js";
import { fetchArticleText } from "./ai.js";

const A = config.analysis;
// Subir este número cuando cambien las reglas: fuerza a regenerar en la siguiente corrida.
const PROMPT_VERSION = 2;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const parser = new Parser({ timeout: 15000, headers: { "User-Agent": UA } });
const strip = (s = "") => String(s).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

const readJSON = (f, d) => {
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return d;
  }
};

// ── material ────────────────────────────────────────────────
async function readFeed(name, url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    const feed = await parser.parseString(await res.text());
    return feed.items.slice(0, 40).map((it) => {
      let title = strip(it.title);
      let source = name;
      if (name === "Google News") {
        // "Titular - Medio"
        const m = title.match(/^(.*) - ([^-]{2,60})$/);
        if (m) [title, source] = [m[1].trim(), m[2].trim()];
      }
      return {
        title,
        source,
        link: it.link,
        date: it.isoDate || it.pubDate || "",
        teaser: strip(it.contentSnippet || it.content || it.summary || "").slice(0, 400),
        google: name === "Google News",
      };
    });
  } catch {
    return [];
  }
}

export async function gatherMaterial() {
  const cutoff = Date.now() - 4 * 86400e3;
  const general = (await Promise.all(A.feeds.map((f) => readFeed(f.name, f.url)))).flat();
  const perMarket = {};
  for (const m of A.markets) {
    const q = encodeURIComponent(`${m.google} when:3d`);
    const g = await readFeed("Google News", `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`);
    // palabras completas ("gold" no debe coincidir con "Goldman")
    const words = m.words.map((w) => new RegExp(`(^|[^a-z])${w.trim().replace(/[.*+?^${}()|[\]\\&]/g, "\\$&")}([^a-z]|$)`, "i"));
    // el mercado tiene que salir en el TITULAR, y fuera notas de una sola acción
    const relevant = (it) => words.some((re) => re.test(it.title)) && !SINGLE_STOCK.test(it.title);
    const seen = new Set();
    perMarket[m.id] = [...g, ...general]
      .filter(relevant)
      .filter((it) => it.title && (!it.date || Date.parse(it.date) > cutoff))
      .filter((it) => {
        const k = it.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
        return !seen.has(k) && seen.add(k);
      })
      // primero las que nombran a un analista, estratega o banco
      .sort((a, b) => named(b) - named(a) || Date.parse(b.date || 0) - Date.parse(a.date || 0))
      .slice(0, A.maxItemsPerMarket);
  }
  return perMarket;
}
// notas sobre una empresa concreta (ticker, precio objetivo de una acción, ganancias de una firma)
const SINGLE_STOCK = /\((nasdaq|nyse|nasdaqgs|nasdaqgm|amex|hkg|tsx|lse|otc)[: ]|stock forecast|price target|earnings release|\bshares? of\b|\b(stock|shares) (drops|jumps|soars|falls|rises|slides)\b|stocks to buy|dividend stocks/i;
const named = (it) =>
  /(strategist|analyst|economist|chief|cio|goldman|morgan stanley|jpmorgan|j\.p\. morgan|citi|bank of america|bofa|ubs|wells fargo|yardeni|wood|lee|dimon|dalio|kostin|wilson|bernstein|standard chartered|bernstein|fundstrat|blackrock|vaneck|ark invest)/i.test(
    `${it.title} ${it.teaser}`
  )
    ? 1
    : 0;

// ── precios (contexto de 1 mes) ─────────────────────────────
export async function priceContext(m, markets) {
  const now = markets.find((x) => x.key === m.key);
  const ctx = { price: now?.price ?? null, change1d: now?.change ?? null };
  try {
    let closes = [];
    if (m.key.match(/^[\^A-Z=]|=/) && !["bitcoin", "ethereum", "solana"].includes(m.key)) {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(m.key)}?range=1mo&interval=1d`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(12000),
      });
      const j = await r.json();
      closes = (j.chart.result[0].indicators.quote[0].close || []).filter((x) => x != null);
    } else {
      const r = await fetch(`https://api.coingecko.com/api/v3/coins/${m.key}/market_chart?vs_currency=usd&days=30&interval=daily`, { signal: AbortSignal.timeout(12000) });
      const j = await r.json();
      closes = (j.prices || []).map((p) => p[1]);
    }
    if (closes.length > 5) {
      const last = ctx.price ?? closes.at(-1);
      ctx.price = last;
      ctx.change5d = ((last - closes.at(-6)) / closes.at(-6)) * 100;
      ctx.change1m = ((last - closes[0]) / closes[0]) * 100;
      ctx.high1m = Math.max(...closes);
      ctx.low1m = Math.min(...closes);
    }
  } catch {}
  return ctx;
}

// ── esquema de la respuesta ─────────────────────────────────
const str = { type: "string" };
const strArr = { type: "array", items: str };
const SCHEMA = {
  type: "object",
  properties: {
    headline_en: str,
    headline_es: str,
    summary_en: str,
    summary_es: str,
    analysts: {
      type: "array",
      description: "Views of NAMED analysts, strategists, banks or research firms that appear explicitly in the material. 0 to 6 items. Never invent a name, firm, number or quote.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Person's name as written in the material, or empty string if only a firm is named." },
          firm: { type: "string", description: "Firm or outlet role as written (e.g. 'Yardeni Research', 'Goldman Sachs'), or empty string." },
          stance: { type: "string", enum: ["bullish", "neutral", "bearish"] },
          call_en: { type: "string", description: "Their call in one sentence with the exact numbers/levels/targets from the material." },
          call_es: str,
          source: { type: "string", description: "Outlet of the item this comes from." },
          url: { type: "string", description: "The link of that item, copied exactly from the material." },
        },
        required: ["name", "firm", "stance", "call_en", "call_es", "source", "url"],
        additionalProperties: false,
      },
    },
    consensus_en: str,
    consensus_es: str,
    stance: { type: "string", enum: ["bullish", "neutral", "bearish"], description: "PixelContent's own call for the horizon." },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    target_low: { type: "number", description: "Low end of the price range expected at the end of the horizon." },
    target_high: { type: "number", description: "High end of that range." },
    scenarios: {
      type: "array",
      description: "Exactly 3: bull, base, bear. Probabilities are integers that add up to 100.",
      items: {
        type: "object",
        properties: {
          case: { type: "string", enum: ["bull", "base", "bear"] },
          probability: { type: "integer" },
          level: { type: "number", description: "Price level for that scenario at the end of the horizon." },
          text_en: str,
          text_es: str,
        },
        required: ["case", "probability", "level", "text_en", "text_es"],
        additionalProperties: false,
      },
    },
    analysis_en: { ...strArr, description: "Our reasoning: 3 or 4 short paragraphs." },
    analysis_es: strArr,
    fundamentals_en: { ...strArr, description: "3 to 5 fundamental drivers (rates, earnings, flows, valuation, supply/demand, macro)." },
    fundamentals_es: strArr,
    catalysts_en: { ...strArr, description: "2 to 4 events or data to watch in the horizon (only ones mentioned in the material, or clearly recurring like weekly data)." },
    catalysts_es: strArr,
    risks_en: { ...strArr, description: "2 or 3 things that would prove our call wrong." },
    risks_es: strArr,
    pixel_take_en: { type: "string", description: "One witty line (max 30 words)." },
    pixel_take_es: str,
  },
  required: [
    "headline_en", "headline_es", "summary_en", "summary_es", "analysts", "consensus_en", "consensus_es", "stance", "confidence",
    "target_low", "target_high", "scenarios", "analysis_en", "analysis_es", "fundamentals_en", "fundamentals_es",
    "catalysts_en", "catalysts_es", "risks_en", "risks_es", "pixel_take_en", "pixel_take_es",
  ],
  additionalProperties: false,
};

const SYSTEM = `You are PixelContent's chief market analyst. Every day you publish a short, sharp outlook for one market: what the best-known analysts are saying, and PixelContent's OWN call for the next ${A.horizonDays} days. Write each text field in English (_en) and in neutral Latin-American Spanish (_es) with the same meaning.
Rules:
- Analysts: list only named people (with their firm when given) or named banks, asset managers, research or trading firms that are explicitly in the material, with the numbers, levels and targets exactly as written there and the item's link copied exactly. Do NOT list news outlets or websites themselves (e.g. FXEmpire, Kitco, Investing.com, IndexBox), 'Wall Street' in general, polls, or unnamed strategists. Never invent or guess a name, firm, target, quote or link. Prefer the most famous names (big banks, well-known strategists and investors). If the material names nobody, return an empty list and say so in the consensus.
- Our call: reason like a top strategist. Combine the price action given (current price, 5-day and 1-month change, 1-month range), what the analysts say, and fundamentals (rates and the Fed, earnings, valuations, flows/ETFs, liquidity, supply and demand, dollar, macro data). Commit to a clear direction: choose neutral ONLY if your base case is within ±1.5% of the current price; otherwise call it bullish or bearish. It is fine to disagree with the consensus if you explain why. Our reputation is built on being decisive and right, and every call is graded publicly. Use general, well-established knowledge for fundamentals, but do not invent specific new facts, dates or numbers that are not in the material.
- The target range and scenario levels must be realistic for a ${A.horizonDays}-day horizon around the current price. Scenario probabilities are integers adding up to 100, and the base case must match the stance.
- Be honest about uncertainty: no guarantees, no "certain" language. The site shows that this is analysis and opinion, not financial advice.
- Voice: confident, clear and smart, like the best market newsletter; plain words, short sentences. Light wit only in pixel_take.`;

const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-fable-5-2", "claude-fable-5-1", "claude-opus-5", "claude-sonnet-5-5"]);

async function analyzeMarket(client, m, items, ctx) {
  // leer el texto completo de algunas notas (no las de Google News, que redirigen)
  let reads = 0;
  for (const it of items) {
    if (reads >= A.maxArticleFetches || it.google || !it.link) continue;
    it.text = (await fetchArticleText(it.link)).slice(0, 3500);
    reads++;
  }
  const f = (x, d = 2) => (x == null ? "n/a" : Number(x).toLocaleString("en-US", { maximumFractionDigits: d }));
  const material = items
    .map((it, i) => `[${i + 1}] ${it.source} · ${it.date ? it.date.slice(0, 10) : "recent"}\nTitle: ${it.title}\nLink: ${it.link}\nTeaser: ${it.teaser || "(none)"}${it.text ? `\nText: ${it.text}` : ""}`)
    .join("\n\n");
  const request = {
    model: config.ai.model,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: A.effort, format: { type: "json_schema", schema: SCHEMA } },
    messages: [
      {
        role: "user",
        content: `Market: ${m.en}\nDate: ${new Date().toISOString().slice(0, 10)}\nHorizon: next ${A.horizonDays} days\nCurrent price: ${f(ctx.price)}\nChange 1 day: ${f(ctx.change1d)}%  ·  5 days: ${f(ctx.change5d)}%  ·  1 month: ${f(ctx.change1m)}%\n1-month range: ${f(ctx.low1m)} – ${f(ctx.high1m)}\n\nMaterial (${items.length} items from analysis and market outlets):\n\n${material || "(no material found today)"}`,
      },
    ],
  };
  const response = FALLBACK_MODELS.has(config.ai.model)
    ? await client.beta.messages.create({ ...request, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
    : await client.messages.create(request);
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") throw new Error(`stop: ${response.stop_reason}`);
  const data = JSON.parse(response.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
  // solo analistas cuyo enlace aparece de verdad en el material
  const links = new Set(items.map((it) => it.link));
  const OUTLET = /(fxempire|kitco|investing\.com|indexbox|tradingview|benzinga|marketbeat|coingabbar|beincrypto|unnamed|\bper\b|^wall street$|contributor)/i;
  data.analysts = (data.analysts || []).filter((a) => links.has(a.url) && (a.name || (a.firm && !OUTLET.test(a.firm))));
  return { ...data, model: response.model };
}

// ── calificar predicciones vencidas ─────────────────────────
function grade(history, markets) {
  const now = Date.now();
  for (const h of history) {
    if (h.graded || Date.parse(h.due) > now) continue;
    const m = A.markets.find((x) => x.id === h.market);
    const price = markets.find((x) => x.key === m?.key)?.price;
    if (!price || !h.price) continue;
    const ret = ((price - h.price) / h.price) * 100;
    h.graded = new Date().toISOString().slice(0, 10);
    h.final = price;
    h.ret = Math.round(ret * 100) / 100;
    h.directionHit = h.stance === "bullish" ? ret > 0.5 : h.stance === "bearish" ? ret < -0.5 : Math.abs(ret) <= 2;
    h.rangeHit = price >= h.low && price <= h.high;
  }
}
function scorecard(history) {
  const g = history.filter((h) => h.graded);
  const pct = (n, d) => (d ? Math.round((n / d) * 100) : null);
  const byMarket = {};
  for (const h of g) {
    const b = (byMarket[h.market] ||= { n: 0, dir: 0, range: 0 });
    b.n++;
    b.dir += h.directionHit ? 1 : 0;
    b.range += h.rangeHit ? 1 : 0;
  }
  const pending = history.filter((h) => !h.graded).sort((a, b) => Date.parse(a.due) - Date.parse(b.due));
  return {
    graded: g.length,
    directionRate: pct(g.filter((h) => h.directionHit).length, g.length),
    rangeRate: pct(g.filter((h) => h.rangeHit).length, g.length),
    byMarket,
    recent: g.slice(-12).reverse(),
    nextDue: pending[0]?.due || null,
  };
}

// ── principal ───────────────────────────────────────────────
export async function buildAnalysis(markets, dataDir) {
  const curFile = path.join(dataDir, "predictions.json");
  const histFile = path.join(dataDir, "predictions-history.json");
  let current = readJSON(curFile, null);
  const history = readJSON(histFile, []);

  grade(history, markets);

  const age = current ? (Date.now() - Date.parse(current.generatedAt)) / 3600e3 : Infinity;
  const hasKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
  if (hasKey && (age >= A.refreshHours || process.env.FORCE_ANALYSIS || current?.version !== PROMPT_VERSION)) {
    console.log(`\n▶ predicciones: analizando ${A.markets.length} mercados…`);
    const material = await gatherMaterial();
    const client = new Anthropic();
    const out = [];
    for (const m of A.markets) {
      const items = material[m.id] || [];
      const ctx = await priceContext(m, markets);
      if (!ctx.price) {
        console.warn(`  · ${m.en}: sin precio, se omite`);
        continue;
      }
      try {
        const a = await analyzeMarket(client, m, items, ctx);
        out.push({ id: m.id, key: m.key, label_en: m.en, label_es: m.es, ...ctx, sources: items.length, ...a });
        console.log(`  ✓ ${m.en}: ${a.stance} (${a.confidence}) ${a.target_low}–${a.target_high} · ${a.analysts.length} analistas citados`);
      } catch (e) {
        console.warn(`  ✗ ${m.en}: ${String(e.message || e).slice(0, 200)}`);
        if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.RateLimitError) break;
      }
    }
    if (out.length) {
      const generatedAt = new Date().toISOString();
      const due = new Date(Date.now() + A.horizonDays * 86400e3).toISOString();
      current = { version: PROMPT_VERSION, generatedAt, horizonDays: A.horizonDays, due, markets: out };
      const today = generatedAt.slice(0, 10);
      for (let i = history.length - 1; i >= 0; i--) if (history[i].date === today && !history[i].graded) history.splice(i, 1); // una predicción por mercado por día
      for (const p of out)
        history.push({ market: p.id, date: generatedAt.slice(0, 10), due, price: p.price, stance: p.stance, confidence: p.confidence, low: p.target_low, high: p.target_high });
      fs.writeFileSync(curFile, JSON.stringify(current));
    }
  } else if (!hasKey && !current) {
    console.log("\n▶ predicciones: sin ANTHROPIC_API_KEY, se omiten");
  }
  fs.writeFileSync(histFile, JSON.stringify(history));
  return current ? { ...current, score: scorecard(history) } : null;
}
