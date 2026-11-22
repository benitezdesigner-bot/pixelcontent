# PixelContent

Portal de noticias bilingüe (inglés por defecto, con botón para pasar a español) sobre **economía, bolsa, tecnología, gadgets y futuro, cripto, política y geopolítica**. Se arma solo a partir de ~60 fuentes RSS, con imágenes, y se actualiza cada 2 horas.

Qué incluye:

- Portada estilo periódico: noticia principal, 4 destacadas, secciones por categoría, "Lo último" y "Trending".
- **Trending inteligente**: sube las historias que están cubriendo varios medios a la vez (🔥 = cuántos medios) y las que mueven la economía (Fed, aranceles, inflación, Bitcoin, Nvidia, guerra…). Baja las notas de ofertas y compras.
- Barra de mercados (S&P 500, Nasdaq, Dow, IPC México, oro, petróleo, EUR/USD, USD/MXN, bono a 10 años, BTC, ETH, SOL) y cinta de última hora.
- Dos ediciones: `/` en inglés con medios en inglés y `/es/` en español con medios en español. Si el navegador del visitante está en español, la primera vez entra directo a la edición en español.
- Espacios listos para Google AdSense (banner arriba, lateral, entre secciones y dentro de cada noticia).
- Páginas "About" y "Privacy" (AdSense las pide), `robots.txt`, `sitemap.xml`, `ads.txt`, etiquetas para compartir en redes y modo oscuro automático.
- Opcional: **resúmenes propios con IA** y una página por noticia, con botones para compartir en WhatsApp, X, Facebook, Telegram y LinkedIn.

## Verlo en tu computadora

```bash
cd ~/Desktop/pixelcontent
```

```bash
npm install
```

```bash
npm start
```

Abre http://localhost:4321. `npm start` descarga las noticias, construye el sitio en `public/` y lo muestra. Para solo actualizar las noticias: `npm run build`.

## Publicarlo en Hostinger (se actualiza solo)

El hosting de Hostinger solo guarda y sirve las páginas. El trabajo de leer los RSS y armar el sitio lo hace GitHub gratis cada 2 horas, y al terminar sube el resultado a Hostinger por FTP.

**En Hostinger:**

1. Compra el dominio y un plan de hosting web (cualquier plan sirve: el sitio son páginas HTML, no necesita base de datos ni WordPress).
2. En hPanel, agrega el dominio a tu hosting y activa el **SSL gratuito** (Seguridad → SSL).
3. En **Archivos → Cuentas FTP**, anota el **servidor FTP** (algo como `ftp.tudominio.com` o una IP), el **usuario** y la **contraseña** (puedes crear una cuenta FTP nueva solo para esto).

**En GitHub:**

4. Crea una cuenta en github.com y un repositorio nuevo llamado `pixelcontent` (puede ser privado).
5. Sube esta carpeta al repositorio (sin `node_modules` ni `public`, ya están excluidas en `.gitignore`).
6. En **Settings → Secrets and variables → Actions → Secrets**, agrega (aquí se guardan cifrados):
   - `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`: los datos del paso 3.
7. En la pestaña **Variables** de esa misma pantalla, agrega:
   - `SITE_URL`: `https://tudominio.com` (sin `/` al final).
   - `CONTACT_EMAIL`: un correo de contacto para las páginas About y Privacy (Hostinger te da correos con tu dominio).
   - `FTP_DIR` solo si tu cuenta FTP no abre directo en la carpeta del dominio. El valor normal es `./public_html/`; si al conectarte ves una carpeta `domains`, usa `./domains/tudominio.com/public_html/`.
8. Ve a **Actions → Actualizar noticias → Run workflow** para la primera publicación (la primera subida tarda unos minutos; las siguientes solo suben lo que cambió).

Desde ahí el sitio se actualiza **cada 2 horas** sin que hagas nada. Para cambiar la frecuencia, edita la línea `cron` en `.github/workflows/update.yml`. El sitio incluye un `.htaccess` que obliga a usar `https`, comprime las páginas y evita que los visitantes vean noticias viejas guardadas en caché.

**Alternativa sin hosting:** pon la variable `DEPLOY_TARGET` en `github` y activa **Settings → Pages → Source: GitHub Actions**; el sitio queda gratis en GitHub Pages y puedes apuntar ahí el dominio de Hostinger desde su zona DNS.

## Google AdSense

AdSense revisa el sitio antes de aprobarlo, y **un sitio que solo republica RSS suele ser rechazado** por "contenido de poco valor" o "contenido copiado". Antes de solicitar:

- Ten el sitio publicado en tu dominio, con `https`, y las páginas About y Privacy (ya vienen incluidas).
- Activa los resúmenes propios con IA (siguiente sección), para que haya páginas con texto original.
- Déjalo funcionando 2 a 4 semanas para que Google lo indexe. Ayuda darlo de alta en Google Search Console y enviar `https://tudominio.com/sitemap.xml`.

### Paso 1: solicitar y verificar el sitio

1. Entra a **adsense.google.com** con tu cuenta de Google y regístrate con la dirección de tu sitio.
2. Copia tu **ID de editor**: empieza con `ca-pub-` seguido de 16 números (está en **Cuenta → Información de la cuenta**).
3. En GitHub: **Settings → Secrets and variables → Actions → Variables → New variable**, nombre `ADSENSE_CLIENT`, valor `ca-pub-…`.
4. Ve a **Actions → Actualizar noticias → Run workflow**. Con eso, cada página lleva el código de AdSense en el `<head>` y se publica `https://tudominio.com/ads.txt`.
5. En AdSense, en la verificación del sitio, elige **"Fragmento de código de AdSense"** (ya está puesto) y pulsa **Verificar → Solicitar revisión**. La revisión suele tardar de unos días a 2 semanas.

Mientras AdSense revisa, los recuadros grises desaparecen y no se ven anuncios; es normal.

### Paso 2: mostrar anuncios (cuando te aprueben)

**Opción fácil — anuncios automáticos:** en AdSense ve a **Anuncios → Por sitio → (tu sitio) → editar** y activa **Anuncios automáticos**. Google decide dónde ponerlos. No tienes que hacer nada más.

**Opción con control — usar los espacios del diseño:** en AdSense ve a **Anuncios → Por bloque de anuncios → Anuncios de display**, crea un bloque **adaptable** por cada espacio y copia su número `data-ad-slot`. Ponlo como variable en GitHub:

| Variable | Dónde aparece |
|---|---|
| `ADSENSE_SLOT_TOP` | Banner horizontal arriba, en portada y categorías |
| `ADSENSE_SLOT_SIDEBAR` | Columna lateral, se queda fijo al bajar |
| `ADSENSE_SLOT_INFEED` | Entre las secciones de noticias |
| `ADSENSE_SLOT_ARTICLE` | Dentro de cada página de noticia |

Después corre otra vez **Run workflow**. Puedes combinar las dos opciones.

### Paso 3: aviso de cookies para Europa

Si te visitan desde Europa o Reino Unido, Google exige un aviso de consentimiento. En AdSense: **Privacidad y mensajes → Mensajes del RGPD → Crear** y publícalo. Es gratis y aparece solo en el sitio.

AdSense paga por cada mil anuncios vistos y por clics; la cantidad depende del país del visitante y del tema (finanzas y tecnología pagan de lo mejor). El tráfico llega sobre todo de compartir en redes y de Google.

## Resúmenes propios con IA (opcional)

Con una clave de la API de Claude, el sitio escribe para las noticias más importantes un titular, un resumen original, "por qué importa", 3 puntos clave y etiquetas, y crea una página propia para cada una. Cada noticia se resume una sola vez.

1. Crea una clave en console.anthropic.com.
2. En GitHub: **Settings → Secrets and variables → Actions → Secrets → New secret**, nombre `ANTHROPIC_API_KEY`.

Costo aproximado con la configuración inicial (15 noticias por idioma cada 2 horas, unas 360 al día):

| Modelo | Variable `AI_MODEL` | Costo aprox. |
|---|---|---|
| Claude Opus 5.5 (predeterminado, mejor redacción) | `claude-opus-5-5` | ~4 a 5 USD al día |
| Claude Haiku 5.5 (unas 40 veces más barato) | `claude-haiku-5-5` | ~0.10 USD al día |

Puedes bajar o subir la cantidad con la variable `AI_MAX_PER_RUN`.

## Cambiar fuentes o categorías

Todo está en `config.js`: categorías y colores, fuentes RSS por idioma, indicadores de mercado, palabras que suben o bajan una noticia, y cuántos días guardar. Para agregar una fuente: `{ name: "Medio", url: "https://…/feed", cat: "tech" }`.

## Archivos

| Archivo | Qué hace |
|---|---|
| `config.js` | Toda la configuración |
| `scripts/build.js` | Lee los RSS, busca imágenes, quita duplicados, calcula tendencias y mercados |
| `scripts/ai.js` | Resúmenes con Claude (solo si hay clave) |
| `scripts/render.js` | Genera las páginas HTML |
| `src/` | Estilos, JavaScript del navegador y el ícono |
| `data/` | Historial de noticias y cachés (se guarda entre actualizaciones) |
| `public/` | El sitio terminado (se genera, no se edita a mano) |

## Nota sobre derechos

El sitio muestra titular, entradilla e imagen tal como los publica cada medio en su RSS y siempre enlaza a la nota original, como hacen los agregadores de noticias. Si un medio pide que lo quites, borra su línea en `config.js`.
