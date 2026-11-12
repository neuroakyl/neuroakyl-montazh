"""segs.py — нарезка сплошного трека голоса на куски под платный аватар (HeyGen V/IV) + проверка доли лица ДО генерации.

Запуск (python3 -I):
  segs.py --track TRACK.mp3|mp4 --words words.json --out ПАПКА [--engine v|iv] [--max 30] [--pad 0.5] "Слово..Слово" "Слово#2..END" ...
Спецификация куска: первое..последнее слово фразы (регистр и знаки не важны), `#N` — N-е вхождение слова в тексте, `END` — до конца трека.
Последнее слово без `#N` ищется после первого слова куска. Кусок с концом раньше начала — ошибка, код 3.
words.json — список {"text","start","end"} (его даёт golos.py / words.py). Пишет ПАПКА/segs.json и seg-N.mp3 (mono 44.1k).
Лимит доли лица — в коде: доля > --max % длины трека → код выхода 2, mp3 не режутся. Обойти флагом нельзя:
хочешь больше — режь план. Оценка кредитов: V ≈1 кр/с, IV ≈0,7 кр/с (замеры на реальных роликах; HeyGen считает округлённо за кусок).
"""
import argparse, json, re, subprocess, sys, pathlib

RATE = {"v": 1.0, "iv": 0.7}  # кредитов в секунду
ap = argparse.ArgumentParser()
ap.add_argument("--track", required=True); ap.add_argument("--words", required=True); ap.add_argument("--out", required=True)
ap.add_argument("--engine", choices=RATE, default="v"); ap.add_argument("--max", type=float, default=30.0, help="потолок доли лица, %%")
ap.add_argument("--pad", type=float, default=0.5, help="запас на переходы, с (0.3-0.5)")
ap.add_argument("--dry", action="store_true", help="только посчитать долю и кредиты, mp3 не резать")
ap.add_argument("specs", nargs="+")
a = ap.parse_args()
out_dir = pathlib.Path(a.out); out_dir.mkdir(parents=True, exist_ok=True)
w = json.load(open(a.words))
clean = lambda s: re.sub(r"[^a-zа-яёңөүәіұқғһ0-9]", "", s.lower())
dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", a.track]))

def find(ref, after=-1):
    # after: для последнего слова куска — без #N ищем первое вхождение после начала куска, с #N — N-е по всему тексту
    raw, _, n = ref.partition("#"); explicit = bool(n); n = int(n or 1)
    hits = [i for i, x in enumerate(w) if clean(x["text"]) == clean(raw) and (explicit or i >= after)]
    if len(hits) < n: print(f"слово «{raw}» (вхождение {n}) не найдено в words.json", file=sys.stderr); sys.exit(3)
    return hits[n - 1]

plan = []
for i, spec in enumerate(a.specs):
    x, _, y = spec.partition("..")
    ia = find(x); end = y == "END"; ib = len(w) - 1 if end else find(y, after=ia)
    if ib < ia: print(f"кусок «{spec}»: конец раньше начала — укажи #N у последнего слова", file=sys.stderr); sys.exit(3)
    s = max(0, w[ia]["start"] - a.pad)
    e = dur if end or ib + 1 >= len(w) else min(dur, w[ib + 1]["start"] + a.pad)
    plan.append(dict(i=i, start=round(s, 2), end=round(e, 2), file=f"seg-{i}.mp3", words=f"{w[ia]['text']}..{w[ib]['text']}"))

# длина с учётом наложения кусков (объединение интервалов), чтобы не считать дважды
face, cur = 0.0, None
for s, e in sorted((p["start"], p["end"]) for p in plan):
    if cur and s <= cur[1]: cur[1] = max(cur[1], e)
    else:
        if cur: face += cur[1] - cur[0]
        cur = [s, e]
if cur: face += cur[1] - cur[0]
share = 100 * face / dur
credits = face * RATE[a.engine]
print(f"трек {dur:.1f} с · лицо {face:.1f} с = {share:.1f}% · движок {a.engine.upper()} ≈ {credits:.0f} кр (потолок {a.max:.0f}%)")
if share > a.max:
    print(f"ОШИБКА: доля лица {share:.1f}% больше {a.max:.0f}%. Режь план (меньше кусков, запас --pad 0.3), генерировать нельзя.", file=sys.stderr); sys.exit(2)
if a.dry:
    for p in plan: print(p)
    sys.exit(0)

for p in plan:
    f = out_dir / p["file"]
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(p["start"]), "-to", str(p["end"]), "-i", a.track, "-vn", "-ac", "1", "-ar", "44100", "-b:a", "192k", str(f)], check=True)
    p["size"] = f.stat().st_size
json.dump(dict(track_dur=round(dur, 2), face_sec=round(face, 2), share_pct=round(share, 1), engine=a.engine, credits_est=round(credits), segs=plan),
          open(out_dir / "segs.json", "w"), ensure_ascii=False, indent=1)
for p in plan: print(p)
