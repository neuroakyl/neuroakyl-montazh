"""Черновые тайминги слов без голоса — собрать и проверить монтаж до озвучки.

  python3 -I demo_words.py текст.txt ВЫХОД.json [--wps 2.4]
Длина слова — от числа букв, после точки/вопроса пауза 0,35 с, после запятой 0,15 с.
Когда появится настоящий голос (golos.py), words.json просто заменяется — сцены привязаны к словам, не к секундам.
"""
import argparse, json, pathlib, re

ap = argparse.ArgumentParser()
ap.add_argument("text"); ap.add_argument("out"); ap.add_argument("--wps", type=float, default=2.4)
a = ap.parse_args()
t, out = 0.1, []
for wd in pathlib.Path(a.text).read_text().split():
    letters = len(re.sub(r"\W", "", wd))
    d = max(0.18, letters / (a.wps * 5.2))
    out.append({"text": wd, "start": round(t, 3), "end": round(t + d, 3)})
    t += d + 0.06 + (0.35 if wd[-1] in ".?!" else 0.15 if wd[-1] in ",:;" else 0)
pathlib.Path(a.out).write_text(json.dumps(out, ensure_ascii=False, indent=1))
print(f"{len(out)} слов, {t:.1f} с")
