"""
PixelContent — generador de YouTube Shorts (1080×1920, 30 fps).

Uso:
  shorts/.venv/bin/python shorts/make_short.py shorts/gta6-chores

Lee <carpeta>/script.json, genera la voz con la voz del sistema (macOS `say`),
anima cada escena con las imágenes 3D de Microsoft Fluent Emoji (licencia MIT)
y escribe <carpeta>/out/short.mp4. Sin música con derechos: los efectos de
sonido se sintetizan aquí mismo.
"""
import json, math, os, subprocess, sys, wave, random
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import imageio_ffmpeg

W, H, FPS = 1080, 1920, 30
SR = 24000
ORANGE = (255, 75, 43); NAVY = (11, 16, 32); NAVY2 = (22, 30, 56); WHITE = (255, 255, 255); MUTED = (170, 178, 200)
FONT = "/System/Library/Fonts/Avenir Next.ttc"
F = lambda size, idx=8: ImageFont.truetype(FONT, size, index=idx)  # 8 Heavy, 2 Demi, 0 Bold
ASSETS = Path.home() / "assets-img" / "fluent" / "assets"

folder = Path(sys.argv[1]).resolve()
spec = json.loads((folder / "script.json").read_text())
build = folder / "build"; out = folder / "out"
build.mkdir(exist_ok=True); out.mkdir(exist_ok=True)

# ── 1. voz ────────────────────────────────────────────────────
def tts(text, path):
    subprocess.run(["say", "-v", spec.get("voice", "Samantha"), "-r", str(spec.get("rate", 190)),
                    "-o", str(path), f"--data-format=LEI16@{SR}", text], check=True)
    with wave.open(str(path)) as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768

def trim(a, thr=0.008):
    idx = np.where(np.abs(a) > thr)[0]
    return a[max(0, idx[0] - 200): idx[-1] + 600] if len(idx) else a

scenes = spec["scenes"]
voice, t = [], 0.35  # pequeño silencio al inicio
for i, sc in enumerate(scenes):
    a = trim(tts(sc["say"], build / f"s{i:02d}.wav"))
    pause = 0.45 if sc.get("punch") else (0.06 if sc.get("list", 0) > 1 else 0.14)
    if i == 0: pause = 0
    t += pause
    sc["t0"], sc["t1"] = t, t + len(a) / SR
    voice.append((t, a))
    t = sc["t1"]
total = t + 1.4
N = int(SR * total)
audio = np.zeros(N, np.float32)
for start, a in voice:
    s = int(start * SR); audio[s:s + len(a)] += a * 0.95

# ── 2. efectos de sonido sintetizados ─────────────────────────
rng = np.random.default_rng(7)
def add(sig, at, gain):
    s = int(at * SR); e = min(N, s + len(sig)); audio[s:e] += sig[: e - s] * gain
def whoosh(d=0.32):
    n = int(SR * d); x = rng.standard_normal(n).astype(np.float32)
    k = np.linspace(0, 1, n); env = np.sin(np.pi * k) ** 2
    # filtro paso bajo móvil para que suene a "fuuush"
    out_ = np.zeros(n, np.float32); acc = 0
    for j in range(n):
        alpha = 0.04 + 0.30 * k[j]; acc += alpha * (x[j] - acc); out_[j] = acc
    return out_ * env * 3
def pop(d=0.12):
    n = int(SR * d); k = np.arange(n) / SR
    return (np.sin(2 * np.pi * (520 + 900 * np.exp(-k * 40)) * k) * np.exp(-k * 30)).astype(np.float32)
def ding():
    n = int(SR * 0.9); k = np.arange(n) / SR
    return ((np.sin(2 * np.pi * 1318 * k) + 0.5 * np.sin(2 * np.pi * 1976 * k)) * np.exp(-k * 5)).astype(np.float32)
def siren(d):
    n = int(SR * d); k = np.arange(n) / SR
    f = np.where((k * 2.6) % 1 < 0.5, 960, 720)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return (np.sign(np.sin(ph)) * 0.35 * np.minimum(1, k * 8) * np.minimum(1, (d - k) * 8)).astype(np.float32)

W_ = whoosh(); P_ = pop()
for sc in scenes:
    if sc.get("list", 0) <= 1: add(W_, sc["t0"] - 0.12, 0.10)
    add(P_, sc["t0"] + 0.05, 0.12)
    if sc.get("siren"): add(siren(sc["t1"] - sc["t0"]), sc["t0"], 0.05)
    if sc.get("punch"): add(ding(), sc["t0"], 0.16)
audio = np.clip(audio / max(1.0, np.abs(audio).max() / 0.95), -1, 1)
with wave.open(str(build / "mix.wav"), "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((audio * 32767).astype(np.int16).tobytes())

# ── 3. recursos gráficos ──────────────────────────────────────
def icon(name, size):
    if name == "logo":
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
        d.rounded_rectangle([0, 0, size, size], radius=size // 4, fill=ORANGE)
        draw_p(d, size / 2, size / 2, size * 0.62, WHITE, NAVY)
        return img
    folder_ = ASSETS / name
    pngs = sorted(folder_.glob("3D/*.png")) or sorted(folder_.glob("Default/3D/*.png"))
    img = Image.open(pngs[0]).convert("RGBA")
    return img.resize((size, size), Image.LANCZOS)

def draw_p(d, cx, cy, size, color, pixel):
    u = size / 40; ox, oy = cx - 33 * u, cy - 32 * u; w = 8 * u
    P = lambda x, y: (ox + x * u, oy + y * u)
    def seg(a, b):
        d.line([P(*a), P(*b)], fill=color, width=round(w))
        for q in (a, b):
            x, y = P(*q); d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=color)
    seg((22, 48), (22, 16)); seg((22, 16), (34, 16)); seg((34, 36), (22, 36))
    cx2, cy2 = P(34, 26); R = 10 * u
    d.arc([cx2 - R - w / 2, cy2 - R - w / 2, cx2 + R + w / 2, cy2 + R + w / 2], -90, 90, fill=color, width=round(w))
    x, y = P(31, 44); s = 7 * u; d.rounded_rectangle([x, y, x + s, y + s], radius=1.4 * u, fill=pixel)

ICONS = {sc["icon"]: icon(sc["icon"], 440) for sc in scenes}
LIST_ICONS = {sc["list"]: icon(sc["icon"], 120) for sc in scenes if sc.get("list")}
LIST_TEXT = {1: "Home repair", 2: "Grocery shopping", 3: "Open a bank account"}

# fondo base con "pixeles"
bg = Image.new("RGB", (W, H), NAVY); bd = ImageDraw.Draw(bg)
for y in range(H):
    c = tuple(int(NAVY[i] + (NAVY2[i] - NAVY[i]) * y / H) for i in range(3)); bd.line([(0, y), (W, y)], fill=c)
random.seed(3)
PIX = [(random.randrange(0, W), random.randrange(0, H), random.choice([10, 14, 18]), random.random()) for _ in range(70)]
glow = Image.new("L", (W, H), 0); ImageDraw.Draw(glow).ellipse([W * .05, H * .22, W * .95, H * .62], fill=95)
glow = glow.filter(ImageFilter.GaussianBlur(120))
bg.paste(ORANGE, (0, 0), glow)

f_brand = F(52); f_chip = F(30, 0); f_src = F(30, 2); f_cap = F(88); f_list = F(54, 0)
def text_c(d, y, txt, font, fill, stroke=0, sfill=(0, 0, 0)):
    w = d.textlength(txt, font=font); d.text(((W - w) / 2, y), txt, font=font, fill=fill, stroke_width=stroke, stroke_fill=sfill); return w

def ease_back(x):
    x = min(max(x, 0), 1); c1 = 1.70158; c3 = c1 + 1
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2

def fit_font(txt, maxw, start=150, idx=8):
    s = start
    while s > 50:
        f = F(s, idx)
        if ImageDraw.Draw(bg).textlength(txt, font=f) <= maxw: return f
        s -= 6
    return F(50, idx)

# palabras con tiempo aproximado (proporcional a su largo)
for sc in scenes:
    words = sc["show"].split()
    weights = [len(w_) + 2 for w_ in words]; tot = sum(weights); acc = sc["t0"]
    sc["words"] = []
    for w_, wt in zip(words, weights):
        d_ = (sc["t1"] - sc["t0"]) * wt / tot; sc["words"].append((w_, acc, acc + d_)); acc += d_
    # grupos de hasta 3 palabras para los subtítulos
    sc["chunks"] = [sc["words"][i:i + 3] for i in range(0, len(words), 3)]

def scene_at(t):
    cur = scenes[0]
    for sc in scenes:
        if t >= sc["t0"] - 0.12: cur = sc
    return cur

# ── 4. dibujar cada fotograma ─────────────────────────────────
def frame(t):
    sc = scene_at(t); k = t - sc["t0"]
    img = bg.copy(); d = ImageDraw.Draw(img)
    # pixeles flotando
    for (x, y, s, ph) in PIX:
        yy = (y - t * 40 * (0.5 + ph)) % H
        d.rectangle([x, yy, x + s, yy + s], fill=(32, 42, 74))
    # sirena: destellos rojo/azul
    if sc.get("siren"):
        on = int(t * 5) % 2
        flash = Image.new("RGB", (W, H), (230, 30, 40) if on else (30, 90, 255))
        mask = Image.new("L", (W, H), 0); ImageDraw.Draw(mask).rectangle([0, 0, W, H], fill=55)
        img.paste(flash, (0, 0), mask); d = ImageDraw.Draw(img)
    # remate: destello naranja
    if sc.get("punch") and k < 0.25:
        flash = Image.new("RGB", (W, H), ORANGE); m = Image.new("L", (W, H), int(160 * (1 - k / 0.25)))
        img.paste(flash, (0, 0), m); d = ImageDraw.Draw(img)

    # barra de progreso
    d.rectangle([0, 0, W * min(1, t / total), 12], fill=ORANGE)
    # cabecera de marca
    bx, by, bs = 60, 70, 84
    badge = icon("logo", bs); img.paste(badge, (bx, by), badge)
    d.text((bx + bs + 22, by + 8), "pixel", font=f_brand, fill=WHITE)
    pw = d.textlength("pixel", font=f_brand)
    d.text((bx + bs + 22 + pw, by + 8), "content", font=f_brand, fill=ORANGE)
    cw = d.textlength("pixelcontent", font=f_brand)
    chip_x = bx + bs + 22 + cw + 20
    d.rounded_rectangle([chip_x, by + 18, chip_x + 120, by + 66], radius=24, fill=ORANGE)
    d.text((chip_x + 18, by + 24), "NEWS", font=f_chip, fill=WHITE)
    text_c(d, 182, spec["source"], f_src, MUTED)

    # título grande de la escena (pop)
    s = ease_back(k / 0.35)
    big = sc["big"]
    if big and big != "…":
        lines = [big] if len(big) <= 12 or sc.get("cta") else big.rsplit(" ", 1) if not sc.get("punch") else ["ADULT LIFE", "SIMULATOR"]
        y0 = 300
        for ln in lines:
            fnt = fit_font(ln, 960, 150 if len(lines) == 1 else 120)
            layer = Image.new("RGBA", (W, 200), (0, 0, 0, 0)); ld = ImageDraw.Draw(layer)
            color = ORANGE if (sc.get("punch") or sc.get("siren") or "?" in big) else WHITE
            wln = ld.textlength(ln, font=fnt); ld.text(((W - wln) / 2, 10), ln, font=fnt, fill=color, stroke_width=6, stroke_fill=NAVY)
            if s < 0.999:
                sw, sh = max(1, int(W * s)), max(1, int(200 * s)); layer = layer.resize((sw, sh), Image.LANCZOS)
                img.paste(layer, ((W - sw) // 2, y0 + (200 - sh) // 2), layer)
            else:
                img.paste(layer, (0, y0), layer)
            y0 += 150
        d = ImageDraw.Draw(img)

    # zona central
    shake = (math.sin(t * 80) * 14 if sc.get("punch") and k < 0.5 else 0)
    if sc.get("list"):
        # lista de pendientes de la hora 1 a la 10
        px0, py0 = 110, 640
        d.rounded_rectangle([px0, py0, W - px0, py0 + 520], radius=36, fill=(255, 255, 255, 255))
        d.text((px0 + 40, py0 + 30), "TO-DO · GTA VI", font=F(36, 0), fill=(120, 126, 145))
        for n in (1, 2, 3):
            ry = py0 + 100 + (n - 1) * 135
            if sc["list"] >= n:
                appear = 1 if sc["list"] > n else ease_back(k / 0.3)
                ic = LIST_ICONS[n]; sz = max(1, int(110 * appear))
                img.paste(ic.resize((sz, sz)), (px0 + 40 + (110 - sz) // 2, ry + (110 - sz) // 2), ic.resize((sz, sz)))
                d.text((px0 + 175, ry + 26), LIST_TEXT[n], font=f_list, fill=NAVY)
                if n < 3:
                    d.ellipse([W - px0 - 110, ry + 25, W - px0 - 50, ry + 85], fill=(18, 161, 80))
                    d.line([(W - px0 - 96, ry + 56), (W - px0 - 84, ry + 70), (W - px0 - 62, ry + 42)], fill=WHITE, width=8)
                else:  # cuenta de banco: cargando para siempre
                    cxs, cys = W - px0 - 80, ry + 55
                    for j in range(8):
                        a = 2 * math.pi * j / 8 + t * 6
                        alpha = (j + 1) / 8
                        col = tuple(int(200 - 150 * alpha) for _ in range(3))
                        d.ellipse([cxs + 26 * math.cos(a) - 6, cys + 26 * math.sin(a) - 6, cxs + 26 * math.cos(a) + 6, cys + 26 * math.sin(a) + 6], fill=col)
    else:
        ic = ICONS[sc["icon"]]
        sz = int(440 * ease_back(k / 0.4)) if k < 0.4 else 440
        float_y = math.sin(t * 2.4) * 14
        if sz > 0:
            im2 = ic.resize((sz, sz), Image.LANCZOS) if sz != 440 else ic
            if sc.get("siren"): im2 = im2.rotate(math.sin(t * 20) * 8, resample=Image.BICUBIC)
            img.paste(im2, (int((W - sz) / 2 + shake), int(900 - sz / 2 + float_y)), im2)
        d = ImageDraw.Draw(img)
        if sc.get("cta"):
            bw = 560; bx2 = (W - bw) // 2; byy = 1180
            d.rounded_rectangle([bx2, byy, bx2 + bw, byy + 110], radius=55, fill=ORANGE)
            text_c(d, byy + 22, "SUBSCRIBE", F(58), WHITE)

    # subtítulos (palabra actual en naranja)
    chunk = None
    for ch in sc["chunks"]:
        if t >= ch[0][1] - 0.05: chunk = ch
    if chunk and not sc.get("cta"):
        txt_words = [w_.upper() for w_, _, _ in chunk]
        size = 88
        while True:  # achicar hasta que quepa con margen (960 px)
            fc = F(size)
            widths = [d.textlength(w_ + " ", font=fc) for w_ in txt_words]
            if sum(widths) - d.textlength(" ", font=fc) <= 960 or size <= 52: break
            size -= 4
        total_w = sum(widths) - d.textlength(" ", font=fc); x = (W - total_w) / 2; y = 1300 + (88 - size) // 2
        for (w_, a, b), ww, disp in zip(chunk, widths, txt_words):
            col = ORANGE if a <= t < b + 0.05 else WHITE
            d.text((x, y), disp, font=fc, fill=col, stroke_width=9, stroke_fill=(0, 0, 0))
            x += ww
    return img

# ── 5. codificar ──────────────────────────────────────────────
ff = imageio_ffmpeg.get_ffmpeg_exe()
mp4 = out / "short.mp4"
cmd = [ff, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
       "-i", str(build / "mix.wav"), "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
       "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", str(mp4)]
proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
nframes = int(total * FPS)
previews = {int(sc["t0"] * FPS + 12) for sc in scenes}
for i in range(nframes):
    im = frame(i / FPS)
    if i in previews: im.save(build / f"preview_{i:04d}.jpg", quality=80)
    proc.stdin.write(im.convert("RGB").tobytes())
proc.stdin.close(); proc.wait()
print(f"listo: {mp4}  ({total:.1f} s, {nframes} fotogramas)")
