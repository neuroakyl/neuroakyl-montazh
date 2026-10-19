"""Библиотека звуков для монтажа: сбор с Mixkit, выравнивание громкости, каталог.

  python3 -I sfxlib.py fetch whoosh click pop ...   скачать категории Mixkit (лицензия Mixkit Free: коммерция можно)
  python3 -I sfxlib.py norm                          обрезать тишину в начале, выровнять громкость, wav 48 кГц
  python3 -I sfxlib.py sheet                         каталог.md: id, категория, название, длина, «характер» по замерам

Громкость: у каждого звука пик кратковременной громкости (momentary, 400 мс) приводится к −16 LUFS,
истинный пик не выше −1 дБ. Тогда «volume» в монтаже значит одно и то же для любого звука.
Голос после выравнивания ≈ −14 LUFS, значит SFX с volume 0.4 (−8 дБ) сидит под голосом.
"""
import json, pathlib, re, subprocess, sys, time, urllib.request

import sys; sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent)); import _env
ROOT = _env.lib() / "звуки"
CAT = ROOT / "каталог.json"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36"
TARGET_M = -16.0


def fetch_url(url, pause=True):
    if pause:
        time.sleep(4)  # страницы mixkit режут частые запросы (429); сервер файлов — нет
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def load():
    return json.loads(CAT.read_text()) if CAT.exists() else {}


def save(cat):
    CAT.write_text(json.dumps(cat, ensure_ascii=False, indent=1))


def parse(html):
    out = []
    parts = html.split('data-audio-player-item-id-value="')[1:]
    for p in parts:
        sid = p[: p.index('"')]
        t = re.search(r'item-grid-card__title[^>]*>\s*([^<]{2,80})', p[:5000])
        d = re.search(r'data-test-id="duration">\s*([0-9:]+)', p[:8000])
        out.append((sid, t.group(1).strip() if t else sid, d.group(1) if d else ""))
    return out


def fetch(cats):
    ROOT.mkdir(parents=True, exist_ok=True)
    cat = load()
    for c in cats:
        for page in ("", "?page=2"):
            try:
                html = fetch_url(f"https://mixkit.co/free-sound-effects/{c}/{page}").decode("utf-8", "ignore")
            except Exception as e:
                print(f"# {c}{page}: {e}")
                break
            for sid, title, dur in parse(html):
                if sid in cat:
                    continue
                slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:40]
                d = ROOT / c
                d.mkdir(exist_ok=True)
                f = d / f"{sid}-{slug}.mp3"
                try:
                    f.write_bytes(fetch_url(f"https://assets.mixkit.co/active_storage/sfx/{sid}/{sid}-preview.mp3", pause=False))
                except Exception as e:
                    print(f"# {sid}: {e}")
                    continue
                cat[sid] = {"cat": c, "title": title, "dur": dur, "src": "mixkit", "file": str(f.relative_to(ROOT))}
                save(cat)
            print(c, page or "p1", sum(1 for v in cat.values() if v["cat"] == c))


def measure(f):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(f), "-af", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True).stderr
    ms = [float(x) for x in re.findall(r"M:\s*(-?[0-9.]+)", r)]
    return max(ms) if ms else -70.0


def stats(f):
    """длина, «яркость» (доля энергии выше 3 кГц), атака (мс до пика)"""
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)],
                               capture_output=True, text=True).stdout.strip() or 0)
    def rms(af):
        r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(f), "-af", f"{af}astats=metadata=0:measure_overall=RMS_level",
                            "-f", "null", "-"], capture_output=True, text=True).stderr
        m = re.findall(r"RMS level dB:\s*(-?[0-9.inf]+)", r)
        try:
            return float(m[-1])
        except Exception:
            return -90.0
    full, hi, lo = rms(""), rms("highpass=f=3000,"), rms("lowpass=f=150,")
    return dur, round(hi - full, 1), round(lo - full, 1)


def norm():
    cat = load()
    for sid, v in cat.items():
        src = ROOT / v["file"]
        if src.suffix == ".wav" and v.get("norm"):
            continue
        dst = src.with_suffix(".wav")
        tmp = src.with_suffix(".trim.wav")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-af",
                        "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.005,afade=t=out:st=0:d=0",
                        "-ar", "48000", "-ac", "2", str(tmp)], check=True)
        m = measure(tmp)
        gain = TARGET_M - m
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(tmp), "-af",
                        f"volume={gain:.2f}dB,alimiter=limit=0.89:level=false", "-ar", "48000", str(dst)], check=True)
        tmp.unlink()
        if src != dst:
            src.unlink()
        dur, bright, low = stats(dst)
        v.update(file=str(dst.relative_to(ROOT)), norm=True, gain_db=round(gain, 1), len=round(dur, 2), bright=bright, low=low)
        save(cat)
    print("норм:", len(cat))


def sheet():
    cat = load()
    rows = ["| id | категория | название | длина, с | яркость | низ |", "|---|---|---|---|---|---|"]
    for sid, v in sorted(cat.items(), key=lambda x: (x[1]["cat"], x[1].get("len", 0))):
        rows.append(f"| {sid} | {v['cat']} | {v['title']} | {v.get('len', '')} | {v.get('bright', '')} | {v.get('low', '')} |")
    (ROOT / "каталог.md").write_text("# Каталог звуков\n\nЯркость/низ — дБ энергии выше 3 кГц / ниже 150 Гц относительно всего звука "
                                     "(ближе к 0 — сильнее). Все звуки выровнены: пик −16 LUFS (momentary).\n\n" + "\n".join(rows) + "\n")
    print(len(cat))


if __name__ == "__main__":
    cmd, *rest = sys.argv[1:]
    {"fetch": lambda: fetch(rest), "norm": norm, "sheet": sheet}[cmd]()
