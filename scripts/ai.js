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
    summary: { type: "string", description: "Original 90-140 word summary written in your own words." },
    why_it_matters: { type: "string", description: "2-3 sentences on why this matters for the economy, markets, technology or the reader's money." },
    key_points: { type: "array", items: { type: "string" }, description: "Exactly 3 short bullet points." },
    tags: { type: "array", items: { type: "string" }, description: "3 to 5 short topic tags." },
  },
  required: ["headline", "summary", "why_it_matters", "key_points", "tags"],
  additionalProperties: false,
};

const SYSTEM = {
  en: `You are the editor of PixelContent, a news site about the economy, markets, technology, gadgets, crypto, politics and geopolitics.
You receive a news item from an RSS feed (headline, source and teaser). Write an ORIGINAL brief in English, in your own words — never copy sentences from the source.
Use only the facts in the material provided. If something is not stated there, do not add it, guess numbers, or invent quotes. If the teaser is thin, keep the summary shorter and focus on context that is general knowledge.
Tone: clear, lively and easy to share, but factual.`,
  es: `Eres el editor de PixelContent, un sitio de noticias de economía, bolsa, tecnología, gadgets, cripto, política y geopolítica.
Recibes una noticia de un RSS (titular, fuente y entradilla). Escribe un resumen ORIGINAL en español, con tus propias palabras: nunca copies frases de la fuente.
Usa solo los datos del material recibido. Si algo no aparece ahí, no lo agregues, no inventes cifras ni citas. Si la entradilla es corta, haz un resumen más breve y aporta contexto que sea de conocimiento general.
Tono: claro, ágil y fácil de compartir, pero apegado a los hechos.`,
};

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
  const todo = [...stories]
    .filter((s) => !cache[s.id])
    .sort((a, b) => b.score - a.score)
    .slice(0, config.ai.maxPerRun);
  console.log(`\n▶ IA (${lang}): resumiendo ${todo.length} noticias con ${config.ai.model}…`);

  let ok = 0;
  for (const s of todo) {
    const request = {
      model: config.ai.model,
      max_tokens: 16000,
      system: SYSTEM[lang],
      output_config: { effort: config.ai.effort, format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content: `Source: ${s.source}\nCategory: ${s.cat}\nPublished: ${s.date}\nHeadline: ${s.title}\nTeaser: ${s.excerpt || "(none)"}`,
        },
      ],
    };
    try {
      const response = FALLBACK_MODELS.has(config.ai.model)
        ? await client.beta.messages.create({ ...request, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
        : await client.messages.create(request);
      if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") continue;
      const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      const data = JSON.parse(text);
      cache[s.id] = { ...data, model: response.model, at: new Date().toISOString() };
      ok++;
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) {
        console.warn("  ✗ La clave de Anthropic no es válida; se omiten los resúmenes.");
        break;
      } else if (error instanceof Anthropic.RateLimitError) {
        console.warn("  ✗ Límite de uso alcanzado; se sigue en la próxima actualización.");
        break;
      } else if (error instanceof Anthropic.APIError) {
        console.warn(`  ✗ Error ${error.status}: ${error.message.slice(0, 160)}`);
      } else if (error instanceof SyntaxError) {
        console.warn("  ✗ Respuesta no válida, se omite esta noticia.");
      } else {
        throw error;
      }
    }
  }
  console.log(`  ${ok} resúmenes nuevos (total ${Object.keys(cache).length})`);
  fs.writeFileSync(file, JSON.stringify(cache));
  return cache;
}
