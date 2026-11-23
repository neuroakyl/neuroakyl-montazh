"""Поиск Б-роллов по раскадровке сценария (стиль «Чистый Б-ролл», стили.md).

Читает таблицу «## Раскадровка» из сценарий.md (колонки: № | фраза | раскладка | Б-ролл: что в кадре | запрос),
на каждую строку ищет кандидатов и пишет рядом кадры.md (для глаз) и кадры.json (для скачивания):
  - YouTube: поиск yt-dlp, отбор по длительности и стоп-словам, у лучших — максимальное разрешение (4K вперёд);
  - Pixabay: видео от 1920 px (ключ PIXABAY_KEY в .env), запасной сток без вотермарок.
Ничего не скачивает — только ссылки. Скачать отрезок: broll.py ytcut ID OUT.mp4 --at СЕК --len 4 (или `kadry.py get`).

  python3 -I kadry.py find <папка ролика> [--n 3] [--rows 1-10]
  python3 -I kadry.py get  <папка ролика> [--len 5]       # качает первого кандидата каждой строки в <папка>/кадры/
  python3 -I kadry.py find-all <папка с роликами>          # все подпапки, где есть сценарий.md и ещё нет кадры.json

yt-dlp — переменная YTDLP (свежий, не из .venv на Python 3.9), куки — YT_COOKIES (см. _env.py).
"""
import argparse, json, pathlib, re, subprocess, sys, urllib.parse, urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import _env  # noqa: E402
from broll import BAD  # noqa: E402  стоп-слова: платные стоки с вотермарками, кино, неуместное

YTDLP = _env.ytdlp()
COOKIES = _env.cookies()
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36"
STOP = {"close", "slow", "motion", "footage", "cinematic", "view", "shot", "drone", "aerial", "timelapse", "time", "lapse",
        "macro", "real", "video", "photo", "animation", "with", "from", "into", "over", "under", "high", "large", "giant", "huge"}
BAD_YT = BAD + ("reaction", "compilation of memes", "#shorts", "tiktok", "lyrics", "trailer", "official music video")


def parse_rows(md):
    """Строки таблицы раскадровки: dict(n, fraza, layout, what, query)."""
    text = md.read_text(encoding="utf-8")
    m = re.search(r"^##\s*Раскадровка.*?$(.*?)(?=^##\s|\Z)", text, re.S | re.M)
    if not m:
        sys.exit(f"нет раздела «## Раскадровка» в {md}")
    rows = []
    for line in m.group(1).splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 5 or not re.fullmatch(r"\d+[a-zа-я]?", cells[0]):
            continue
        layout = cells[2].strip("* ").upper()
        if layout.startswith("ЛИЦО"):
            continue  # только аватар — кадр не нужен
        q = re.sub(r"[`\"«»]", "", cells[4]).strip()
        rows.append({"n": len(rows) + 1, "num": cells[0], "fraza": cells[1], "layout": layout, "what": cells[3], "query": q,
                     "donor": cells[5] if len(cells) > 5 else ""})  # 6-я колонка — кадр у донора (таймкод + что)
    return rows


def yt_search(query, n):
    out = subprocess.run([YTDLP, "--flat-playlist", "--no-warnings", "--print",
                          "%(id)s\t%(duration)s\t%(channel)s\t%(title)s", f"ytsearch{n * 4}:{query}"],
                         capture_output=True, text=True, timeout=120).stdout
    res = []
    for line in out.splitlines():
        vid, dur, ch, title = (line.split("\t") + ["", "", ""])[:4]
        try:
            dur = float(dur)
        except ValueError:
            continue
        low = f"{title} {ch}".lower()
        if 8 <= dur <= 1800 and not any(b in low for b in BAD_YT):
            res.append({"id": vid, "dur": round(dur), "channel": ch, "title": title})
    return res[: n * 2]


def yt_heights(ids):
    """Максимальная высота видео для пачки роликов одним вызовом yt-dlp."""
    if not ids:
        return {}
    # без куки: разрешение видно и так, а куки Бобби от частых запросов YouTube режет («Video unavailable»)
    cmd = [YTDLP, "--no-warnings", "--skip-download", "--sleep-requests", "0.5",
           "-f", "bv*", "--print", "%(id)s\t%(height)s\t%(width)s", *[f"https://www.youtube.com/watch?v={i}" for i in ids]]
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=300).stdout
    h = {}
    for line in out.splitlines():
        p = line.split("\t")
        if len(p) == 3 and p[1].isdigit():
            h[p[0]] = (int(p[1]), int(p[2]) if p[2].isdigit() else 0)
    return h


def pix_search(query, n):
    try:
        key = _env.key("PIXABAY_KEY")
    except SystemExit:
        return []
    url = f"https://pixabay.com/api/videos/?key={key}&q={urllib.parse.quote_plus(query[:100])}&safesearch=true&per_page=20"
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30)
        hits = json.loads(r.read()).get("hits", [])
    except Exception as e:  # noqa: BLE001 — сток запасной, падение не должно останавливать поиск
        print("  pixabay:", e, file=sys.stderr)
        return []
    words = {w for w in re.findall(r"[a-z]{4,}", query.lower())} - STOP
    res = []
    for hh in hits:
        if words and not words & set(re.findall(r"[a-z]{4,}", hh.get("tags", "").lower())):
            continue  # Pixabay отдаёт что попало, если точного нет: берём только с общим тегом
        v = hh.get("videos", {})
        c = next((v[k] for k in ("large", "medium") if v.get(k, {}).get("url") and v[k].get("width", 0) >= 1920), None)
        if c:
            res.append({"id": hh["id"], "page": hh.get("pageURL"), "url": c["url"], "w": c["width"], "h": c["height"],
                        "dur": hh.get("duration"), "tags": hh.get("tags", "")})
        if len(res) >= n:
            break
    return res


def simplify(q):
    """Запасной запрос, если точный ничего не дал: без «4k», «drone» и уточнений в скобках."""
    q = re.sub(r"\(.*?\)|/.*$", "", q)
    q = re.sub(r"\b(4k|8k|uhd|hd|close up|slow motion|footage|cinematic)\b", "", q, flags=re.I)
    return " ".join(q.split()[:4])


def find(folder, n, rows_sel=None):
    folder = pathlib.Path(folder)
    rows = parse_rows(folder / "сценарий.md")
    if rows_sel:
        a, b = (int(x) for x in rows_sel.split("-"))
        rows = [r for r in rows if a <= r["n"] <= b]
    old = {}
    jf = folder / "кадры.json"
    if jf.exists():
        old = {r["n"]: r for r in json.loads(jf.read_text())}
    for r in rows:
        o = old.get(r["n"])
        if o and o.get("query") == r["query"] and (any(c.get("h") for c in o.get("yt", [])) or (not o.get("yt") and o.get("pix"))):
            o.update({k: r[k] for k in ("num", "fraza", "layout", "what", "donor")})  # текст поправили — ссылки те же
            continue  # уже найдено по тому же запросу — не ищем заново
        yt = yt_search(r["query"], n) or yt_search(simplify(r["query"]), n)
        hs = yt_heights([c["id"] for c in yt])
        for c in yt:
            c["h"], c["w"] = hs.get(c["id"], (0, 0))
        yt = [c for c in yt if c["h"] >= 1080] or yt  # Full HD и выше; если таких нет — что есть, с пометкой
        yt.sort(key=lambda c: -c["h"])
        r["yt"] = yt[:n]
        r["pix"] = pix_search(r["query"], 2) or pix_search(simplify(r["query"]), 2)
        old[r["n"]] = r
        best = r["yt"][0] if r["yt"] else None
        print(f"{r['n']:>2} {r['query'][:45]:<45} yt:{len(r['yt'])} {best['h'] if best else '-'}p  pix:{len(r['pix'])}", flush=True)
        jf.write_text(json.dumps([old[k] for k in sorted(old)], ensure_ascii=False, indent=1))
    if not rows_sel:  # раскадровку переписали короче — старые лишние строки убрать
        keep = {r["n"] for r in parse_rows(folder / "сценарий.md")}
        old = {k: v for k, v in old.items() if k in keep}
        jf.write_text(json.dumps([old[k] for k in sorted(old)], ensure_ascii=False, indent=1))
    write_md(folder, [old[k] for k in sorted(old)])


def write_md(folder, rows):
    L = [f"# Кадры — {folder.name}", "",
         "Кандидаты на каждую строку раскадровки. Ссылки YouTube — с разрешением (2160p = 4K). Отрезок берём 3–5 с, без логотипов и текста;",
         "если у кандидата вотермарка или чужие субтитры — следующий. Pixabay — запасной, свободная лицензия.", "",
         "| № | фраза | раскладка | кадр у донора | что нужно · запрос | YouTube | Pixabay |", "|---|---|---|---|---|---|---|"]
    for r in rows:
        yt = "<br>".join(f"[{c['h'] or '?'}p · {c['dur']} с · {c['title'][:50].replace('|', '/')}](https://youtu.be/{c['id']})"
                         for c in r.get("yt", [])) or "—"
        px = "<br>".join(f"[{p['w']}×{p['h']} · {p['tags'][:30]}]({p['page']})" for p in r.get("pix", [])) or "—"
        cut = lambda x, n: (x or "—")[:n].replace("|", "/")
        L.append(f"| {r.get('num', r['n'])} | {cut(r.get('fraza'), 60)} | {r['layout']} | {cut(r.get('donor'), 90)} | "
                 f"{cut(r['what'], 90)} · `{r['query']}` | {yt} | {px} |")
    (folder / "кадры.md").write_text("\n".join(L) + "\n", encoding="utf-8")
    print("записано:", folder / "кадры.md")


def get(folder, length):
    """Первый кандидат каждой строки → кадры/NN.mp4 (YouTube — отрезок из середины, Pixabay — целиком)."""
    folder = pathlib.Path(folder)
    rows = json.loads((folder / "кадры.json").read_text())
    out = folder / "кадры"
    out.mkdir(exist_ok=True)
    for r in rows:
        f = out / f"{r['n']:02d}.mp4"
        if f.exists():
            continue
        if r.get("yt"):
            c = r["yt"][0]
            at = max(5, int(c["dur"] * 0.4))
            subprocess.run([YTDLP, "-q", "--no-warnings", *(["--cookies", COOKIES] if COOKIES else []),
                            "-f", "bv*[height<=2160][ext=mp4]/bv*[height<=2160]", "--download-sections", f"*{at}-{at + length}",
                            "-o", str(f), f"https://www.youtube.com/watch?v={c['id']}"], timeout=600)
        elif r.get("pix"):
            urllib.request.urlretrieve(r["pix"][0]["url"], f)
        print(r["n"], "ok" if f.exists() else "нет")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["find", "get", "find-all"])
    ap.add_argument("folder")
    ap.add_argument("--n", type=int, default=3)
    ap.add_argument("--rows")
    ap.add_argument("--len", type=int, default=5)
    a = ap.parse_args()
    if a.cmd == "find":
        find(a.folder, a.n, a.rows)
    elif a.cmd == "get":
        get(a.folder, a.len)
    else:
        for d in sorted(pathlib.Path(a.folder).iterdir()):
            if (d / "сценарий.md").exists() and not (d / "кадры.json").exists():
                print("==", d.name, flush=True)
                find(d, a.n)


if __name__ == "__main__":
    main()
