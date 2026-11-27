"""Акценты по замеру звука, а не по разметке слов (разметка врёт на ~0,3 с — память montage-pro-level-benchmark).

  python3 -I akcenty.py voice.wav words.json "Кредитин" "үч#2" "банктан" …   [--json]

Для каждого слова (#N — N-е вхождение) ищет в окне [start − 0,2; start + 0,3] момент самой резкой атаки громкости
(скачок огибающей 5 мс) — туда ставить толчок камеры, удар, появление слова. Печатает «слово  разметка → атака».
--json — список атак в секундах (вставить в akcenty={[…]} у LitsoVid или в тайминги ролика).
"""
import json, re, subprocess, sys

import numpy as np

a = [x for x in sys.argv[1:] if x != "--json"]
if len(a) < 3:
    sys.exit(__doc__)
wav, wj, refs = a[0], a[1], a[2:]
SR = 16000
x = np.frombuffer(subprocess.run(["ffmpeg", "-v", "error", "-i", wav, "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
                                 capture_output=True).stdout, np.int16).astype(np.float32) / 32768
hop = int(SR * 0.005)
env = np.sqrt(np.convolve(x ** 2, np.ones(hop * 4) / (hop * 4), "same"))[::hop]
db = 20 * np.log10(env + 1e-6)
words = json.load(open(wj, encoding="utf-8"))
clean = lambda s: re.sub(r"[^\wәөүңіұқғһ]", "", s.lower())
out = []
for ref in refs:
    raw, _, n = ref.partition("#")
    hits = [w for w in words if clean(w["text"]) == clean(raw)]
    if len(hits) < int(n or 1):
        print(f"нет слова «{ref}»", file=sys.stderr)
        continue
    w = hits[int(n or 1) - 1]
    i0, i1 = max(1, int((w["start"] - 0.2) / 0.005)), min(len(db) - 1, int((w["start"] + 0.3) / 0.005))
    rise = db[i0:i1] - db[i0 - 1:i1 - 1]
    # атака = максимальный рост за 15 мс
    r3 = np.convolve(rise, np.ones(3), "same")
    t = round((i0 + int(np.argmax(r3))) * 0.005, 3)
    out.append(t)
    if "--json" not in sys.argv:
        print(f"{ref:14} разметка {w['start']:.3f} → атака {t:.3f} ({t - w['start']:+.3f})")
if "--json" in sys.argv:
    print(json.dumps(out))
