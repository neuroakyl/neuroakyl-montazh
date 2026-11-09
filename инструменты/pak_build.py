"""Сборка публичного списка пака монтажёра: пак/пак.json. Запускается ТОЛЬКО у автора движка.

  python3 -I инструменты/pak_build.py            собрать пак/пак.json из нашей закрытой сборки
  python3 -I инструменты/pak_build.py --verify   дополнительно проверить каждую ссылку (HEAD) и выкинуть мёртвые

Откуда берёт: PAK_SRC (по умолчанию ../библиотека/_пак-сбор рядом с репозиторием) — там manifest.json
и каталог.json. Сами файлы мы НЕ раздаём: в пак.json только ссылки на оригиналы и рецепт обработки.
Ученик ставит пак командой инструменты/pak.py (см. SKILL.md, «Пак монтажёра»).

Что включается (фильтр по лицензии и наличию прямой ссылки):
  CC0, CC BY 3.0/4.0 (с указанием автора), Pixabay Content License, Lottie Simple License (с указанием автора),
  шрифты OFL / Ubuntu Font License / Apache 2.0, YouTube-зелёные экраны (набор «yt», «свободное использование по заявлению
  авторов»: ученик качает сам у автора).
Что НЕ включается: мемные звуки (myinstants), паки «права не проверены», «сгенерировано автором», всё без ссылки,
всё с Drive/Mediafire/Mega.
"""
import collections, datetime, hashlib, json, os, pathlib, re, sys, time, urllib.parse, urllib.request
import concurrent.futures as cf

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = pathlib.Path(os.environ["PAK_SRC"]) if os.environ.get("PAK_SRC") else ROOT.parent / "библиотека" / "_пак-сбор"
OUT = ROOT / "пак" / "пак.json"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36"

BAD = ("myinstants", "права не проверены", "user-uploaded", "сгенерирован", "Manrope: SIL OFL")
BAD_HOSTS = ("drive.google.com", "mediafire", "mega.", "myinstants")

SETS = {
    "звуки": "звуки: вжухи, удары, клики интерфейса, райзеры, глитчи (wav 48 кГц, пик −16 LUFS)",
    "засветки": "засветки и блики: light leaks, боке, маски бликов (blend screen)",
    "переходы": "переходы на чёрном фоне: film burn, глитч, чернила (blend screen); зелёные экраны — в наборе yt",
    "элементы": "элементы и частицы (png с альфой)",
    "текстуры": "текстуры: пыль, бумага, царапины, VHS",
    "lottie": "векторные Lottie-анимации: иконки, стрелки, выделения, эмодзи, соцсети",
    "шрифты": "шрифты с кириллицей и кыргызскими буквами ң ө ү (SIL OFL и др.)",
    "yt": "зелёные экраны и оверлеи с YouTube: качаются у авторов, зелёный фон становится прозрачным (webm)",
}
PREFIX = {"звуки": "snd", "засветки": "flr", "переходы": "trn", "элементы": "elm", "текстуры": "tex", "lottie": "lot", "шрифты": "fnt", "yt": "yt"}

LIC = {
    "cc0": ("CC0", "https://creativecommons.org/publicdomain/zero/1.0/"),
    "ccby4": ("CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/"),
    "ccby3": ("CC BY 3.0", "https://creativecommons.org/licenses/by/3.0/"),
    "pixabay": ("Pixabay Content License", "https://pixabay.com/service/license-summary/"),
    "lottie": ("Lottie Simple License", "https://lottiefiles.com/page/license"),
    "ofl": ("SIL OFL 1.1", "https://openfontlicense.org/"),
    "ufl": ("Ubuntu Font License 1.0", "https://ubuntu.com/legal/font-licence"),
    "apache": ("Apache 2.0", "https://www.apache.org/licenses/LICENSE-2.0"),
    "yt": ("Свободное использование по заявлению автора ролика (YouTube)", ""),
}


def lic_key(s, host):
    if host == "youtu.be":
        return "yt"
    if "CC0" in s:
        return "cc0"
    if "CC BY 4.0" in s:
        return "ccby4"
    if "CC BY 3.0" in s:
        return "ccby3"
    if "Pixabay" in s:
        return "pixabay"
    if "Lottie" in s:
        return "lottie"
    if "SIL OFL" in s:
        return "ofl"
    if "Ubuntu" in s:
        return "ufl"
    if "Apache" in s:
        return "apache"
    return None


def slug(name):
    s = re.sub(r"[^\w.\-]+", "-", name, flags=re.U).strip("-.")
    s = re.sub(r"-{2,}", "-", s)
    return s[:70] or "file"


def head(url, referer=None):
    try:
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": UA, **({"Referer": referer} if referer else {})})
        return urllib.request.urlopen(req, timeout=20).status == 200
    except Exception:
        return False


def resolve_google(names):
    """Google Sound Library: в manifest лежит страница каталога, а файл — actions.google.com/sounds/v1/<папка>/<имя>.ogg. Находим папку."""
    cats = "alarms ambiences animals cartoon crowds foley human_voices impacts nature office science_fiction sports transportation water weather emergency".split()

    def one(n):
        for c in cats:
            u = f"https://actions.google.com/sounds/v1/{c}/{n}.ogg"
            if head(u):
                return n, u
        return n, None
    with cf.ThreadPoolExecutor(12) as ex:
        return dict(ex.map(one, names))


def main():
    verify = "--verify" in sys.argv
    manifest = json.loads((SRC / "manifest.json").read_text(encoding="utf-8"))["files"]
    cat = {x["path"]: x for x in json.loads((SRC / "каталог.json").read_text(encoding="utf-8"))}

    google = resolve_google(sorted({x["path"].rsplit("/", 1)[1].rsplit(".", 1)[0] for x in manifest if "actions.google.com" in (x.get("download_url") or "")}))

    rows, seen_yt, used_local, skipped = [], {}, set(), collections.Counter()
    for x in manifest:
        url = x.get("download_url") or ""
        host = urllib.parse.urlparse(url).netloc
        if not url or any(b in host for b in BAD_HOSTS) or "myinstants" in x.get("source", ""):
            skipped["нет прямой ссылки / запрещённый источник"] += 1
            continue
        lic = x.get("license", "")
        if host != "youtu.be" and any(b in lic for b in BAD):
            skipped["лицензия не подходит"] += 1
            continue
        lk = lic_key(lic, host)
        if not lk:
            skipped["лицензия не распознана"] += 1
            continue
        c = cat.get(x["path"], {})
        base = x["path"].rsplit("/", 1)[1]
        stem, ext = base.rsplit(".", 1) if "." in base else (base, "")
        cname = x["category"]
        sset = cname.split("/")[0]
        sub = cname.split("/", 1)[1] if "/" in cname else ""
        item = {
            "set": sset, "category": cname,
            "title": c.get("title") or (x.get("family") and f"{x['family']} — {x.get('style','')}") or stem,
            "tags": c.get("tags") or [], "dur": c.get("dur_s") if c.get("dur_s") is not None else x.get("duration_s"),
            "alpha": bool(x.get("alpha")), "blend": (c.get("blend") or x.get("blend_hint") or None),
            "res": c.get("res") or x.get("resolution"), "pik_ms": c.get("pik_ms", x.get("pik_ms")),
            "url": url, "page": x.get("page") or "", "license": lk, "credit": None, "recipe": "none", "size": x.get("size", 0),
        }
        if item["blend"] in ("-", ""):
            item["blend"] = None
        if host == "youtu.be":
            vid = url.rsplit("/", 1)[1]
            if vid in seen_yt:                       # одно видео лежало в двух категориях — берём один раз, теги склеиваем
                seen_yt[vid]["tags"] = sorted(set(seen_yt[vid]["tags"]) | set(item["tags"]))
                continue
            seen_yt[vid] = item
            item["set"] = "yt"
            item["alpha"] = bool(x.get("alpha"))
            item["recipe"] = "chroma-green→alpha-webm" if item["alpha"] else "none"
            ext = "webm" if item["alpha"] else "mp4"
            stem = re.sub(r"_[A-Za-z0-9_-]{6}(_\d)?$", "", stem)
            sub = "альфа" if item["alpha"] else "чёрный-фон"
            item["category"] = "yt/" + sub
            item["tags"] = sorted(set(item["tags"]) | {"зелёный экран", "оверлей"} if item["alpha"] else set(item["tags"]) | {"чёрный фон", "оверлей"})
            item["credit"] = "автор ролика — по ссылке page (свободное использование по заявлению автора)"
            item["yt_id"] = vid
            item["blend"] = "normal" if item["alpha"] else "screen"
            item["res"] = x.get("resolution")
        elif "actions.google.com" in host:
            gu = google.get(stem)
            if not gu:
                skipped["Google: файл не найден"] += 1
                continue
            item["url"] = gu
            item["recipe"] = "audio-norm"
            ext = "wav"
            item["credit"] = "Google Sound Library, CC BY 4.0 (actions.google.com/sounds)"
        elif host == "cdn.freesound.org":
            item["recipe"] = "audio-norm"
            ext = "wav"
            item["page"] = item["page"] or "https://freesound.org/"
        elif host == "kenney.nl":
            item["recipe"] = "unzip"
            item["member"] = x["archive_path"]
        elif host == "ambientcg.com":
            item["recipe"] = "unzip"
            item["member"] = x["archive_path"]
            ext = x["archive_path"].rsplit(".", 1)[1].lower()   # jpg: вместо png в нашей сборке, легче в 4 раза
            item["title"] = stem
        elif host == "assets-v2.lottiefiles.com":
            item["recipe"] = "lottie-unzip"
            ext = "json"
            item["credit"] = "автор анимации — на странице page (LottieFiles, Lottie Simple License)"
        elif host == "upload.wikimedia.org":
            who = re.search(r"credit: ([^,)]+)", lic)
            item["credit"] = f"{who.group(1) if who else 'автор'}, Wikimedia Commons, CC BY 3.0"
        elif host == "cdn.pixabay.com":
            pass
        elif host == "raw.githubusercontent.com":
            item["title"] = x.get("family", stem) + (" — " + x["style"] if x.get("style") else "")
            item["tags"] = [t for t in [x.get("family"), x.get("style"), "кириллица" if x.get("cyrillic") else None, "ң ө ү" if x.get("kyrgyz_ng_o_u") else None] if t]
            item["font"] = {"cyr": bool(x.get("cyrillic")), "kg": bool(x.get("kyrgyz_ng_o_u"))}
        else:
            skipped["неизвестный хост " + host] += 1
            continue
        # локальный путь внутри пака
        folder = (item["category"] if item["set"] == "yt" else (cname if item["set"] != "шрифты" else "шрифты/" + x["path"].split("/")[1]))
        local = f"{folder}/{slug(stem)}.{ext}"
        if local in used_local:
            local = f"{folder}/{slug(stem)}-{hashlib.sha1((url + x['path']).encode()).hexdigest()[:5]}.{ext}"
        used_local.add(local)
        item["local"] = local
        h = hashlib.sha1((item["url"] + "|" + item.get("member", "") + "|" + x["path"]).encode()).hexdigest()[:6]
        item["id"] = f"{PREFIX[item['set']]}-{h}"
        if item["set"] == "yt":
            item["id"] = f"yt-{item['yt_id'][:11]}"
            del item["yt_id"]
        item["_src"] = x["path"]
        rows.append(item)

    if verify:
        print("проверяю ссылки…", len(rows), flush=True)
        urls = {}
        for r in rows:
            urls.setdefault(r["url"], []).append(r)
        def chk(u):
            ref = urls[u][0]["page"] if "kenney.nl" in u else None
            if "kenney.nl/download-link" in u:
                return u, True            # одноразовая подписанная ссылка, проверяется при установке
            if "youtu.be" in u:
                return u, True            # проверяется yt-dlp при установке
            if "wikimedia.org" in u:       # Wikimedia на HEAD из Python отвечает отказом, хотя файлы качаются; проверено живой установкой
                return u, True
            for k in range(3):             # сервер мог просто притормозить: три попытки с паузой
                if head(u, ref):
                    return u, True
                time.sleep(2 * (k + 1))
            return u, False
        dead = []
        with cf.ThreadPoolExecutor(10) as ex:
            for u, ok in ex.map(chk, list(urls)):
                if not ok:
                    dead += urls[u]
        print("мёртвых ссылок:", len(dead))
        ids = {id(r) for r in dead}
        for r in dead:
            print("  ×", r["url"])
        rows = [r for r in rows if id(r) not in ids]

    # уникальность id
    ids = collections.Counter(r["id"] for r in rows)
    for r in rows:
        if ids[r["id"]] > 1:
            r["id"] += "-" + hashlib.sha1(r["local"].encode()).hexdigest()[:3]
    assert len({r["id"] for r in rows}) == len(rows), "id не уникальны"

    light(rows)
    for r in rows:
        r.pop("_src", None)
        for k in [k for k, v in r.items() if v in (None, "", [], {}) and k not in ("alpha",)]:
            del r[k]
        if not r.get("light"):
            r.pop("light", None)
    rows.sort(key=lambda r: (list(SETS).index(r["set"]), r["category"], r["id"]))
    data = {"v": 1, "built": datetime.date.today().isoformat(),
            "sets": SETS, "licenses": {k: {"name": v[0], "url": v[1]} for k, v in LIC.items()}, "items": rows}
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"записано {OUT.relative_to(ROOT)}: {OUT.stat().st_size/1e6:.2f} МБ, записей {len(rows)}; пропущено: {dict(skipped)}")
    stat(rows)


# --- отборный поднабор для --light ---------------------------------------------------------------------------------

LIGHT_CAP = {   # сколько брать из категории; остальное — по умолчанию 12
    "звуки/вжухи": 22, "звуки/удары-дропы": 24, "звуки/интерфейс": 22, "звуки/райзеры": 10, "звуки/глитч-vhs": 12,
    "звуки/кино-стинги": 12, "звуки/мемные": 8, "звуки/деньги-успех": 8, "звуки/тактильные": 10, "звуки/ошибки-провалы": 6,
    "засветки/light-leaks": 4, "засветки/блики-боке": 4, "засветки/маски-блики": 12,
    "переходы/film-burn": 3, "переходы/glitch": 4, "переходы/чернила-краска": 3, "переходы/commons-eatcha": 2,
    "переходы/зелёный-экран": 0, "переходы/чёрный-фон": 0,
    "элементы/частицы": 15, "элементы/зелёный-экран": 0,
    "текстуры/бумага": 3, "текстуры/пыль-частицы": 3, "текстуры/царапины-шум-vhs": 2,
    "шрифты": 30, "yt/альфа": 14, "yt/чёрный-фон": 6,
}
MAX_VIDEO = 30_000_000


def spread(items, n, bucket):
    """n разнообразных: раскладываем по корзинам (bucket(item)) и берём по кругу, внутри корзины — по стабильному хэшу."""
    b = collections.defaultdict(list)
    for r in sorted(items, key=lambda r: hashlib.sha1(r["id"].encode()).hexdigest()):
        b[bucket(r)].append(r)
    order = sorted(b, key=lambda k: (-len(b[k]), str(k)))
    out = []
    while len(out) < n and any(b.values()):
        for k in order:
            if b[k] and len(out) < n:
                out.append(b[k].pop(0))
    return out


def light(rows):
    by = collections.defaultdict(list)
    for r in rows:
        by[r["category"]].append(r)
    for c, items in by.items():
        n = LIGHT_CAP.get(c, 12)
        if c.startswith("lottie"):
            n = 12
        pool = [r for r in items if r.get("size", 0) <= MAX_VIDEO]
        if c.startswith("звуки"):
            pool = [r for r in pool if 0.15 <= (r.get("dur") or 1) <= 8] or pool
        if c.startswith("yt"):
            pool = [r for r in pool if (r.get("dur") or 5) <= 15 and r["res"] and r.get("size", 0) < 4_000_000] or pool
        if c == "шрифты":
            pool = [r for r in pool if "Italic" not in r["local"] and r.get("font", {}).get("kg")] or pool
            buck = lambda r: (r["tags"][1] if len(r["tags"]) > 1 else "")
        elif c.startswith("звуки"):
            buck = lambda r: (r["tags"][0] if r.get("tags") else "")
        else:
            buck = lambda r: (r["tags"][0] if r.get("tags") else r["local"].split("/")[-1][:3])
        for r in spread(pool, n, buck):
            r["light"] = 1


def stat(rows):
    print("\nнабор            файлов  вес, МБ   light: файлов  вес, МБ")
    tot = [0, 0, 0, 0]
    for s in SETS:
        a = [r for r in rows if r["set"] == s]
        l = [r for r in a if r.get("light")]
        w, lw = sum(r.get("size", 0) for r in a) / 1e6, sum(r.get("size", 0) for r in l) / 1e6
        print(f"{s:<14} {len(a):>7} {w:>8.0f} {len(l):>12} {lw:>9.0f}")
        tot = [tot[0] + len(a), tot[1] + w, tot[2] + len(l), tot[3] + lw]
    print(f"{'всего':<14} {tot[0]:>7} {tot[1]:>8.0f} {tot[2]:>12} {tot[3]:>9.0f}")
    print("\nпо лицензиям:", dict(collections.Counter(r["license"] for r in rows)))


if __name__ == "__main__":
    main()
