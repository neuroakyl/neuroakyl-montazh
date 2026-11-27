#!/usr/bin/env python3
"""Подготовка эталона к покадровому разбору: замер склеек, вспышек и звука + листы кадров 12 к/с + слова с временем.

  <движок>/.venv/bin/python -I инструменты/razbor12.py ВИДЕО.mp4 [--out ПАПКА] [--fps N] [--whisper ПУТЬ_К_PYTHON]
  По умолчанию — КАЖДЫЙ кадр ролика (25/30 к/с; 50/60 к/с — каждый второй, 30). --fps 12 — облегчённо (Бобби 27.11: «каждый кадр»).

Зачем (Бобби 25–27.11.2026): разбор Gemini на 1 к/с монтажа не видит. Claude смотрит кадры сам, а то, что мерится точно
(склейки, вспышки, пики звука), меряет этот скрипт — с точностью до кадра.

Пишет в ПАПКУ (по умолчанию рядом с видео):
  kadry/s0000.jpg …   по листу на секунду: все кадры секунды (30 = 6×5, 25 = 5×5, 24 = 6×4; лист NNNN = секунда NNNN,
                      ячейка k слева направо, сверху вниз → время NNNN + k/fps; fps — в zamer.json list_fps)
  obzor01.jpg …       весь ролик 2 к/с, 48 ячеек = 24 с на лист (лист NN → с (NN−1)·24 с) — сначала он, чтобы понять структуру
  zamer.json          frames: [t, scene, yavg]; cuts: [t]; flashes: [t, dY]; zvuk: [t, dB, сила]; words: [{w, s, e}]
  zamer.md            одна лента событий по времени: склейки, вспышки, удары звука, слова — для чтения глазами
Слова — faster-whisper (06_Инструменты/golos-v-tekst/.venv), если есть; нет — без слов.
"""
import json, math, pathlib, re, subprocess, sys

HERE = pathlib.Path(__file__).resolve().parent
FONT = HERE.parent / "шаблон" / "public" / "fonts" / "Montserrat-Variable.ttf"
WHISPER_PY = pathlib.Path.home() / "Projects" / "06_Инструменты" / "golos-v-tekst" / ".venv" / "bin" / "python"


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def info(v):
    r = run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate:format=duration",
             "-of", "json", str(v)])
    j = json.loads(r.stdout)
    s = j["streams"][0]
    a, _, b = s["r_frame_rate"].partition("/")
    return s["width"], s["height"], float(a) / float(b or 1), float(j["format"]["duration"])


def listy(v, out, fps):
    """лист = 1 секунда, все кадры этой секунды сеткой"""
    k = out / "kadry"
    k.mkdir(parents=True, exist_ok=True)
    for f in k.glob("s*.jpg"):
        f.unlink()
    # drawtext в brew-ffmpeg нет (без freetype) — время не пишем, оно задано местом: лист NNNN = секунда NNNN,
    # ячейка слева направо, сверху вниз, номер k (0…fps-1) → время NNNN + k/fps
    cols = 6 if fps % 6 == 0 else 5 if fps % 5 == 0 else 4
    rows = -(-fps // cols)
    w = 270 if fps <= 12 else 220
    vf = f"fps={fps},scale={w}:-2,tile={cols}x{rows}:padding=4:color=white"
    r = run(["ffmpeg", "-v", "error", "-y", "-i", str(v), "-vf", vf, "-q:v", "4", "-start_number", "0", str(k / "s%04d.jpg")])
    if r.returncode:
        sys.exit("ffmpeg листы: " + r.stderr[-400:])
    vf2 = "fps=2,scale=180:-2,tile=8x6:padding=3:color=white"  # лист обзора: 48 ячеек = 24 с, ячейка k → +k/2 с
    run(["ffmpeg", "-v", "error", "-y", "-i", str(v), "-vf", vf2, "-q:v", "4", str(out / "obzor%02d.jpg")])
    return len(list(k.glob("s*.jpg")))


def kadry_zamer(v):
    """scene score (0–1) и средняя яркость каждого кадра"""
    vf = "scale=160:-2,select='gte(scene\\,0)',signalstats,metadata=print:file=-"
    r = run(["ffmpeg", "-v", "error", "-i", str(v), "-an", "-vf", vf, "-f", "null", "-"])
    fr, cur = [], {}
    for line in r.stdout.splitlines():
        m = re.search(r"pts_time:([\d.]+)", line)
        if m:
            if cur:
                fr.append(cur)
            cur = {"t": float(m.group(1))}
            continue
        m = re.search(r"lavfi\.(scene_score|signalstats\.YAVG)=([\d.]+)", line)
        if m:
            cur["scene" if m.group(1) == "scene_score" else "y"] = float(m.group(2))
    if cur:
        fr.append(cur)
    return [[round(f["t"], 3), round(f.get("scene", 0), 3), round(f.get("y", 0), 1)] for f in fr]


def sobytiya(fr):
    cuts, flashes = [], []
    for i, (t, sc, y) in enumerate(fr):
        if sc >= 0.30 and (not cuts or t - cuts[-1] > 0.12):
            cuts.append(t)
        if i >= 3:
            base = sorted(x[2] for x in fr[max(0, i - 8):i])[len(fr[max(0, i - 8):i]) // 2]
            if y - base >= 35 and (not flashes or t - flashes[-1][0] > 0.3):
                flashes.append([t, round(y - base, 1)])
    return cuts, flashes


def zvuk(v):
    """удары звука: всплеск энергии (спектральный поток) над фоном; t, громкость дБ, сила 0–1"""
    try:
        import numpy as np
    except ImportError:
        return []
    sr = 22050
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(v), "-ac", "1", "-ar", str(sr), "-f", "s16le", "-"], capture_output=True).stdout
    x = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
    if len(x) < sr:
        return []
    win, hop = 1024, 256
    n = (len(x) - win) // hop
    fr = np.lib.stride_tricks.as_strided(x, (n, win), (x.strides[0] * hop, x.strides[0])) * np.hanning(win)
    S = np.abs(np.fft.rfft(fr, axis=1))
    flux = np.maximum(0, np.diff(np.log1p(S * 50), axis=0)).sum(1)
    rms = 20 * np.log10(np.sqrt((fr ** 2).mean(1)) + 1e-9)
    k = int(0.5 * sr / hop)
    out = []
    for i in range(1, len(flux) - 1):
        lo, hi = max(0, i - k), min(len(flux), i + k)
        med = np.median(flux[lo:hi])
        if flux[i] > flux[i - 1] and flux[i] >= flux[i + 1] and flux[i] > med * 2.2 and flux[i] > np.percentile(flux, 80):
            t = (i + 1) * hop / sr
            if not out or t - out[-1][0] > 0.09:
                out.append([round(t, 3), round(float(rms[min(i + 4, len(rms) - 1)]), 1), float(flux[i])])
    if out:
        mx = max(o[2] for o in out)
        out = [[t, db, round(f / mx, 2)] for t, db, f in out]
    return out


def slova(v, py):
    if not py or not pathlib.Path(py).exists():
        return []
    code = ("import sys,json\nfrom faster_whisper import WhisperModel\n"
            "m=WhisperModel('small',device='cpu',compute_type='int8')\n"
            "segs,_=m.transcribe(sys.argv[1],word_timestamps=True,vad_filter=True)\n"
            "print(json.dumps([{'w':w.word.strip(),'s':round(w.start,2),'e':round(w.end,2)} for s in segs for w in (s.words or [])],ensure_ascii=False))")
    r = run([str(py), "-I", "-c", code, str(v)], timeout=1800)
    try:
        return json.loads(r.stdout.strip().splitlines()[-1])
    except Exception:
        return []


def main():
    a = sys.argv[1:]
    if not a or a[0].startswith("-"):
        sys.exit(__doc__)
    opt = lambda n, d=None: a[a.index(n) + 1] if n in a else d
    v = pathlib.Path(a[0]).resolve()
    out = pathlib.Path(opt("--out", v.parent)).resolve()
    out.mkdir(parents=True, exist_ok=True)
    w, h, vfps, dur = info(v)
    nat = round(vfps)
    fps = int(opt("--fps", nat if nat <= 30 else nat // 2 if nat // 2 <= 30 else 30))
    n = listy(v, out, fps)
    fr = kadry_zamer(v)
    cuts, flashes = sobytiya(fr)
    zv = zvuk(v)
    wd = slova(v, opt("--whisper", WHISPER_PY))
    z = {"video": v.name, "w": w, "h": h, "fps": round(vfps, 3), "dur": round(dur, 2), "listy": n, "list_fps": fps,
         "cuts": cuts, "flashes": flashes, "zvuk": zv, "words": wd, "frames": fr}
    (out / "zamer.json").write_text(json.dumps(z, ensure_ascii=False), encoding="utf-8")
    ev = [(t, "СКЛЕЙКА") for t in cuts] + [(t, f"ВСПЫШКА +{d:g} яркости") for t, d in flashes] + \
         [(t, f"звук-удар {db:g} дБ сила {s:g}") for t, db, s in zv if s >= 0.5] + [(x["s"], f"«{x['w']}»") for x in wd]
    ev.sort()
    lines = [f"# Замер {v.name}: {w}×{h}, {vfps:.3g} к/с, {dur:.1f} с",
             f"Склеек {len(cuts)} (в среднем раз в {dur / max(1, len(cuts)):.2f} с), вспышек {len(flashes)}, звуковых ударов (сила ≥0,5 — речь тоже даёт удары, музыкальные и SFX обычно сильнее) "
             f"{sum(1 for x in zv if x[2] >= 0.5)}, слов {len(wd)}. Листы kadry/sNNNN.jpg — секунда NNNN, {fps} кадров.", ""]
    lines += [f"{t:7.3f}  {e}" for t, e in ev]
    (out / "zamer.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"{v.name}: {dur:.1f} с, листов {n}, склеек {len(cuts)}, вспышек {len(flashes)}, ударов {len(zv)}, слов {len(wd)} → {out}")


if __name__ == "__main__":
    main()
