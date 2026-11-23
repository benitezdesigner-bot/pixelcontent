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
- Report only facts stated in the material. Do not invent numbers, names, dates or quotes. Attribute key claims ("according to ${"${source}"}", "officials said").
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
- Informa solo los hechos que aparecen en el material. No inventes cifras, nombres, fechas ni citas. Atribuye los datos clave ("según ${"${source}"}", "informaron las autoridades").
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

export async function summarizeNew(stories, lang, dataDir) {
  const file = path.join(dataDir, `ai-${lang}.json`);
  let cache = {};
  try {
    cache = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {}

  // quitar resúmenes de noticias que ya salieron del sitio
  const live = new Set(stories.map((s) => s.id));
  for (const id of Object.keys(cache)) if (!live.has(id)) delete cache[id];

  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    fs.writeFileSync(file, JSON.stringify(cache));
    if (lang === "en") console.log("\n▶ IA: sin ANTHROPIC_API_KEY, se omiten los resúmenes propios");
    return cache;
  }

  const client = new Anthropic();
  // Elegir las más importantes, repartidas entre categorías (una de cada una por turno),
  // sin repetir la misma historia contada por varios medios.
  const covered = new Set(stories.filter((s) => cache[s.id]).map((s) => s.cluster));
  const byCat = {};
  for (const s of [...stories].sort((a, b) => b.score - a.score)) {
    if (cache[s.id] || covered.has(s.cluster)) continue;
    covered.add(s.cluster);
    (byCat[s.cat] ||= []).push(s);
  }
  // noticias de última hora marcadas por la tarea de "breaking news" (data/priority.json): van primero
  const prioFile = path.join(dataDir, "priority.json");
  let prio = [];
  try {
    prio = JSON.parse(fs.readFileSync(prioFile, "utf8")).ids || [];
  } catch {}
  const todo = stories.filter((s) => prio.includes(s.id) && !cache[s.id]);
  for (const l of Object.values(byCat)) for (let i = l.length - 1; i >= 0; i--) if (todo.includes(l[i])) l.splice(i, 1);
  if (todo.length) console.log(`  · ${todo.length} de última hora primero`);
  while (todo.length < config.ai.maxPerRun && Object.values(byCat).some((l) => l.length))
    for (const l of Object.values(byCat)) if (l.length && todo.length < config.ai.maxPerRun) todo.push(l.shift());
  console.log(`\n▶ IA (${lang}): escribiendo ${todo.length} notas propias con ${config.ai.model}…`);

  let ok = 0;
  let stop = false;
  let next = 0;
  async function writeOne(s) {
    const original = await fetchArticleText(s.link);
    const request = {
      model: config.ai.model,
      max_tokens: 16000,
      system: SYSTEM[lang].replaceAll("${source}", s.source),
      output_config: { effort: config.ai.effort, format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content: `Source: ${s.source}\nCategory: ${s.cat}\nPublished: ${s.date}\nHeadline: ${s.title}\nTeaser: ${s.excerpt || "(none)"}\n\nOriginal article text (for your analysis only — do not copy it):\n${original || "(not available — work only from the headline and teaser)"}`,
        },
      ],
    };
    try {
      const response = FALLBACK_MODELS.has(config.ai.model)
        ? await client.beta.messages.create({ ...request, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
        : await client.messages.create(request);
      if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
        console.warn(`  · omitida (${response.stop_reason}): ${s.title.slice(0, 70)}`);
        return;
      }
      const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      const data = JSON.parse(text);
      if (!Array.isArray(data.body) || !data.body.length) return;
      cache[s.id] = { ...data, model: response.model, at: new Date().toISOString() };
      ok++;
      console.log(`  ✓ ${data.tone === "serious" ? "[serio] " : ""}${data.headline.slice(0, 90)}`);
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) {
        console.warn("  ✗ La clave de Anthropic no es válida; se omiten las notas.");
        stop = true;
      } else if (error instanceof Anthropic.RateLimitError) {
        console.warn("  ✗ Límite de uso alcanzado; se sigue en la próxima actualización.");
        stop = true;
      } else if (error instanceof Anthropic.APIError) {
        console.warn(`  ✗ Error ${error.status}: ${error.message.slice(0, 300)}`);
        if (error.status === 400 || error.status === 402 || error.status === 403) stop = true; // petición o saldo: no seguir gastando intentos
      } else if (error instanceof SyntaxError) {
        console.warn("  ✗ Respuesta no válida, se omite esta noticia.");
      } else {
        throw error;
      }
    }
  }
  // 4 notas a la vez
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (!stop && next < todo.length) await writeOne(todo[next++]);
    })
  );
  console.log(`  ${ok} notas nuevas (total ${Object.keys(cache).length})`);
  fs.writeFileSync(file, JSON.stringify(cache));
  // quitar de la lista de prioridad las que ya tienen nota (o que ya no están en el sitio)
  if (prio.length) {
    const ids = new Set(stories.map((s) => s.id));
    const left = prio.filter((id) => !cache[id] && ids.has(id));
    try {
      const pf = JSON.parse(fs.readFileSync(prioFile, "utf8"));
      pf[`done_${lang}`] = prio.filter((id) => cache[id]);
      if (lang === "es") pf.ids = left.length ? left : [];
      fs.writeFileSync(prioFile, JSON.stringify(pf, null, 1));
    } catch {}
  }
  return cache;
}
