"""
PixelContent Short — "AI took our portfolios" — estilo Poster Pop (claude-video-2, MIT), 9:16.
Se ejecuta en el sandbox de Higgsfield: lee words.json (tiempos de la voz) y escribe proj/index.html.
"""
import json, shutil, os

words = json.load(open("words.json"))
END = words[-1]["e"] + 2.2          # tiempo extra para la tarjeta final

# (índice de la primera palabra, líneas en pantalla, tipo, extras)
B = [
    (0,  ["AI"], "hero", {"from": "down"}),
    (1,  ["WAS", "SUPPOSED"], "stack", {}),
    (3,  ["TO TAKE"], "stack", {}),
    (5,  ["OUR", "JOBS"], "stack", {"punch": True}),
    (7,  ["THIS", "WEEK"], "stack", {}),
    (9,  ["IT TOOK", "OUR"], "stack", {}),
    (12, ["PORTFOLIOS"], "hero", {"zip": True, "punch": True}),
    (13, ["TECH", "STOCKS"], "stack", {"chip": "VIA BBC"}),
    (15, ["DRAGGED"], "hero", {"from": "right"}),
    (16, ["WALL", "STREET"], "stack", {}),
    (18, ["WORST", "WEEK"], "stack", {"punch": True}),
    (21, ["SINCE THE", "PANDEMIC"], "stack", {}),
    (25, ["BITCOIN"], "hero", {"chip": "VIA COINTELEGRAPH", "from": "up"}),
    (26, ["THE", "“ESCAPE", "HATCH”"], "stack", {}),
    (30, ["FELL", "BELOW"], "stack", {}),
    (32, ["$60K"], "num", {"card": "FIRST DROP SINCE JULY"}),
    (39, ["DIGITAL", "GOLD?"], "stack", {}),
    (41, ["MEET", "GRAVITY"], "gravity", {"punch": True}),
    (43, ["SOUTH", "KOREA"], "stack", {"chip": "VIA INVESTING.COM"}),
    (47, ["KOSPI"], "hero", {"from": "left"}),
    (48, ["−5.2%"], "num", {"card": "PLUNGED", "maxW": 0.94}),
    (50, ["THE", "GOVERNMENT"], "stack", {}),
    (55, ["RESCUE", "FUND"], "card", {}),
    (59, ["TO PROP UP", "STOCKS"], "stack", {}),
    (63, ["BASICALLY"], "hero", {"from": "down"}),
    (64, ["BUY", "THE DIP"], "stack", {"punch": True}),
    (67, ["WITH A"], "stack", {}),
    (69, ["GOVERNMENT", "BADGE"], "card", {"punch": True}),
    (71, ["BLACK", "FRIDAY"], "stack", {"chip": "VIA INVESTING.COM"}),
    (75, ["WALL", "STREET"], "stack", {}),
    (78, ["WANTS", "TO KNOW"], "stack", {}),
    (81, ["ONE", "THING"], "stack", {}),
    (83, ["DO YOU", "STILL"], "stack", {}),
    (86, ["HAVE", "ROOM"], "stack", {}),
    (88, ["CREDIT", "CARD"], "stack", {}),
    (92, ["FOR A"], "stack", {}),
    (94, ["DISCOUNTED", "TV?"], "card", {"punch": True}),
    (96, ["LESSON"], "hero", {"from": "up"}),
    (97, ["OF THE", "WEEK"], "stack", {}),
    (100, ["WHEN", "AI"], "stack", {}),
    (102, ["SNEEZES"], "hero", {"zip": True}),
    (103, ["YOUR", "PORTFOLIO"], "stack", {}),
    (105, ["CATCHES", "A COLD"], "stack", {"punch": True}),
    (108, ["FOLLOW"], "hero", {"from": "down"}),
    (109, [], "logo", {}),
    (111, ["THE NEWS", "THAT MOVES"], "stack", {}),
    (115, ["YOUR", "MONEY"], "stack", {}),
    (117, ["TOLD WITH", "A SMILE"], "stack", {"punch": True}),
    (None, [], "end", {}),
]
beats = []
for idx, lines, kind, ex in B:
    t = (words[idx]["s"] - 0.05) if idx is not None else words[-1]["e"] + 0.45
    beats.append({"t": round(max(0, t), 3), "lines": lines, "kind": kind, **ex})
beats[0]["t"] = 0

os.makedirs("proj", exist_ok=True)
shutil.copy("cv2/styles/poster-pop/studio.js", "proj/studio.js")
html = open("template.html").read()
html = html.replace("__DURATION__", f"{END:.3f}").replace("__BEATS__", json.dumps(beats))
open("proj/index.html", "w").write(html)
json.dump({"duration": END, "beats": [b["t"] for b in beats]}, open("timing.json", "w"))
print(f"{len(beats)} escenas, {END:.2f} s")
