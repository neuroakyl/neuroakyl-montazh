"""Живая съёмка и готовые записи: убрать паузы и дубли, собрать монтаж для композиции Klipy. Mac и Windows.

  python3 -I инструменты/rezka.py slova ВИДЕО -o words.json [--lang ru] [--model small]   слова с временем (faster-whisper)
  python3 -I инструменты/rezka.py tekst words.json                                        текст фразами с временем: по нему ищи дубли и оговорки
  python3 -I инструменты/rezka.py rez ВИДЕО words.json --dvizhok ПАПКА_ДВИЖКА [--format vertical|horizontal]
         [--ubrat "12.3-15.1,20-21.4"] [--pauza 0.35] [--zapas 0.08] [--fokus "50% 30%"]

rez кладёт видео в public/klipy/, пишет src/montazh.json и переводит слова на новое время в src/words.json.
Паузы длиннее --pauza вырезаются сами; дубли и оговорки — по --ubrat (секунды исходника). Рендер: COMP=Klipy node render.mjs.
Кыргызского у Whisper нет: для него слова бери из words.py (выравнивание сценария по звуку).
"""
import argparse, json, os, pathlib, shutil, sys


def slova(a):
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        sys.exit("нет faster-whisper: pip install faster-whisper в окружении движка (модель small ~500 МБ скачается один раз)")
    model = WhisperModel(a.model, device="cpu", compute_type="int8")
    segs, _ = model.transcribe(a.video, language=a.lang, vad_filter=True, word_timestamps=True)
    out = [{"text": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3)} for s in segs for w in s.words]
    pathlib.Path(a.o).write_text(json.dumps(out, ensure_ascii=False, indent=0))
    print(f"{len(out)} слов, {out[-1]['end'] if out else 0:.1f} с → {a.o}")


def tekst(a):
    words = json.loads(pathlib.Path(a.words).read_text())
    cur = []
    for i, w in enumerate(words):
        cur.append(w)
        nxt = words[i + 1] if i + 1 < len(words) else None
        if not nxt or nxt["start"] - w["end"] > 0.4 or w["text"][-1:] in ".!?…":
            print(f"{cur[0]['start']:7.2f}–{cur[-1]['end']:7.2f}  {' '.join(x['text'] for x in cur)}")
            cur = []


def spans(s):
    return [tuple(float(x) for x in p.split("-")) for p in s.split(",")] if s else []


def segmenty(words, pauza, zapas):
    """Куски исходника, которые оставляем: слова подряд, пока пауза между ними не длиннее pauza."""
    segs = []
    for w in words:
        if segs and w["start"] - segs[-1][1] <= pauza:
            segs[-1][1] = w["end"]
        else:
            segs.append([w["start"], w["end"]])
    # запас по краям не должен заходить на соседний кусок
    out = []
    for i, (a, b) in enumerate(segs):
        lo = max(0.0, a - zapas) if i == 0 else max(a - zapas, (segs[i - 1][1] + a) / 2)
        hi = b + zapas if i == len(segs) - 1 else min(b + zapas, (b + segs[i + 1][0]) / 2)
        out.append([round(lo, 3), round(hi, 3)])
    return out


def rez(a):
    words = json.loads(pathlib.Path(a.words).read_text())
    drop = spans(a.ubrat)
    kept = [w for w in words if not any(lo <= (w["start"] + w["end"]) / 2 <= hi for lo, hi in drop)]
    if not kept:
        sys.exit("после --ubrat не осталось слов")
    segs = segmenty(kept, a.pauza, a.zapas)

    dv = pathlib.Path(a.dvizhok)
    dst = dv / "public" / "klipy" / ("zapis" + pathlib.Path(a.video).suffix.lower())
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        dst.unlink()
    try:
        os.link(a.video, dst)  # тяжёлую запись не дублируем
    except OSError:
        shutil.copy(a.video, dst)

    # новое время слов: сдвиг каждого куска считаем от накопленной длины (те же кадры, что в Klipy.tsx)
    new_words, pos = [], 0.0
    for lo, hi in segs:
        for w in kept:
            if lo <= w["start"] and w["end"] <= hi:
                new_words.append({"text": w["text"], "start": round(pos + w["start"] - lo, 3), "end": round(pos + w["end"] - lo, 3)})
        pos += hi - lo
    (dv / "src" / "words.json").write_text(json.dumps(new_words, ensure_ascii=False, indent=0))

    f = dv / "src" / "montazh.json"
    m = json.loads(f.read_text())
    m["format"] = a.format
    klip = {"src": f"klipy/{dst.name}", "zvuk": True, "kamera": "none"}
    if a.fokus:
        klip["fokus"] = a.fokus
    m["klipy"] = [{**klip, "ot": lo, "do": hi} for lo, hi in segs]
    f.write_text(json.dumps(m, ensure_ascii=False, indent=2))
    was = words[-1]["end"] - words[0]["start"]
    print(f"кусков: {len(segs)}, слов: {len(new_words)} из {len(words)}, было {was:.1f} с речи, стало {pos:.1f} с")


ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
sub = ap.add_subparsers(dest="cmd", required=True)
p = sub.add_parser("slova"); p.add_argument("video"); p.add_argument("-o", default="words.json"); p.add_argument("--lang"); p.add_argument("--model", default="small"); p.set_defaults(fn=slova)
p = sub.add_parser("tekst"); p.add_argument("words"); p.set_defaults(fn=tekst)
p = sub.add_parser("rez"); p.add_argument("video"); p.add_argument("words"); p.add_argument("--dvizhok", required=True)
p.add_argument("--format", default="vertical", choices=["vertical", "horizontal"]); p.add_argument("--ubrat", default="")
p.add_argument("--pauza", type=float, default=0.35); p.add_argument("--zapas", type=float, default=0.08); p.add_argument("--fokus"); p.set_defaults(fn=rez)
a = ap.parse_args()
a.fn(a)
