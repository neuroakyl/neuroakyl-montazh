"""Б-роллы с YouTube и Pinterest: поиск, скачивание отрезка, лист превью для выбора.

  python3 -I broll.py yt "autophagy animation" OUT_DIR [-n 4] [--len 6]
      ищет на YouTube, у каждого кандидата качает отрезок --len с из середины ролика
  python3 -I broll.py ytcut VIDEO_ID OUT.mp4 --at 63 --len 5
      точный отрезок из конкретного ролика
  python3 -I broll.py pin "empty plate" OUT_DIR [-n 4]
      ищет пины-видео через DuckDuckGo и качает их целиком (они короткие)
  python3 -I broll.py sheet OUT_DIR
      лист превью: по 3 кадра с каждого клипа, строка N = N-й файл из списка

YouTube часто требует куки (бот-блок): путь к экспорту cookies.txt — YT_COOKIES в .env (необязательно).
Каждый скачанный клип пишется в OUT_DIR/sources.json: откуда, какой отрезок.
"""
import argparse, json, pathlib, re, subprocess, sys, urllib.parse, urllib.request

import sys; sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent)); import _env
YTDLP = _env.ytdlp()
COOKIES = _env.cookies()
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36"


def log_source(out_dir, name, info):
    p = pathlib.Path(out_dir) / "sources.json"
    data = json.loads(p.read_text()) if p.exists() else {}
    data[name] = info
    p.write_text(json.dumps(data, ensure_ascii=False, indent=1))


# в названиях платных стоков почти всегда вотермарка — такие не берём
BAD = ("shutterstock", "storyblocks", "pond5", "envato", "istock", "getty", "preview", "watermark", "adobe stock",
       "artgrid", "motion array", "videohive", "dreamstime", "depositphotos", "123rf", "alamy", "microstock",
       # неприемлемо для аудитории клиента (правило Боба): йога/фитнес с девушками, откровенное, мультики, кино
       "yoga", "pilates", "bikini", "sexy", "hot ", "babes", "workout", "fitness girl", "cartoon", "movieclips", "scene (")


def height(f):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=height", "-of", "csv=p=0", str(f)],
                       capture_output=True, text=True).stdout.strip()
    return int(r or 0)


def yt_search(query, n, max_dur=1200):
    out = subprocess.run([YTDLP, "--flat-playlist", "--no-warnings", "--print",
                          "%(id)s\t%(duration)s\t%(title)s", f"ytsearch{n * 3}:{query}"],
                         capture_output=True, text=True).stdout
    res = []
    for line in out.splitlines():
        vid, dur, title = (line.split("\t") + ["", ""])[:3]
        try:
            dur = float(dur)
        except ValueError:
            continue
        if 15 <= dur <= max_dur and not any(b in title.lower() for b in BAD):
            res.append((vid, dur, title))
    return res[:n]


def yt_cut(vid, out, at, length):
    out = pathlib.Path(out)
    tmp = out.with_suffix(".src.mp4")
    r = subprocess.run([YTDLP, "-q", "--no-warnings", *(["--cookies", COOKIES] if COOKIES else []),
                        # лучшее по разрешению до 1080p в любом контейнере (mp4-фильтр отдавал 240p)
                        "-f", "bv*/b", "-S", "res:1080",
                        "--download-sections", f"*{at:.1f}-{at + length:.1f}",
                        "--force-keyframes-at-cuts", "-o", str(tmp),
                        f"https://www.youtube.com/watch?v={vid}"], capture_output=True, text=True)
    if not tmp.exists():
        print(f"  ! {vid}: {r.stderr.strip()[-200:]}", file=sys.stderr)
        return False
    # только видео, без звука; ровный кадр 25 fps — Remotion так быстрее
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(tmp), "-an", "-r", "25",
                    "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-pix_fmt", "yuv420p",
                    str(out)])
    tmp.unlink(missing_ok=True)
    return out.exists()


def pin_search(query, n):
    url = "https://html.duckduckgo.com/html/?q=" + urllib.parse.quote(f"site:pinterest.com/pin {query} video")
    html = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30).read().decode()
    ids = []
    for m in re.findall(r"pinterest\.[a-z.]+/pin/(\d{6,})", html):
        if m not in ids:
            ids.append(m)
    return ids[: n * 2]


def pin_get(pin_id, out):
    tmp = pathlib.Path(out).with_suffix(".src.mp4")
    subprocess.run([YTDLP, "-q", "--no-warnings", "-o", str(tmp),
                    f"https://www.pinterest.com/pin/{pin_id}/"], capture_output=True)
    if not tmp.exists():
        return False
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(tmp), "-an", "-r", "25", "-c:v", "libx264",
                    "-crf", "18", "-preset", "veryfast", "-pix_fmt", "yuv420p", str(out)])
    tmp.unlink(missing_ok=True)
    return pathlib.Path(out).exists()


def duration(f):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)],
                       capture_output=True, text=True).stdout.strip()
    return float(r or 0)


def sheet(out_dir):
    d = pathlib.Path(out_dir)
    clips = sorted(p for p in d.glob("*.mp4") if not p.name.endswith(".src.mp4"))
    rows = []
    for c in clips:
        dur = duration(c)
        tiles = []
        for k, frac in enumerate((0.15, 0.5, 0.85)):
            t = d / f".t_{c.stem}_{k}.jpg"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{dur * frac:.2f}", "-i", str(c), "-frames:v", "1",
                            "-vf", "scale=320:320:force_original_aspect_ratio=decrease,pad=320:320:(ow-iw)/2:(oh-ih)/2",
                            str(t)])
            tiles.append(t)
        row = d / f".row_{c.stem}.jpg"
        # в homebrew-ffmpeg нет drawtext: подписей на листе нет, порядок строк печатаем списком
        subprocess.run(["ffmpeg", "-v", "error", "-y", *sum([["-i", str(t)] for t in tiles], []), "-filter_complex",
                        "hstack=3", str(row)])
        rows.append(row)
        for t in tiles:
            t.unlink(missing_ok=True)
    if not rows:
        sys.exit("нет клипов")
    out = d / "_sheet.jpg"
    subprocess.run(["ffmpeg", "-v", "error", "-y", *sum([["-i", str(r)] for r in rows], []), "-filter_complex",
                    f"vstack={len(rows)}" if len(rows) > 1 else "null", str(out)])
    for r in rows:
        r.unlink(missing_ok=True)
    for i, c in enumerate(clips, 1):
        print(f"{i}. {c.name}")
    print(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["yt", "ytcut", "pin", "sheet"])
    ap.add_argument("a"); ap.add_argument("b", nargs="?")
    ap.add_argument("-n", type=int, default=4)
    ap.add_argument("--len", type=float, default=6)
    ap.add_argument("--at", type=float, default=0)
    a = ap.parse_args()
    if a.cmd == "sheet":
        return sheet(a.a)
    if a.cmd == "ytcut":
        ok = yt_cut(a.a, a.b, a.at, a.len)
        if ok:
            log_source(pathlib.Path(a.b).parent, pathlib.Path(a.b).name,
                       {"src": f"https://www.youtube.com/watch?v={a.a}", "at": a.at, "len": a.len})
        return print("ok" if ok else "fail")
    out_dir = pathlib.Path(a.b)
    out_dir.mkdir(parents=True, exist_ok=True)
    slug = re.sub(r"\W+", "-", a.a.lower()).strip("-")[:30]
    if a.cmd == "yt":
        for i, (vid, dur, title) in enumerate(yt_search(a.a, a.n)):
            at = max(2.0, dur * 0.35)
            name = f"yt-{slug}-{i}.mp4"
            if yt_cut(vid, out_dir / name, at, a.len) and height(out_dir / name) < 720:
                (out_dir / name).unlink()  # мыло в карточку не берём
                print(f"  - {vid}: ниже 720p, пропуск")
                continue
            if (out_dir / name).exists():
                log_source(out_dir, name, {"src": f"https://www.youtube.com/watch?v={vid}", "title": title,
                                           "at": round(at, 1), "len": a.len})
                print(f"{name}\t{vid}\t{title[:70]}")
    else:
        got = 0
        for pid in pin_search(a.a, a.n):
            name = f"pin-{slug}-{got}.mp4"
            if pin_get(pid, out_dir / name):
                log_source(out_dir, name, {"src": f"https://www.pinterest.com/pin/{pid}/"})
                print(f"{name}\t{pid}\t{duration(out_dir / name):.1f}s")
                got += 1
            if got >= a.n:
                break


if __name__ == "__main__":
    main()
