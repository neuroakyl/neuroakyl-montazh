"""Обложка ролика: стиль аккаунта, вырезанные человек и предметы, эмодзи, сборка и проверка. Правила — SKILL.md §«Обложка».

  python3 -I oblozhka.py stil                         показать стиль аккаунта (обложка-бренд.json в корне навыка)
  python3 -I oblozhka.py stil --accent "#FFD400" [--font montserrat|fira|oswald] [--plate|--text-accent] [--outline 0]
                                                      записать стиль; один раз на аккаунт, дальше одинаков во всей ленте
  python3 -I oblozhka.py obrazcy [ДВИЖОК] [--dizainy "жёлтый/montserrat/plate;#E30613/fira/text"]
                                                      первая обложка в 3–4 дизайнах (цвет/шрифт/акцент) → человек выбирает → stil
  python3 -I oblozhka.py kadry ВИДЕО [-n 8]           кадры с лицом в паузах речи (words.json рядом) → лист, выбрать номер
  python3 -I oblozhka.py vyrezat ВХОД [ВЫХОД.png]     вырезать человека или предмет: картинка, ссылка или видео@секунда
  python3 -I oblozhka.py iskat "Mi-8 helicopter" [-n 8]  картинки по теме (Wikimedia Commons, крупные) → лист, выбрать номер
  python3 -I oblozhka.py emoji fire "money bag" 😱     крупные 3D-эмодзи (Microsoft Fluent, MIT) в public/cover/
  python3 -I oblozhka.py sdelat [ДВИЖОК] [--wide] [--varianty]
                                                      собрать обложку из src/cover.json → ../cover.jpg + проверка

Запуск из папки движка ролика (там src/ и public/) или с путём к ней. Картинки ложатся в public/cover/.
"""
import argparse, difflib, json, pathlib, platform, shutil, subprocess, sys, tempfile, unicodedata, urllib.parse, urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import _env

HERE = pathlib.Path(__file__).resolve().parent
BRAND = _env.ROOT / "обложка-бренд.json"  # стиль аккаунта, в Git не идёт (у каждого свой)
BIN = HERE / ".vyrezat-bin"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36"
# Готовые стили: главный цвет + чёрный + белый. Акцент проверяется на контраст при сборке.
PRESETS = {"жёлтый": "#FFD400", "красный": "#FF2D2D", "оранжевый": "#FF7A00", "лайм": "#C8FF00"}
# Дизайны для первого выбора, если человек не назвал свои: разные цвет, шрифт и подача акцента
DESIGNS = "жёлтый/montserrat/plate;красный/fira/plate;оранжевый/montserrat/text;лайм/fira/text"


def get(url, out=None):
    r = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60).read()
    if out:
        pathlib.Path(out).write_bytes(r)
    return r


def ff(*a):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *map(str, a)], check=True)


def engine(p=None):
    d = pathlib.Path(p or ".").resolve()
    if not (d / "src" / "Cover.tsx").exists():
        raise SystemExit(f"{d}: это не папка движка ролика (нет src/Cover.tsx)")
    return d


def work():
    """Рабочие материалы обложки (кадры, поиск, проверка) — в папке ролика рядом с движком: <ролик>/обложка/."""
    d = pathlib.Path(".").resolve()
    return (d.parent if (d / "public").exists() else d) / "обложка"


def cover_dir(p=None):
    d = pathlib.Path(p).resolve() if p else pathlib.Path(".").resolve()
    d = d / "public" / "cover" if (d / "public").exists() else d
    d.mkdir(parents=True, exist_ok=True)
    return d


# ── стиль аккаунта ────────────────────────────────────────────────────────────
def stil(a):
    b = json.loads(BRAND.read_text()) if BRAND.exists() else json.loads((_env.ROOT / "обложка-бренд.example.json").read_text())
    changed = False
    if a.accent:
        b["accent"] = PRESETS.get(a.accent, a.accent).upper(); changed = True
    for k in ("font", "outline", "dark", "light"):
        if getattr(a, k) is not None:
            b[k] = getattr(a, k); changed = True
    if a.plate or a.text_accent:
        b["accentStyle"] = "plate" if a.plate else "text"; changed = True
    if changed:
        BRAND.write_text(json.dumps(b, ensure_ascii=False, indent=2) + "\n")
        print("записал", BRAND)
    elif not BRAND.exists():
        print("стиль аккаунта ещё не выбран — спроси человека (SKILL.md §«Обложка»), образец:")
    print(json.dumps(b, ensure_ascii=False, indent=2))


def brand_to(eng):
    if not BRAND.exists():
        raise SystemExit(f"нет стиля обложек {BRAND.name}: есть брендбук — возьми цвет и шрифт оттуда; нет — спроси, какой дизайн хочется, "
                         "и покажи первую обложку в нескольких дизайнах (obrazcy); выбранный запиши: oblozhka.py stil … (обложка.md §0)")
    shutil.copy(BRAND, eng / "src" / "cover" / "brand.json")


# ── сборка ────────────────────────────────────────────────────────────────────
def render(eng, jobs):
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(jobs, f, ensure_ascii=False)
    if subprocess.run(["node", "cover.mjs", f.name], cwd=eng).returncode:
        raise SystemExit("обложка не собралась — причина в строке ОБЛОЖКА выше")


def sheet(files, out, w=360, cols=None, h=None):
    """Лист картинок: номер = порядок слева направо, сверху вниз (1, 2, 3 …). В ffmpeg бывает без drawtext — цифр на листе нет."""
    files = [pathlib.Path(x) for x in files]
    cols = cols or min(len(files), 4)
    h = h or w * 16 // 9
    rows = -(-len(files) // cols)
    ins, flt = [], []
    for i, f in enumerate(files):
        ins += ["-i", f]
        flt.append(f"[{i}]scale={w - 8}:{h - 8}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=0x202020[v{i}]")
    for i in range(len(files), rows * cols):
        flt.append(f"color=0x101010:s={w}x{h}:d=1[v{i}]")
    lay = "|".join(f"{(i % cols) * w}_{(i // cols) * h}" for i in range(rows * cols))
    stack = "".join(f"[v{i}]" for i in range(rows * cols))
    flt.append(f"{stack}xstack=inputs={rows * cols}:layout={lay}[o]" if rows * cols > 1 else f"{stack}null[o]")
    ff(*ins, "-filter_complex", ";".join(flt), "-map", "[o]", "-frames:v", "1", "-update", "1", out)
    return out


def check(cover, eng):
    """Проверка глазами: как обложка видна в ленте. мелко.jpg — размер превью на телефоне; лента.jpg — сетка профиля
    (центр 3:4, как режет Instagram) с прошлыми обложками из соседних папок роликов: новая — первая."""
    d = eng.parent / "обложка"
    d.mkdir(exist_ok=True)
    ff("-i", cover, "-vf", "scale=180:320", "-update", "1", d / "мелко.jpg")
    prev = sorted((p for p in eng.parent.parent.glob("*/cover.jpg") if p.resolve() != pathlib.Path(cover).resolve()),
                  key=lambda p: p.stat().st_mtime, reverse=True)[:5]
    tiles = []
    for i, f in enumerate([cover, *prev]):
        t = d / f".tile{i}.jpg"
        ff("-i", f, "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1440:0:(ih-1440)/2,scale=240:320", "-update", "1", t)
        tiles.append(t)
    sheet(tiles, d / "лента.jpg", w=240, h=320, cols=3)
    for t in tiles:
        t.unlink()
    print("проверка:", d / "мелко.jpg", d / "лента.jpg")


def vision():
    s = HERE / "vyrezat.swift"
    if not BIN.exists() or BIN.stat().st_mtime < s.stat().st_mtime:
        subprocess.run(["swiftc", "-O", "-suppress-warnings", str(s), "-o", str(BIN)], check=True)
    return str(BIN)


def face(png):
    if platform.system() != "Darwin" or not png.exists():
        return {}
    r = json.loads(subprocess.run([vision(), "--face", str(png)], capture_output=True, text=True).stdout or "{}")
    return {"personFace": r["face"], "personSize": [r["w"], r["h"]]} if r.get("face") else {}


def sdelat(a):
    eng = engine(a.dvizhok)
    brand_to(eng)
    data = json.loads((eng / "src" / "cover.json").read_text())
    if data.get("заполнить"):
        raise SystemExit("src/cover.json не заполнен: текст, раскладка и картинки — по SKILL.md §«Обложка»")
    out = eng.parent / "cover.jpg"
    jobs = [{"out": str(out), "comp": "Cover", "props": {}}]
    if a.wide:
        jobs.append({"out": str(eng.parent / "cover-wide.jpg"), "comp": "CoverWide", "props": {}})
    var = data.get("варианты") or []
    if a.varianty and not var:
        raise SystemExit("варианты: впиши в cover.json \"варианты\": [{правки}, …] — другой текст, раскладка, фон, элементы")
    vd = eng.parent / "обложка"
    if a.varianty:
        for i, v in enumerate(var, 1):
            jobs.append({"out": str(vd / f"вариант-{i}.jpg"), "comp": "Cover", "props": v})
    for j in jobs:  # рамка лица на вырезке: движок сам ставит лицо крупно и в одно место
        person = j["props"].get("person", data.get("person"))
        if person and "personFace" not in j["props"] and "personFace" not in data:
            j["props"].update(face(eng / "public" / person))
    render(eng, jobs)
    check(out, eng)
    if a.varianty:
        print("лист вариантов:", sheet([out, *(vd / f"вариант-{i}.jpg" for i in range(1, len(var) + 1))], vd / "варианты.jpg"))
    print("обложка:", out)


def obrazcy(a):
    """Выбор дизайна ленты: та же обложка в нескольких дизайнах. Только при первом ролике или когда человек просит сменить дизайн."""
    eng = engine(a.dvizhok)
    base = json.loads((BRAND if BRAND.exists() else _env.ROOT / "обложка-бренд.example.json").read_text())
    dst = eng / "src" / "cover" / "brand.json"
    keep = dst.read_text()
    vd = eng.parent / "обложка"
    outs, legend = [], []
    try:
        for i, d in enumerate(a.dizainy.split(";"), 1):
            color, font, style = (d.split("/") + ["montserrat", "plate"])[:3]
            b = dict(base, accent=PRESETS.get(color, color).upper(), font=font, accentStyle=style)
            dst.write_text(json.dumps(b))
            o = vd / f"дизайн-{i}.jpg"
            render(eng, [{"out": str(o), "comp": "Cover", "props": {}}])
            outs.append(o)
            legend.append(f"{i}: oblozhka.py stil --accent \"{b['accent']}\" --font {font} {'--plate' if style == 'plate' else '--text-accent'}")
    finally:
        dst.write_text(keep)
    print("дизайны:", sheet(outs, vd / "дизайны.jpg"))
    print("\n".join(legend))


# ── материалы ─────────────────────────────────────────────────────────────────
def vyrezat(a):
    src = a.vhod
    tmp = pathlib.Path(tempfile.mkdtemp())
    if src.startswith("http"):
        f = tmp / ("in" + (pathlib.Path(urllib.parse.urlparse(src).path).suffix or ".jpg"))
        get(src, f)
    elif "@" in src and pathlib.Path(src.rsplit("@", 1)[0]).exists():
        v, t = src.rsplit("@", 1)
        f = tmp / "in.png"
        ff("-ss", t, "-i", v, "-frames:v", "1", f)
    else:
        f = pathlib.Path(src)
    if f.suffix.lower() in (".webp", ".avif", ".gif"):  # Vision и rembg надёжнее с PNG
        ff("-i", f, tmp / "in.png"); f = tmp / "in.png"
    stem = pathlib.Path(urllib.parse.urlparse(src).path).stem if src.startswith("http") else pathlib.Path(src.split("@")[0]).stem
    out = pathlib.Path(a.vyhod) if a.vyhod else cover_dir() / f"{stem or 'cut'}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    if platform.system() == "Darwin":
        r = subprocess.run([vision(), str(f), str(out)], capture_output=True, text=True)
        if r.returncode:
            raise SystemExit(f"не вырезалось: {r.stdout.strip() or r.stderr.strip()}")
        print(r.stdout.strip())
    else:
        try:
            from rembg import remove  # Windows/Linux: pip install "rembg[cpu]" в .venv навыка
        except ImportError:
            raise SystemExit('вырезание на Windows: python -m pip install "rembg[cpu]" (бесплатно, модель скачается сама)')
        out.write_bytes(remove(f.read_bytes()))
    print("вырезано:", out)


def kadry(a):
    """Кадры для обложки с человеком: середины пауз речи (рот закрыт, глаза открыты чаще всего), равномерно по ролику."""
    v = pathlib.Path(a.video)
    words = next((p for p in (v.parent / "words.json", v.parent.parent / "src" / "words.json", pathlib.Path("src/words.json")) if p.exists()), None)
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", v], capture_output=True, text=True).stdout)
    ts = []
    if words:
        w = json.loads(words.read_text())
        ts = [(x["end"] + y["start"]) / 2 for x, y in zip(w, w[1:]) if y["start"] - x["end"] >= 0.12 and x["end"] < dur - 0.5]
    if len(ts) < a.n:
        ts = [dur * (i + 0.5) / a.n for i in range(a.n)]
    step = len(ts) / a.n
    ts = [ts[int(i * step)] for i in range(a.n)]
    d = work() / "кадры"
    d.mkdir(parents=True, exist_ok=True)
    outs = []
    for i, t in enumerate(ts, 1):
        o = d / f"k{i:02d}.png"
        ff("-ss", f"{t:.2f}", "-i", v, "-frames:v", "1", o)
        outs.append(o)
    (d / "время.json").write_text(json.dumps({f"k{i:02d}": round(t, 2) for i, t in enumerate(ts, 1)}, indent=1))
    print("лист:", sheet(outs, d / "лист.jpg", w=300))
    print(f"выбрал номер N → oblozhka.py vyrezat {d}/kNN.png")


def iskat(a):
    api = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
        "action": "query", "generator": "search", "gsrsearch": a.zapros + " filetype:bitmap", "gsrnamespace": 6, "gsrlimit": a.n * 2,
        "prop": "imageinfo", "iiprop": "url|size", "iiurlwidth": 1600, "format": "json"})
    pages = sorted(json.loads(get(api)).get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 0))
    d = work() / "поиск"
    d.mkdir(parents=True, exist_ok=True)
    outs, src = [], {}
    for p in pages:
        ii = (p.get("imageinfo") or [{}])[0]
        if ii.get("width", 0) < 900 or not ii.get("thumburl"):
            continue
        o = d / f"p{len(outs) + 1:02d}.jpg"
        try:
            get(ii["thumburl"], o)
        except Exception:
            continue
        outs.append(o); src[o.stem] = {"файл": p["title"], "url": ii.get("descriptionurl")}
        if len(outs) == a.n:
            break
    if not outs:
        raise SystemExit("ничего крупного не нашлось: попробуй по-английски или дай ссылку на картинку в vyrezat")
    (d / "источники.json").write_text(json.dumps(src, ensure_ascii=False, indent=1))
    print("лист:", sheet(outs, d / "лист.jpg", w=320, h=320))
    print(f"выбрал номер N → oblozhka.py vyrezat {d}/pNN.jpg  (фоном — просто путь в bg)")


def emoji(a):
    idx = _env.lib() / "fluent-emoji.json"
    if not idx.exists():
        tree = json.loads(get("https://api.github.com/repos/microsoft/fluentui-emoji/git/trees/main?recursive=1"))["tree"]
        m = {}
        for t in tree:
            p = t["path"].split("/")
            if len(p) >= 4 and p[0] == "assets" and p[-1].endswith((".png", ".svg")):
                kind = "3d" if p[-2] == "3D" else "flat" if p[-2] == "Color" else None
                if kind and (len(p) == 4 or p[2] == "Default"):
                    m.setdefault(p[1].lower(), {})[kind] = t["path"]
        idx.parent.mkdir(parents=True, exist_ok=True)
        idx.write_text(json.dumps(m, ensure_ascii=False))
    m = json.loads(idx.read_text())
    out = cover_dir()
    for q in a.imena:
        name = q.lower()
        if any(ord(c) > 0x2000 for c in q):  # эмодзи-символ → его имя в Unicode
            name = " ".join(unicodedata.name(c, "") for c in q if unicodedata.name(c, "") and "SELECTOR" not in unicodedata.name(c, "")).lower()
        key = name if name in m else next(iter(difflib.get_close_matches(name, m.keys(), 1, 0.75)), None)
        if not key:
            print(f"нет «{q}»: похожие — {', '.join(difflib.get_close_matches(name, m.keys(), 6, 0.4)) or 'нет'} (имена английские, как в Emojipedia)")
            continue
        kind = "flat" if a.flat else "3d"
        path = m[key].get(kind) or next(iter(m[key].values()))
        f = out / f"e-{key.replace(' ', '-')}{pathlib.Path(path).suffix}"
        get("https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/" + urllib.parse.quote(path), f)
        print(f"{q} → {f.relative_to(f.parents[1]) if 'public' in f.parts else f}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest="cmd", required=True)
    s = sp.add_parser("stil"); s.add_argument("--accent"); s.add_argument("--font"); s.add_argument("--outline", type=int)
    s.add_argument("--dark"); s.add_argument("--light"); s.add_argument("--plate", action="store_true"); s.add_argument("--text-accent", action="store_true")
    s = sp.add_parser("obrazcy"); s.add_argument("dvizhok", nargs="?"); s.add_argument("--dizainy", default=DESIGNS)
    s = sp.add_parser("sdelat"); s.add_argument("dvizhok", nargs="?"); s.add_argument("--wide", action="store_true"); s.add_argument("--varianty", action="store_true")
    s = sp.add_parser("vyrezat"); s.add_argument("vhod"); s.add_argument("vyhod", nargs="?")
    s = sp.add_parser("kadry"); s.add_argument("video"); s.add_argument("-n", type=int, default=8)
    s = sp.add_parser("iskat"); s.add_argument("zapros"); s.add_argument("-n", type=int, default=8)
    s = sp.add_parser("emoji"); s.add_argument("imena", nargs="+"); s.add_argument("--flat", action="store_true", help="плоские SVG вместо 3D (резкие на любом размере)")
    a = ap.parse_args()
    {"stil": stil, "obrazcy": obrazcy, "sdelat": sdelat, "vyrezat": vyrezat, "kadry": kadry, "iskat": iskat, "emoji": emoji}[a.cmd](a)


if __name__ == "__main__":
    main()
