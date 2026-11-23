// Resúmenes originales con Claude (opcional).
// Solo se activa si existe ANTHROPIC_API_KEY. Cada noticia se resume una sola
// vez: el resultado se guarda en data/ai-<idioma>.json y no se vuelve a pagar.

import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import config from "../config.js";

const SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string", description: "Accurate, engaging headline (max 110 characters). No clickbait that the facts don't support." },
    body: {
      type: "array",
      items: { type: "string" },
      description: "The article: 4 to 6 paragraphs (300-500 words total), written from scratch in your own words. First paragraph answers what happened, who, where and when.",
    },
    summary: { type: "string", description: "One or two sentence summary (max 40 words) for cards and search results." },
    tone: {
      type: "string",
      enum: ["humor", "serious"],
      description: "serious for deaths, injuries, war, terrorism, disasters, crime victims, abuse, illness, or any human tragedy; humor for everything else.",
    },
    pixel_take: {
      type: "string",
      description: "'Pixel's take': one or two witty, original lines about the story (max 35 words). Clever, not mean; punch up at the powerful, never at victims or groups. Empty string when tone is serious.",
    },
    why_it_matters: { type: "string", description: "2-3 sentences on why this matters for the economy, markets, technology or the reader's money." },
    key_points: { type: "array", items: { type: "string" }, description: "Exactly 3 short bullet points." },
    tags: { type: "array", items: { type: "string" }, description: "3 to 5 short topic tags." },
  },
  required: ["headline", "body", "summary", "tone", "pixel_take", "why_it_matters", "key_points", "tags"],
  additionalProperties: false,
};

const SYSTEM = {
  en: `You are a reporter at PixelContent, a news site about the economy, markets, technology, gadgets, crypto, politics and geopolitics, plus a Freak News section of weird and surprising true stories.
You receive a story from another outlet (headline, teaser and, when available, the text of the original article). Write PixelContent's OWN news article about it, in English.
Rules:
- Write from scratch in your own words and structure. Never copy or closely paraphrase sentences from the source, and use at most one short direct quote (under 15 words) if it is essential.
- Report only facts stated in the material. Do not invent numbers, names, dates or quotes. Attribute key claims to the source outlet named in the message ("according to [that outlet]", "officials said").
- The headline, summary, pixel_take, why_it_matters and key_points must not introduce any detail (brand, object, number, person, place) that is not in the material. Jokes play with the facts; they never add new ones.
- Add value: explain context and what it means for the economy, markets, technology or people's money, using only well-established general knowledge.
- If the material is too thin for a full article, write fewer, shorter paragraphs rather than padding.
Voice: PixelContent's signature style is smart and funny — like a sharp friend who reads the business pages so you don't have to. Use wit, playful comparisons and light irony in the headline and the body, while every fact stays exactly right. Humor is about how you tell it, never about changing what happened.
If the story involves deaths, injuries, war, terrorism, disasters, crime victims, abuse, illness or other human tragedy, set tone to "serious": write it straight and respectful, with no jokes anywhere, and leave pixel_take empty.
Never mock people for their identity, never punch down, no vulgarity.`,
  es: `Eres reportero de PixelContent, un sitio de noticias de economía, bolsa, tecnología, gadgets, cripto, política y geopolítica, con una sección de Noticias Freak: historias reales raras y sorprendentes.
Recibes una noticia de otro medio (titular, entradilla y, cuando se pudo obtener, el texto de la nota original). Escribe la nota PROPIA de PixelContent sobre ese tema, en español.
Reglas:
- Redacta desde cero, con tus propias palabras y tu propia estructura. Nunca copies ni parafrasees de cerca frases de la fuente; como mucho una cita textual corta (menos de 15 palabras) si es indispensable.
- Informa solo los hechos que aparecen en el material. No inventes cifras, nombres, fechas ni citas. Atribuye los datos clave al medio de origen que se indica en el mensaje ("según [ese medio]", "informaron las autoridades").
- El titular, el resumen, pixel_take, why_it_matters y key_points no pueden agregar ningún detalle (marca, objeto, cifra, persona, lugar) que no esté en el material. El humor juega con los hechos; nunca inventa hechos nuevos.
- Aporta valor: explica el contexto y qué significa para la economía, los mercados, la tecnología o el bolsillo de la gente, usando solo conocimiento general bien establecido.
- Si el material no alcanza para una nota completa, escribe menos párrafos y más cortos en lugar de rellenar.
Voz: el estilo de PixelContent es listo y con humor, como un amigo ingenioso que lee las noticias de economía para que tú no tengas que hacerlo. Usa ingenio, comparaciones divertidas e ironía ligera en el titular y en el texto, pero cada dato debe quedar exactamente igual. El humor está en cómo lo cuentas, nunca en cambiar lo que pasó.
Si la noticia trata de muertes, heridos, guerra, terrorismo, desastres, víctimas de delitos, abusos, enfermedades u otra tragedia humana, pon tone en "serious": escríbela directa y respetuosa, sin ningún chiste, y deja pixel_take vacío.
Nunca te burles de nadie por su identidad, no ataques a los débiles, nada vulgar. Español neutro que se entienda en toda Latinoamérica y España.`,
};

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const decode = (t) =>
  t
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#?[a-z0-9]+;/gi, " ");

// Lee el texto de la nota original (solo para que la IA la analice; no se publica).
export async function fetchArticleText(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(12000) });
    if (!res.ok) return "";
    let html = (await res.text()).slice(0, 800000);
    html = html.replace(/<(script|style|noscript|svg|nav|footer|header|aside|form)[\s\S]*?<\/\1>/gi, " ");
    const scope = html.match(/<article[\s\S]*?<\/article>/i)?.[0] || html.match(/<main[\s\S]*?<\/main>/i)?.[0] || html;
    const paras = [...scope.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((m) => decode(m[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim())
      .filter((t) => t.length > 60 && !/cookie|subscribe|suscr[ií]bete|newsletter|all rights reserved|todos los derechos/i.test(t));
    return paras.join("\n").slice(0, 9000);
  } catch {
    return "";
  }
}

const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-fable-5-2", "claude-fable-5-1", "claude-opus-5", "claude-sonnet-5-5"]);
const LANGS = ["en", "es"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Petición para una noticia. El system va igual en todas las notas de un idioma
// (sin el nombre del medio), así se guarda en caché y se cobra a precio de caché.
function buildRequest(s, lang, original) {
  return {
    model: config.ai.model,
    max_tokens: 16000,
    system: [{ type: "text", text: SYSTEM[lang], cache_control: { type: "ephemeral" } }],
    output_config: { effort: config.ai.effort, format: { type: "json_schema", schema: SCHEMA } },
    messages: [
      {
        role: "user",
        content: `Source: ${s.source}\nCategory: ${s.cat}\nPublished: ${s.date}\nHeadline: ${s.title}\nTeaser: ${s.excerpt || "(none)"}\n\nOriginal article text (for your analysis only — do not copy it):\n${original || "(not available — work only from the headline and teaser)"}`,
      },
    ],
  };
}

// Convierte una respuesta en la nota guardada (o null si no sirve).
function parseNote(message) {
  if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") return { skip: message.stop_reason };
  try {
    const data = JSON.parse(message.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
    if (!Array.isArray(data.body) || !data.body.length) return null;
    return { note: { ...data, model: message.model, at: new Date().toISOString() } };
  } catch {
    return null;
  }
}

// Lee textos originales con varias descargas a la vez.
async function fetchAll(list, n = 8) {
  const out = new Array(list.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < list.length) {
        const k = i++;
        out[k] = await fetchArticleText(list[k].link);
      }
    })
  );
  return out;
}

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function apiProblem(error, where) {
  if (error instanceof Anthropic.AuthenticationError) return console.warn(`  ✗ ${where}: la clave de Anthropic no es válida.`), true;
  if (error instanceof Anthropic.RateLimitError) return console.warn(`  ✗ ${where}: límite de uso alcanzado; se sigue en la próxima actualización.`), true;
  if (error instanceof Anthropic.APIError) {
    console.warn(`  ✗ ${where}: error ${error.status}: ${error.message.slice(0, 300)}`);
    return error.status === 400 || error.status === 402 || error.status === 403; // petición o saldo: no seguir intentando
  }
  throw error;
}

/**
 * Escribe las notas propias de los dos idiomas.
 * - Las de última hora (data/priority.json) se escriben al momento, una por una.
 * - Las demás van en un lote (Batch API, 50 % más barato). Se espera hasta
 *   config.ai.batchWaitMin minutos; si el lote no termina, sus notas se recogen en la
 *   siguiente actualización (data/ai-batch.json guarda los lotes pendientes).
 * - Con AI_ONLY_PRIORITY=1 (compilaciones por cambios de código) solo se escriben las de última hora.
 * opts.client permite probar con un cliente simulado.
 */
export async function summarizeAll(editions, dataDir, opts = {}) {
  const caches = {};
  const live = {};
  for (const lang of LANGS) {
    caches[lang] = readJSON(path.join(dataDir, `ai-${lang}.json`), {});
    live[lang] = new Map(editions[lang].map((s) => [s.id, s]));
    // quitar notas de noticias que ya salieron del sitio
    for (const id of Object.keys(caches[lang])) if (!live[lang].has(id)) delete caches[lang][id];
  }
  const save = () => {
    for (const lang of LANGS) fs.writeFileSync(path.join(dataDir, `ai-${lang}.json`), JSON.stringify(caches[lang]));
  };

  if (!opts.client && !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    save();
    console.log("\n▶ IA: sin ANTHROPIC_API_KEY, se omiten los resúmenes propios");
    return caches;
  }
  const client = opts.client || new Anthropic();
  const onlyPriority = opts.onlyPriority ?? process.env.AI_ONLY_PRIORITY === "1";
  const waitMin = opts.waitMin ?? config.ai.batchWaitMin;
  const pollMs = opts.pollMs ?? 30000;
  const batchFile = path.join(dataDir, "ai-batch.json");
  const pending = readJSON(batchFile, { batches: [] });
  const saveBatches = () => fs.writeFileSync(batchFile, JSON.stringify(pending, null, 1));
  let stop = false;
  const added = { en: 0, es: 0 };

  // Guarda los resultados de un lote terminado.
  async function collect(b) {
    let ok = 0;
    for await (const r of await client.messages.batches.results(b.id)) {
      const ref = b.map[r.custom_id];
      if (!ref || r.result.type !== "succeeded") continue;
      const [lang, id] = ref;
      if (!live[lang].has(id) || caches[lang][id]) continue;
      const res = parseNote(r.result.message);
      if (res?.note) {
        caches[lang][id] = res.note;
        added[lang]++;
        ok++;
        console.log(`  ✓ [${lang}] ${res.note.tone === "serious" ? "[serio] " : ""}${res.note.headline.slice(0, 90)}`);
      } else if (res?.skip) console.warn(`  · omitida (${res.skip}): ${live[lang].get(id).title.slice(0, 70)}`);
    }
    console.log(`  lote ${b.id.slice(-8)}: ${ok} notas de ${Object.keys(b.map).length}`);
  }

  // 1. Recoger lotes de actualizaciones anteriores.
  const inFlight = new Set();
  for (const b of [...pending.batches]) {
    try {
      const st = await client.messages.batches.retrieve(b.id);
      if (st.processing_status === "ended") {
        await collect(b);
        pending.batches = pending.batches.filter((x) => x !== b);
      } else if (Date.now() - Date.parse(b.at) > 26 * 3600e3) {
        pending.batches = pending.batches.filter((x) => x !== b); // ya venció
      } else {
        for (const ref of Object.values(b.map)) inFlight.add(ref.join(":"));
      }
    } catch (error) {
      if (apiProblem(error, "lote pendiente")) stop = true;
    }
  }

  // 2. Elegir qué escribir en cada idioma.
  const prioFile = path.join(dataDir, "priority.json");
  const prio = readJSON(prioFile, {}).ids || [];
  const urgent = [];
  const regular = [];
  for (const lang of LANGS) {
    const stories = editions[lang];
    const cache = caches[lang];
    const waiting = (s) => inFlight.has(`${lang}:${s.id}`);
    // las más importantes, repartidas entre categorías, sin repetir la misma historia contada por varios medios
    const covered = new Set(stories.filter((s) => cache[s.id] || waiting(s)).map((s) => s.cluster));
    const byCat = {};
    for (const s of [...stories].sort((a, b) => b.score - a.score)) {
      if (cache[s.id] || waiting(s) || covered.has(s.cluster) || prio.includes(s.id)) continue;
      covered.add(s.cluster);
      (byCat[s.cat] ||= []).push(s);
    }
    const now = stories.filter((s) => prio.includes(s.id) && !cache[s.id]);
    for (const s of now) urgent.push([lang, s]);
    if (onlyPriority) continue;
    const todo = [];
    while (now.length + todo.length < config.ai.maxPerRun && Object.values(byCat).some((l) => l.length))
      for (const l of Object.values(byCat)) if (l.length && now.length + todo.length < config.ai.maxPerRun) todo.push(l.shift());
    for (const s of todo) regular.push([lang, s]);
  }
  console.log(
    `\n▶ IA (${config.ai.model}): ${urgent.length} de última hora ahora, ${regular.length} en lote` +
      (inFlight.size ? `, ${inFlight.size} esperando un lote anterior` : "") +
      (onlyPriority ? " (compilación por cambio de código: solo última hora)" : "")
  );

  // 3. Última hora: al momento.
  if (urgent.length && !stop) {
    const texts = await fetchAll(urgent.map(([, s]) => s), 4);
    for (let k = 0; k < urgent.length && !stop; k++) {
      const [lang, s] = urgent[k];
      const request = buildRequest(s, lang, texts[k]);
      try {
        const message = FALLBACK_MODELS.has(config.ai.model)
          ? await client.beta.messages.create({ ...request, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
          : await client.messages.create(request);
        const res = parseNote(message);
        if (res?.note) {
          caches[lang][s.id] = res.note;
          added[lang]++;
          console.log(`  ✓ [${lang}] última hora: ${res.note.headline.slice(0, 90)}`);
        } else console.warn(`  · omitida (${res?.skip || "respuesta no válida"}): ${s.title.slice(0, 70)}`);
      } catch (error) {
        if (apiProblem(error, "última hora")) stop = true;
      }
    }
  }

  // 4. Las demás: un lote.
  if (regular.length && !stop) {
    const texts = await fetchAll(regular.map(([, s]) => s));
    const map = {};
    const requests = regular.map(([lang, s], k) => {
      const custom_id = `${lang}-${k}`;
      map[custom_id] = [lang, s.id];
      return { custom_id, params: buildRequest(s, lang, texts[k]) };
    });
    try {
      const batch = await client.messages.batches.create({ requests });
      const b = { id: batch.id, at: new Date().toISOString(), map };
      pending.batches.push(b);
      saveBatches(); // por si la compilación se corta: la próxima actualización recoge el lote
      console.log(`  lote ${batch.id.slice(-8)} enviado (${requests.length} notas); esperando hasta ${waitMin} min…`);
      const until = Date.now() + waitMin * 60e3;
      while (Date.now() < until) {
        await sleep(pollMs);
        const st = await client.messages.batches.retrieve(batch.id);
        if (st.processing_status === "ended") {
          await collect(b);
          pending.batches = pending.batches.filter((x) => x !== b);
          break;
        }
      }
      if (pending.batches.includes(b)) console.log("  el lote sigue en proceso; sus notas salen en la próxima actualización");
    } catch (error) {
      apiProblem(error, "lote");
    }
  }

  console.log(`  notas nuevas: ${added.en} en inglés, ${added.es} en español`);
  save();
  saveBatches();

  // quitar de la lista de prioridad las que ya tienen nota (o que ya no están en el sitio)
  if (prio.length) {
    try {
      const pf = readJSON(prioFile, {});
      for (const lang of LANGS) pf[`done_${lang}`] = prio.filter((id) => caches[lang][id]);
      const left = prio.filter((id) => LANGS.some((lang) => live[lang].has(id) && !caches[lang][id]));
      pf.ids = left;
      fs.writeFileSync(prioFile, JSON.stringify(pf, null, 1));
    } catch {}
  }
  return caches;
}
