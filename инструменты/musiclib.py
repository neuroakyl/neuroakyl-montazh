"""Библиотека музыки: Mixkit (Mixkit Stock Music Free License — коммерция можно, без указания автора).

  python3 -I musiclib.py fetch tag/technology discover/synthwave ...   страницы Mixkit → каталог + mp3
  python3 -I musiclib.py audition ВЫХОД.mp3 [--cat X]                 склейка по 12 с из середины каждого трека + карта «№ → секунда»
"""
import json, pathlib, re, subprocess, sys, time, urllib.request

import sys; sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent)); import _env
ROOT = _env.lib() / "музыка"
CAT = ROOT / "каталог.json"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36"


def get(url, pause=True):
    if pause:
        time.sleep(4)
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60) as r:
        return r.read()


def iso(d):
    m = re.match(r"PT(?:(\d+)M)?(?:(\d+)S)?", d or "")
    return int(m.group(1) or 0) * 60 + int(m.group(2) or 0) if m else 0


def fetch(pages):
    ROOT.mkdir(parents=True, exist_ok=True)
    cat = json.loads(CAT.read_text()) if CAT.exists() else {}
    for pg in pages:
        try:
            html = get(f"https://mixkit.co/free-stock-music/{pg}/").decode("utf-8", "ignore")
        except Exception as e:
            print("#", pg, e); continue
        n = 0
        for m in re.finditer(r'\{"@id":"([^"]+)","@type":"MusicRecording","name":"([^"]+)","genre":"([^"]*)","byArtist":"([^"]*)","duration":"([^"]+)","url":"(https://assets\.mixkit\.co/music/(\d+)/\d+\.mp3)"', html):
            _, name, genre, artist, dur, url, mid = m.groups()
            if mid in cat:
                continue
            f = ROOT / f"{mid}-{re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')}.mp3"
            try:
                f.write_bytes(get(url, pause=False))
            except Exception as e:
                print("#", mid, e); continue
            cat[mid] = {"name": name, "genre": genre, "artist": artist, "len": iso(dur), "page": pg, "file": f.name}
            n += 1
        CAT.write_text(json.dumps(cat, ensure_ascii=False, indent=1))
        print(pg, "+", n, "всего", len(cat))


def audition(out, only=None):
    cat = json.loads(CAT.read_text())
    items = [(k, v) for k, v in cat.items() if not only or v["page"] == only or v["genre"] == only]
    parts, mapping, t = [], [], 0.0
    tmpd = pathlib.Path(out).parent / "_aud"; tmpd.mkdir(exist_ok=True)
    for i, (k, v) in enumerate(items, 1):
        st = max(0, v["len"] * 0.35)
        p = tmpd / f"{i:03d}.wav"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(st), "-t", "12", "-i", str(ROOT / v["file"]), "-af",
                        "afade=t=in:d=0.3,afade=t=out:st=11.4:d=0.6,apad=whole_dur=13", "-ar", "44100", "-ac", "2", str(p)], check=True)
        parts.append(p); mapping.append({"n": i, "id": k, "start": t, "name": v["name"], "genre": v["genre"]}); t += 13
    lst = tmpd / "list.txt"; lst.write_text("".join(f"file '{p}'\n" for p in parts))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c:a", "libmp3lame", "-b:a", "96k", out], check=True)
    for p in parts: p.unlink()
    lst.unlink(); tmpd.rmdir()
    pathlib.Path(out).with_suffix(".json").write_text(json.dumps(mapping, ensure_ascii=False, indent=1))
    print(out, len(mapping), f"{t/60:.1f} мин")


if __name__ == "__main__":
    cmd, *rest = sys.argv[1:]
    if cmd == "fetch":
        fetch(rest)
    else:
        only = rest[rest.index("--cat") + 1] if "--cat" in rest else None
        audition(rest[0], only)
