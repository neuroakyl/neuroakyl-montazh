#!/usr/bin/env python3
"""Тайминги каждого слова для ролика на кыргызском (HeyGen-аватар и любые другие).

Как работает:
  1. Достаёт звук из видео (ffmpeg, 16 кГц моно).
  2. Если в ролике есть зелёная полоса HeyGen с субтитрами по одному слову,
     находит моменты смены слов (сравнение кадров в полосе). Это бесплатная
     вторая разметка для проверки.
  3. Если число слов в тексте не совпадает с числом слов в полосе (озвучка
     отличается от сценария), читает слова из полосы через встроенный OCR
     macOS (Vision) и сводит текст: берёт написание из сценария, а вставки и
     выкинутые слова берёт из полосы.
  4. Принудительное выравнивание текста по звуку моделью MMS_FA (torchaudio,
     Meta MMS, 1100+ языков через романизацию uroman). Это основные тайминги.
  5. Сверка с полосой: медианный сдвиг и выбросы. Если выравнивание где-то
     разошлось с полосой больше чем на 0.25 с, у слова ставится флаг "check".

Выход: JSON-список [{"text": "Эртең", "start": 0.12, "end": 0.48}, ...] в секундах.
Если после слова пауза >= --min-pause, у слова есть поле "pause_after" (секунды).

Примеры:
  .venv/bin/python words.py video.mp4 --text script.txt -o 1-words.json
  .venv/bin/python words.py video.mp4 --script-json Партия-1.json --n 1 -o 1-words.json
  .venv/bin/python words.py video.mp4 --source bar -o words.json   # без текста, только полоса+OCR
"""
import argparse
import difflib
import json
import os
import re
import subprocess
import sys
import tempfile
import time

import numpy as np

SR = 16000


def log(*a):
    print(*a, file=sys.stderr, flush=True)


# ---------------------------------------------------------------- audio
def extract_audio(video, wav):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", video, "-ac", "1", "-ar", str(SR), wav], check=True)


# ---------------------------------------------------------------- green bar
def detect_bar(video, max_check=50):
    """Высота зелёной полосы сверху (px) или 0, если полосы нет."""
    import cv2
    cap = cv2.VideoCapture(video)
    heights = []
    for _ in range(max_check):
        ok, f = cap.read()
        if not ok:
            break
        g = (f[:, :, 1] > 200) & (f[:, :, 0] < 80) & (f[:, :, 2] < 80)  # BGR: чистый зелёный
        row = g.mean(1)
        h = 4  # верхние 1-2 строки размыты сжатием, начинаем чуть ниже
        if row[h] <= 0.5:
            heights.append(0)
            continue
        while h < len(row) and row[h] > 0.5:
            h += 1
        heights.append(h)
    cap.release()
    h = int(np.median(heights)) if heights else 0
    return h if h >= 40 else 0


def bar_cues(video, bar_h):
    """Интервалы показа слов в полосе: [(start_frame, end_frame_inclusive), ...], fps, mid-кадры."""
    import cv2
    cap = cv2.VideoCapture(video)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    cues, cur, prev = [], None, None
    mids = {}
    i = 0
    while True:
        ok, f = cap.read()
        if not ok:
            break
        b = f[0:bar_h - 2]
        m = (b[:, :, 0] > 128) & (b[:, :, 2] > 128)  # белый текст: высокие B и R
        c = int(m.sum())
        if c < 50:
            if cur:
                cues.append(cur)
                cur = None
            prev = None
        else:
            if cur is not None and prev is not None and int((m ^ prev).sum()) < 0.05 * c:
                cur[1] = i
            else:
                if cur:
                    cues.append(cur)
                cur = [i, i]
            prev = m
        i += 1
    if cur:
        cues.append(cur)
    cap.release()
    return [tuple(x) for x in cues], fps


def ocr_cues(video, bar_h, cues):
    """Читает слово каждой реплики встроенным OCR macOS (Vision, ru-RU)."""
    import cv2
    import Vision
    from Foundation import NSData

    def ocr(img):
        ok, buf = cv2.imencode(".png", img)
        data = NSData.dataWithBytes_length_(buf.tobytes(), len(buf))
        h = Vision.VNImageRequestHandler.alloc().initWithData_options_(data, None)
        req = Vision.VNRecognizeTextRequest.alloc().init()
        req.setRecognitionLevel_(0)
        req.setRecognitionLanguages_(["ru-RU"])
        req.setUsesLanguageCorrection_(False)
        h.performRequests_error_([req], None)
        return " ".join(r.topCandidates_(1)[0].string() for r in (req.results() or []))

    want = {(a + b) // 2: k for k, (a, b) in enumerate(cues)}
    out = [""] * len(cues)
    cap = cv2.VideoCapture(video)
    i = 0
    while True:
        ok, f = cap.read()
        if not ok:
            break
        if i in want:
            b = f[0:bar_h]
            m = ((b[:, :, 0] > 128) & (b[:, :, 2] > 128)).astype(np.uint8) * 255
            out[want[i]] = ocr(cv2.cvtColor(255 - m, cv2.COLOR_GRAY2BGR)).strip()
        i += 1
    cap.release()
    return out


# ---------------------------------------------------------------- text
FOLD = str.maketrans({"ң": "н", "ө": "о", "ү": "у", "ё": "е", "і": "и", "ї": "и", "є": "е"})
LAT2CYR = str.maketrans({"a": "а", "b": "в", "c": "с", "e": "е", "h": "н", "k": "к", "m": "м",
                         "o": "о", "p": "р", "t": "т", "x": "х", "y": "у"})


def fold(w):
    w = w.lower().translate(LAT2CYR).translate(FOLD)
    return re.sub(r"[^а-яa-z0-9]", "", w)


class OcrWord(str):
    """Слово, взятое из OCR полосы (написание может быть кривым)."""


def reconcile(script_words, ocr_words):
    """Сводит текст сценария со словами из полосы. Возвращает (слова, отчёт)."""
    a = [fold(w) for w in script_words]
    b = [fold(w) for w in ocr_words]
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    out, notes = [], []
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal":
            out += script_words[i1:i2]
        elif op == "replace" and (i2 - i1) == (j2 - j1):
            # та же длина: близкие пары — опечатка OCR (берём сценарий), иначе слово из полосы
            # столько же слов: почти всегда это ошибка OCR, оставляем написание сценария
            for s, o in zip(script_words[i1:i2], ocr_words[j1:j2]):
                out.append(s)
                if difflib.SequenceMatcher(None, fold(s), fold(o)).ratio() < 0.6:
                    notes.append(f"OCR прочитал «{o}», оставлено «{s}» (проверь на слух)")
        else:
            if i2 > i1:
                notes.append(f"нет в озвучке: «{' '.join(script_words[i1:i2])}»")
            if j2 > j1:
                notes.append(f"есть в озвучке: «{' '.join(ocr_words[j1:j2])}»")
            for o in ocr_words[j1:j2]:
                # OCR путает регистр (ИчИнИЗ) — приводим к нижнему, кроме слов целиком капсом
                o = o if (o.isupper() and len(o) > 3) else o[:1] + o[1:].lower()
                out.append(OcrWord(o or "?"))
    return out, notes


# ---------------------------------------------------------------- MMS forced alignment
def mms_align(wav_path, words, device="cpu"):
    import soundfile as sf
    import torch
    import torchaudio
    import uroman as ur

    a, sr = sf.read(wav_path, dtype="float32")
    assert sr == SR
    wav = torch.from_numpy(a)[None]
    U = ur.Uroman()
    bundle = torchaudio.pipelines.MMS_FA
    model = bundle.get_model(with_star=False).to(device)
    dic = bundle.get_dict(star=None)

    def norm(w):
        r = U.romanize_string(w, lcode="kir").lower()
        r = re.sub(r"[^a-z']", "", r)
        return r or "a"

    toks = [norm(w) for w in words]
    # кусками по 30 с, чтобы не упираться в память; эмиссии склеиваем
    chunk = 30 * SR
    ems = []
    with torch.inference_mode():
        for s in range(0, wav.shape[1], chunk):
            seg = wav[:, s:s + chunk]
            if seg.shape[1] < 400:
                continue
            e, _ = model(seg.to(device))
            ems.append(e.cpu())
    em = torch.cat(ems, 1)
    ratio = wav.shape[1] / em.shape[1] / SR
    targets = torch.tensor([[dic[c] for w in toks for c in w]], dtype=torch.int32)
    ali, scores = torchaudio.functional.forced_align(em, targets, blank=0)
    spans = torchaudio.functional.merge_tokens(ali[0], scores[0].exp())
    out, i = [], 0
    for w, r in zip(words, toks):
        sp = spans[i:i + len(r)]
        i += len(r)
        sc = sum(s.score * len(s) for s in sp) / sum(len(s) for s in sp)
        out.append({"text": w, "start": sp[0].start * ratio, "end": sp[-1].end * ratio, "score": float(sc)})
    return out


# ---------------------------------------------------------------- silences
def silences(wav_path, min_len):
    """Участки тишины по громкости (окно 5 мс, порог = 10-й перцентиль + 10 дБ)."""
    import soundfile as sf
    a, sr = sf.read(wav_path, dtype="float32")
    h = int(sr * 0.005)
    n = len(a) // h
    rms = np.sqrt(np.mean(a[:n * h].reshape(n, h) ** 2, 1))
    db = 20 * np.log10(rms + 1e-9)
    thr = np.percentile(db, 10) + 10
    quiet = db < thr
    out, i = [], 0
    while i < n:
        if quiet[i]:
            j = i
            while j < n and quiet[j]:
                j += 1
            if (j - i) * 0.005 >= min_len:
                out.append((i * 0.005, j * 0.005))
            i = j
        else:
            i += 1
    return out, len(a) / sr


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("video")
    ap.add_argument("--text", help="файл с текстом или сам текст")
    ap.add_argument("--script-json", help="JSON-партия сценариев (список объектов с n и text)")
    ap.add_argument("--n", type=int, help="номер сценария в партии")
    ap.add_argument("--source", choices=["auto", "mms", "bar"], default="auto",
                    help="auto: MMS по звуку + сверка с полосой; bar: только тайминги из полосы")
    ap.add_argument("--min-pause", type=float, default=0.15, help="минимальная пауза, с")
    ap.add_argument("--bar-lead", type=float, default=0.09, help="на сколько полоса HeyGen опережает звук, с")
    ap.add_argument("--max-diff", type=float, default=0.15,
                    help="если MMS и полоса расходятся сильнее (с), берётся время из полосы")
    ap.add_argument("--device", default="cpu", help="cpu или mps (на M2 скорость одинаковая)")
    ap.add_argument("-o", "--out", default="words.json")
    args = ap.parse_args()
    t0 = time.time()

    script = None
    if args.script_json:
        data = json.load(open(args.script_json, encoding="utf-8"))
        script = next(x["text"] for x in data if x.get("n") == args.n)
    elif args.text:
        script = open(args.text, encoding="utf-8").read() if os.path.exists(args.text) else args.text
    script_words = script.split() if script else None

    bar_h = detect_bar(args.video)
    cues, fps = ([], 25.0)
    if bar_h:
        cues, fps = bar_cues(args.video, bar_h)
        log(f"[полоса] высота {bar_h}px, слов в полосе: {len(cues)}")
    else:
        log("[полоса] не найдена")

    words = script_words
    notes = []
    if cues and (words is None or len(words) != len(cues)):
        if sys.platform == "darwin":
            log(f"[текст] слов в тексте {len(words) if words else 0} != {len(cues)} в полосе -> OCR полосы")
            ocr_words = ocr_cues(args.video, bar_h, cues)
            if words:
                words, notes = reconcile(words, ocr_words)
            else:
                words = [OcrWord(w or "?") for w in ocr_words]
            for n_ in notes:
                log("   ", n_)
        else:
            log("[текст] количество слов не совпадает, OCR доступен только на macOS")
    if not words:
        sys.exit("Нет текста: дайте --text/--script-json или ролик с зелёной полосой")

    bar_words = None
    if cues and len(cues) == len(words):
        # субтитры HeyGen в полосе появляются примерно на 2 кадра раньше звука (замерено: ~90 мс)
        bar_words = [{"text": w, "start": a / fps + args.bar_lead, "end": (b + 1) / fps + args.bar_lead}
                     for w, (a, b) in zip(words, cues)]

    with tempfile.TemporaryDirectory() as td:
        wav = os.path.join(td, "a.wav")
        extract_audio(args.video, wav)
        sil, dur = silences(wav, args.min_pause)
        if args.source == "bar":
            if not bar_words:
                sys.exit("Слова в полосе не сопоставились с текстом один к одному")
            res = bar_words
        else:
            t1 = time.time()
            res = mms_align(wav, words, args.device)
            log(f"[mms] выравнивание {time.time() - t1:.1f} с")
    if bar_words and args.source != "bar":
        d = np.array([r["start"] - b["start"] for r, b in zip(res, bar_words)])
        log(f"[сверка] MMS минус полоса(с поправкой {args.bar_lead * 1000:.0f} мс): медиана {np.median(d) * 1000:+.0f} мс, "
            f"|разница| <=80 мс: {np.mean(np.abs(d) <= 0.08) * 100:.0f}%")
        for r, b, x in zip(res, bar_words, d):
            if abs(x) > args.max_diff:
                # выравнивание по звуку разошлось с полосой (обычно кривой текст) — верим полосе
                log(f"   «{r['text']}»: mms {r['start']:.2f} / полоса {b['start']:.2f} -> беру полосу")
                r["start"], r["end"], r["check"] = b["start"], b["end"], True
        for k in range(1, len(res)):  # порядок слов не должен ломаться после подмен
            if res[k]["start"] < res[k - 1]["start"] + 0.04:
                res[k]["start"] = res[k - 1]["start"] + 0.04

    # Концы слов: у CTC конец слова ненадёжен, поэтому слово тянем до начала следующего,
    # а паузой считаем только реальную тишину в звуке (по громкости) между словами.
    out = []
    for k, r in enumerate(res):
        nxt = res[k + 1]["start"] if k + 1 < len(res) else dur
        end = nxt
        for s0, s1 in sil:
            if s1 > r["end"] - 0.05 and s0 < nxt and s0 >= r["start"] + 0.05:
                end = min(max(s0, r["start"] + 0.05), nxt)
                break
        item = {"text": r["text"], "start": round(r["start"], 3), "end": round(end, 3)}
        if k + 1 < len(res) and nxt - end >= args.min_pause:
            item["pause_after"] = round(nxt - end, 3)
        if r.get("check") or isinstance(r["text"], OcrWord):
            item["check"] = True  # слово из OCR или время взято из полосы — глянуть глазами
        out.append(item)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    log(f"[готово] {len(out)} слов -> {args.out} за {time.time() - t0:.1f} с")


if __name__ == "__main__":
    main()
