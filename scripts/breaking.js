// Detector de noticias de última hora (lo usa la tarea programada de "breaking news").
// Lee todos los RSS, junta los titulares que cuentan la misma historia en las últimas horas
// y muestra las historias que más medios están cubriendo, de la más cubierta a la menos.
// Uso: node scripts/breaking.js [horas=3] [lang=en]
// No escribe nada: solo imprime JSON en la salida.

import crypto from "node:crypto";
import Parser from "rss-parser";
import config from "../config.js";

const HOURS = Number(process.argv[2]) || 3;
const LANG = process.argv[3] || "en";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const parser = new Parser({ timeout: 15000, headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml, */*" } });
// mismo id que usa build.js para la página de la noticia (story/<id>.html)
const hash = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);
const STOP = new Set(
  "the a an and or of to in on for with from by at as is are was were be been it its this that these those after over into about new says say said will would could can amid more than up down out not but his her their they he she we you our your how why what who when where which just also de la el los las un una y o del al en con por para que se su sus es son fue ser lo como más tras sobre entre este esta dice según ya muy hay ha han sin".split(" ")
);
const tokens = (s) =>
  new Set(
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9$%\s]/g, " ").split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w))
  );

async function read(feed) {
  try {
    const res = await fetch(feed.url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    const f = await parser.parseString(await res.text());
    return (f.items || []).slice(0, 30).flatMap((it) => {
      const link = (it.link || it.guid || "").trim();
      const date = Date.parse(it.isoDate || it.pubDate || "");
      if (!link.startsWith("http") || !date) return [];
      return [{ id: hash(link.replace(/[?#].*$/, "")), source: feed.name, cat: feed.cat, title: (it.title || "").replace(/<[^>]+>/g, "").trim(), link, date }];
    });
  } catch {
    return [];
  }
}

const feeds = config.feeds[LANG];
const all = (await Promise.all(feeds.map(read))).flat();
const since = Date.now() - HOURS * 3600e3;
const items = all.filter((s) => s.date > since && s.date < Date.now() + 3600e3);
const toks = items.map((s) => tokens(s.title));
const df = new Map();
for (const t of toks) for (const w of t) df.set(w, (df.get(w) || 0) + 1);
const maxDf = Math.max(5, items.length * 0.05);
const dist = toks.map((t) => new Set([...t].filter((w) => df.get(w) <= maxDf)));
const clusters = [];
const used = new Set();
// la noticia más reciente arranca cada grupo; se suman las que comparten 2+ palabras distintivas
const order = items.map((_, i) => i).sort((a, b) => items[b].date - items[a].date);
for (const i of order) {
  if (used.has(i)) continue;
  const group = [i];
  used.add(i);
  for (const j of order) {
    if (used.has(j) || items[j].source === items[i].source) continue;
    let shared = 0;
    for (const w of dist[i]) if (dist[j].has(w)) shared++;
    if (shared >= 2) { group.push(j); used.add(j); }
  }
  const g = group.map((k) => items[k]);
  const sources = [...new Set(g.map((s) => s.source))];
  clusters.push({
    outlets: sources.length,
    sources,
    newest: new Date(Math.max(...g.map((s) => s.date))).toISOString(),
    cat: g[0].cat,
    headline: g[0].title,
    stories: g.map((s) => ({ id: s.id, source: s.source, title: s.title, link: s.link, date: new Date(s.date).toISOString() })),
  });
}
clusters.sort((a, b) => b.outlets - a.outlets || Date.parse(b.newest) - Date.parse(a.newest));
console.log(JSON.stringify({ checked: new Date().toISOString(), hours: HOURS, lang: LANG, items: items.length, top: clusters.slice(0, 12) }, null, 1));
