// ─────────────────────────────────────────────────────────────
//  PIXELCONTENT — configuración del sitio
//  Todo lo que quieras cambiar sin tocar código está aquí.
// ─────────────────────────────────────────────────────────────

export default {
  siteName: "PixelContent",

  // URL pública del sitio, sin "/" al final (ej. "https://pixelcontent.news").
  // Se usa para el sitemap, los enlaces canónicos y al compartir en redes.
  // También se puede pasar con la variable de entorno SITE_URL.
  siteUrl: process.env.SITE_URL || "",

  // Correo de contacto que aparece en "About" y "Privacy" (AdSense lo pide).
  contactEmail: process.env.CONTACT_EMAIL || "contact@example.com",

  // ── Google AdSense ──────────────────────────────────────────
  // Cuando AdSense te apruebe, pon aquí tu "ca-pub-XXXXXXXXXXXXXXXX"
  // y los ID de cada bloque de anuncio. Mientras esté vacío se muestran
  // recuadros grises que marcan dónde irán los anuncios.
  adsense: {
    client: process.env.ADSENSE_CLIENT || "", // "ca-pub-1234567890123456"
    // ID de cada bloque (opcional). Si los dejas vacíos y activas
    // "Anuncios automáticos" en AdSense, Google coloca los anuncios solo.
    slots: {
      leaderboard: process.env.ADSENSE_SLOT_TOP || "", // banner horizontal arriba
      sidebar: process.env.ADSENSE_SLOT_SIDEBAR || "", // cuadro lateral
      infeed: process.env.ADSENSE_SLOT_INFEED || "", // entre secciones
      article: process.env.ADSENSE_SLOT_ARTICLE || "", // dentro de cada noticia
    },
    showPlaceholders: true,
  },

  // ── Resúmenes propios con IA (opcional) ─────────────────────
  // Si existe la variable ANTHROPIC_API_KEY, el sitio escribe un resumen
  // original + "por qué importa" para las noticias más importantes y crea
  // una página propia para cada una. Eso es lo que AdSense valora.
  ai: {
    model: process.env.AI_MODEL || "claude-sonnet-5-5", // elegido por el dueño; opciones: claude-opus-5-5, claude-haiku-5-5
    maxPerRun: Number(process.env.AI_MAX_PER_RUN) || 30, // notas nuevas por idioma en cada actualización
    // Con al menos esta cantidad de notas propias en un idioma, el sitio muestra SOLO notas propias.
    minOwnToShowOnly: Number(process.env.AI_MIN_OWN) || 24,
    effort: "low",
  },

  // Cuántas noticias guardar y por cuánto tiempo.
  keepDays: 4,
  maxStoriesPerLang: 700,
  maxItemsPerFeed: 25,
  // Imágenes sacadas de la página de la noticia cuando el RSS no trae foto.
  maxImageLookupsPerRun: 90,

  categories: [
    { id: "economy", en: "Economy", es: "Economía", color: "#0f9d58" },
    { id: "markets", en: "Markets", es: "Bolsa", color: "#1a73e8" },
    { id: "tech", en: "Tech", es: "Tecnología", color: "#8e44ef" },
    { id: "gadgets", en: "Gadgets & Future", es: "Gadgets y Futuro", color: "#ec4899" },
    { id: "crypto", en: "Crypto", es: "Cripto", color: "#f59e0b" },
    { id: "politics", en: "Politics", es: "Política", color: "#e8453c" },
    { id: "world", en: "Geopolitics", es: "Geopolítica", color: "#0d9488" },
  ],

  // ── Fuentes RSS ─────────────────────────────────────────────
  // Para agregar una fuente: { name, url, cat } en el idioma que toque.
  feeds: {
    en: [
      { name: "The Guardian", url: "https://www.theguardian.com/business/rss", cat: "economy" },
      { name: "BBC News", url: "https://feeds.bbci.co.uk/news/business/rss.xml", cat: "economy" },
      { name: "The New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml", cat: "economy" },
      { name: "MarketWatch", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", cat: "markets" },
      { name: "CNBC", url: "https://www.cnbc.com/id/10000664/device/rss/rss.html", cat: "markets" },
      { name: "Investing.com", url: "https://www.investing.com/rss/news_25.rss", cat: "markets" },
      { name: "Investing.com", url: "https://www.investing.com/rss/news_301.rss", cat: "markets" },
      { name: "The Verge", url: "https://www.theverge.com/rss/index.xml", cat: "tech" },
      { name: "TechCrunch", url: "https://techcrunch.com/feed/", cat: "tech" },
      { name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index", cat: "tech" },
      { name: "Wired", url: "https://www.wired.com/feed/rss", cat: "tech" },
      { name: "The Guardian", url: "https://www.theguardian.com/technology/rss", cat: "tech" },
      { name: "Engadget", url: "https://www.engadget.com/rss.xml", cat: "gadgets" },
      { name: "Gizmodo", url: "https://gizmodo.com/feed", cat: "gadgets" },
      { name: "New Atlas", url: "https://newatlas.com/index.rss", cat: "gadgets" },
      { name: "Interesting Engineering", url: "https://interestingengineering.com/feed", cat: "gadgets" },
      { name: "Yanko Design", url: "https://www.yankodesign.com/feed/", cat: "gadgets" },
      { name: "Futurism", url: "https://futurism.com/feed", cat: "gadgets" },
      { name: "Digital Trends", url: "https://www.digitaltrends.com/feed/", cat: "gadgets" },
      { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/", cat: "crypto" },
      { name: "Cointelegraph", url: "https://cointelegraph.com/rss", cat: "crypto" },
      { name: "Decrypt", url: "https://decrypt.co/feed", cat: "crypto" },
      { name: "Politico", url: "https://rss.politico.com/politics-news.xml", cat: "politics" },
      { name: "The Guardian", url: "https://www.theguardian.com/us-news/us-politics/rss", cat: "politics" },
      { name: "The New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml", cat: "politics" },
      { name: "The Hill", url: "https://thehill.com/homenews/feed/", cat: "politics" },
      { name: "BBC News", url: "https://feeds.bbci.co.uk/news/world/rss.xml", cat: "world" },
      { name: "The Guardian", url: "https://www.theguardian.com/world/rss", cat: "world" },
      { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", cat: "world" },
      { name: "The New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", cat: "world" },
      { name: "Foreign Policy", url: "https://foreignpolicy.com/feed/", cat: "world" },
    ],
    es: [
      { name: "El País", url: "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/economia/portada", cat: "economy" },
      { name: "Expansión", url: "https://e00-expansion.uecdn.es/rss/economia.xml", cat: "economy" },
      { name: "El Mundo", url: "https://www.elmundo.es/rss/economia.xml", cat: "economy" },
      { name: "Infobae", url: "https://www.infobae.com/arc/outboundfeeds/rss/category/economia/", cat: "economy" },
      { name: "France 24", url: "https://www.france24.com/es/economia/rss", cat: "economy" },
      { name: "Expansión", url: "https://e00-expansion.uecdn.es/rss/mercados.xml", cat: "markets" },
      { name: "Investing.com", url: "https://es.investing.com/rss/news_25.rss", cat: "markets" },
      { name: "Cinco Días", url: "https://feeds.elpais.com/mrss-s/pages/ep/site/cincodias.elpais.com/portada", cat: "markets" },
      { name: "El País", url: "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/tecnologia/portada", cat: "tech" },
      { name: "Xataka", url: "https://feeds.weblogssl.com/xataka2", cat: "tech" },
      { name: "Wired en Español", url: "https://es.wired.com/feed/rss", cat: "tech" },
      { name: "Hipertextual", url: "https://hipertextual.com/feed", cat: "tech" },
      { name: "Infobae", url: "https://www.infobae.com/arc/outboundfeeds/rss/category/tecno/", cat: "tech" },
      { name: "Gizmodo en Español", url: "https://es.gizmodo.com/rss", cat: "gadgets" },
      { name: "Xataka Móvil", url: "https://feeds.weblogssl.com/xatakamovil", cat: "gadgets" },
      { name: "Xataka Ciencia", url: "https://feeds.weblogssl.com/xatakaciencia", cat: "gadgets" },
      { name: "Computer Hoy", url: "https://computerhoy.20minutos.es/rss", cat: "gadgets" },
      { name: "Xataka Home", url: "https://www.xatakahome.com/feedburner.xml", cat: "gadgets" },
      { name: "CriptoNoticias", url: "https://www.criptonoticias.com/feed/", cat: "crypto" },
      { name: "BeInCrypto", url: "https://es.beincrypto.com/feed/", cat: "crypto" },
      { name: "DiarioBitcoin", url: "https://www.diariobitcoin.com/feed/", cat: "crypto" },
      { name: "El País", url: "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/mexico/portada", cat: "politics" },
      { name: "El País", url: "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/america/portada", cat: "politics" },
      { name: "Infobae", url: "https://www.infobae.com/arc/outboundfeeds/rss/category/politica/", cat: "politics" },
      { name: "El Mundo", url: "https://www.elmundo.es/rss/espana.xml", cat: "politics" },
      { name: "El Financiero", url: "https://www.elfinanciero.com.mx/arc/outboundfeeds/rss/?outputType=xml", cat: "politics" },
      { name: "El País", url: "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/internacional/portada", cat: "world" },
      { name: "El Mundo", url: "https://www.elmundo.es/rss/internacional.xml", cat: "world" },
      { name: "BBC Mundo", url: "https://feeds.bbci.co.uk/mundo/rss.xml", cat: "world" },
      { name: "DW", url: "https://rss.dw.com/xml/rss-sp-all", cat: "world" },
      { name: "France 24", url: "https://www.france24.com/es/rss", cat: "world" },
      { name: "The New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/es.xml", cat: "world" },
    ],
  },

  // Barra de mercados (se actualiza en cada construcción del sitio).
  markets: {
    yahoo: [
      { symbol: "^GSPC", label: "S&P 500" },
      { symbol: "^IXIC", label: "Nasdaq" },
      { symbol: "^DJI", label: "Dow Jones" },
      { symbol: "^MXX", label: "IPC México" },
      { symbol: "GC=F", label: "Gold / Oro" },
      { symbol: "CL=F", label: "WTI Oil" },
      { symbol: "EURUSD=X", label: "EUR/USD" },
      { symbol: "MXN=X", label: "USD/MXN" },
      { symbol: "^TNX", label: "US 10Y" },
    ],
    coingecko: [
      { id: "bitcoin", label: "BTC" },
      { id: "ethereum", label: "ETH" },
      { id: "solana", label: "SOL" },
    ],
  },

  // Palabras que hacen BAJAR una noticia (ofertas, listas de compras…).
  downrankWords: {
    en: [" deal", "deals", " sale", "% off", "$ off", "discount", "coupon", "promo code", "best ", "gift guide", "buying guide", "on sale"],
    es: ["oferta", "ofertas", "descuento", "rebaja", "chollo", "cupón", "mejores ", "black friday", "guía de compra", "código promocional"],
  },

  // Palabras que hacen subir una noticia en "Trending" (impacto económico).
  impactWords: {
    en: ["fed", "federal reserve", "powell", "inflation", "interest rate", "rate cut", "rate hike", "tariff", "recession", "gdp", "jobs report", "unemployment", "oil", "opec", "bitcoin", "ethereum", "crypto", "nvidia", "apple", "microsoft", "tesla", "openai", "ai ", "war", "sanction", "china", "russia", "ukraine", "israel", "iran", "election", "trump", "congress", "stocks", "s&p", "nasdaq", "dow", "wall street", "crash", "record", "surge", "plunge", "soar", "tumble", "bank", "debt", "default", "bond", "treasury", "dollar"],
    es: ["fed", "reserva federal", "powell", "inflación", "tasas", "tipos de interés", "aranceles", "recesión", "pib", "empleo", "desempleo", "petróleo", "opep", "bitcoin", "ethereum", "cripto", "nvidia", "apple", "microsoft", "tesla", "openai", "inteligencia artificial", " ia ", "guerra", "sanciones", "china", "rusia", "ucrania", "israel", "irán", "elecciones", "trump", "sheinbaum", "banxico", "bce", "bolsa", "wall street", "ibex", "desplome", "récord", "se dispara", "se hunde", "banco", "deuda", "bonos", "dólar", "peso", "euro"],
  },
};
