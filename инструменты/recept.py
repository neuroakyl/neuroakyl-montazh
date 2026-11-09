"""Рецепт ролика: постоянный дизайн автора + новый набор приёмов на каждый ролик, без повторов последних роликов.

  python3 инструменты/recept.py <папка src ролика> [--ton spokoyno|energichno] [--name "тема"] [--fix tekst=box subs=pill …] [--seed N]
  python3 инструменты/recept.py <src> --pak <папка пака>   другой пак (по умолчанию внешнее/пак)
  python3 инструменты/recept.py --pokaz                 банки вариантов и что было в последних роликах
  python3 инструменты/recept.py --proverka              все имена из банков есть в коде шаблона

Пишет <src>/recept.json — его читают детали kit/vary/* (Shots, Title, Subs, Fon, Akcent, kamera).
Дизайн (цвета, шрифты) — из обложка-бренд.json в корне движка (у каждого свой; нет — значения по умолчанию).
История — рецепты.json в корне движка (в Git не идёт): варианты последних 3 роликов не повторяются,
переходы — последних 2. Так монтаж не надоедает (Боб, 09.11.2026).
Пак монтажёра поставлен (внешнее/пак) — рецепт сам берёт переход, засветку и текстуру из пака и кладёт их в public/pak ролика.
"""
import json, pathlib, random, re, shutil, subprocess, sys, time

ROOT = pathlib.Path(__file__).resolve().parent.parent
HIST = ROOT / "рецепты.json"
BRAND = ROOT / "обложка-бренд.json"
KIT = ROOT / "шаблон" / "src" / "kit" / "vary"

S, E = "spokoyno", "energichno"
# имя → в каких тонах уместно. Спокойный тон: эксперт, медицина, история — без вспышек, хлыстов и тряски.
BANKS = {
    "perehody": {"cut": [S, E], "slide-l": [S, E], "slide-r": [S, E], "slide-u": [S, E], "slide-d": [S, E], "dive": [S, E],
                 "pull": [S, E], "whip": [E], "flash": [E], "glitch": [E], "iris": [S, E], "wipe": [S, E], "shutter": [E],
                 "spin": [E], "squash": [E], "pixel": [E], "doors": [S, E], "blur": [S, E], "stretch": [E], "card": [S, E], "pak": [S, E]},
    "tekst": {"blur": [S, E], "pop": [E], "rise": [S, E], "type": [S, E], "letters": [S, E], "drop": [E], "slide": [S, E], "box": [S, E],
              "underline": [S, E], "glitch": [E], "flip": [E], "wave": [E], "stamp": [E], "split": [S, E]},
    "subs": {"karaoke": [S, E], "box": [E], "single": [E], "underline": [S, E], "outline": [E], "pill": [S, E], "glow": [E],
             "lower": [S], "bounce": [E], "marker": [S, E]},
    "fon": {"gradient": [S, E], "grid": [E], "dots": [S, E], "aurora": [S, E], "rays": [E], "stripes": [E], "bokeh": [S, E],
            "paper": [S], "mesh": [S, E], "rings": [S, E], "hud": [E], "split": [S, E], "pak": [S, E]},
    "akcent": {"ellipse": [S, E], "underline": [S, E], "arrow": [E], "box": [S, E], "brackets": [S, E], "burst": [E], "spot": [S, E],
               "disc": [S, E], "sparkle": [E], "tag": [E]},
    "kamera": {"drift": [S, E], "handheld": [E], "breathe": [S], "punch": [E], "sway": [S], "steps": [E], "float": [S], "still": [S]},
}
FILES = {"perehody": "perehody.tsx", "tekst": "tekst.tsx", "subs": "subs.tsx", "fon": "fon.tsx", "akcent": "akcent.tsx", "kamera": "akcent.tsx"}
NO_REPEAT = 3  # роликов назад без повтора
NO_REPEAT_TR = 2


def load_hist():
    try:
        return json.loads(HIST.read_text(encoding="utf-8"))
    except Exception:
        return []


def brand():
    b = {"accent": "#FFD400", "dark": "#0B0B0C", "light": "#FFFFFF", "head": "head", "text": "ui"}
    if BRAND.exists():
        j = json.loads(BRAND.read_text(encoding="utf-8"))
        for k in ("accent", "dark", "light", "head", "text"):
            if j.get(k):
                b[k] = j[k]
    return b


def pick_one(bank, ton, recent, rnd):
    pool = [n for n, t in BANKS[bank].items() if ton in t]
    fresh = [n for n in pool if n not in recent] or pool
    return rnd.choice(fresh)


PAK = None  # --pak <папка> — другой пак (по умолчанию внешнее/пак)


def pak_dir():
    d = pathlib.Path(PAK) if PAK else ROOT / "внешнее" / "пак"
    return d if (d / "каталог.json").exists() else None


def pak_items():
    d = pak_dir()
    if not d:
        return []
    try:
        c = json.loads((d / "каталог.json").read_text(encoding="utf-8"))
    except Exception:
        return []
    return [i for i in (c if isinstance(c, list) else list(c.values())) if (d / i.get("local", "")).exists()]


VIDEO = (".webm", ".mp4", ".mov")


def pak_pick(src, rnd, ton, need_tr, need_tex):
    """из пака: переход (засветка / film burn / глитч / альфа), текстура фона и звуки склеек.
    Переход и текстура копируются в <ролик>/public/pak/… (pak.py take), звуки — в public/sfx/ под именами, которые ждёт sound.tsx."""
    items = pak_items()
    if not items:
        return {}, []
    d = pak_dir()
    public = pathlib.Path(src).resolve().parent / "public"
    def one(pred):
        c = [i for i in items if pred(i)]
        return rnd.choice(c) if c else None
    # настоящие переходы, а не фоновые клипы (боке, маски-блики идут в фон, не на склейку)
    calm_tr = ("засветки/light-leaks", "переходы/film-burn")
    bad_tr = ("засветки/блики-боке", "засветки/маски-блики", "переходы/commons-eatcha")  # eatcha: чернила на белом, в каталоге ошибочно screen
    out, ids, notes = {}, [], []
    if need_tr:
        tr = one(lambda i: i["local"].lower().endswith(VIDEO) and i["set"] in ("переходы", "засветки", "yt")
                 and "multiply" not in str(i.get("blend", "")) and i["category"] not in bad_tr and (ton == E or i["category"] in calm_tr))
        if tr:
            ids.append(tr["id"])
            out["perehod"] = "pak/" + tr["local"]
            out["perehodBlend"] = "normal" if tr.get("alpha") and str(tr.get("blend", "normal")) == "normal" else "screen"
    if need_tex:
        tex = one(lambda i: i["set"] == "текстуры" and "multiply" not in str(i.get("blend", "")))
        if tex:
            ids.append(tex["id"])
            out["tekstura"] = "pak/" + tex["local"]
    if ids:
        cmd = [sys.executable, str(ROOT / "инструменты" / "pak.py"), "take", *ids, "--to", str(public)] + (["--dest", str(d)] if PAK else [])
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            notes.append("пак: не скопировалось — " + (r.stdout + r.stderr).strip()[:200])
            out = {}
    # звуки склеек: три разных вжуха, удар, клик. Подбор по тегам; пик звука (pik_ms) пишется в рецепт —
    # sound.tsx ставит звук так, чтобы пик попал ровно на склейку. Уже лежащие в public/sfx файлы не трогаются.
    sfx = public / "sfx"
    def tagged(cat, good, bad=(), max_dur=2.5, max_pik=900):
        return lambda i: (i["category"] == cat and i["local"].endswith(".wav") and i["id"] not in used
                          and (i.get("dur") or 9) <= max_dur and (i.get("pik_ms") or 0) <= max_pik
                          and any(g in " ".join(i.get("tags", [])) for g in good) and not any(b in " ".join(i.get("tags", [])) for b in bad))
    soft = ("вжух мягкий", "вжух на смену плана", "переход") if ton == S else ("вжух быстрый", "вжух на смену плана", "переход резкий")
    want = {
        "whoosh1": tagged("звуки/вжухи", soft),
        "whoosh2": tagged("звуки/вжухи", soft),
        "whoosh3": tagged("звуки/вжухи", soft),
        "hit": tagged("звуки/удары-дропы", ("жёсткий удар", "кино-удар", "бас-удар", "акцент на цифре", "удар"), ("драка", "гром", "взрыв", "топ", "дрон"), 3.5, 1500)
        if ton == E else tagged("звуки/кино-стинги", ("",), (), 3.5, 1500),
        "click": tagged("звуки/интерфейс", ("свайп", "поп", "щелчок", "появление элемента"), (), 1.5, 400),
    }
    used, piks = set(), {}
    for name, pred in want.items():
        dst = sfx / f"{name}.wav"
        if dst.exists():
            continue
        it = one(pred)
        if it:
            used.add(it["id"])
            sfx.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(d / it["local"], dst)
            piks[name] = round((it.get("pik_ms") or 0) / 1000, 3)
            notes.append(f"звук {name}.wav ← {it['title'][:40]} (пик {it.get('pik_ms')} мс)")
    if piks:
        out["sfxPik"] = piks
    return out, notes


def make(src, ton, name, fixes, seed):
    hist = load_hist()
    rnd = random.Random(seed if seed is not None else time.time_ns())
    recent = {b: set() for b in BANKS}
    for h in hist[-NO_REPEAT:]:
        for b in ("tekst", "subs", "fon", "akcent", "kamera"):
            recent[b].add(h["pick"].get(b))
    for h in hist[-NO_REPEAT_TR:]:
        recent["perehody"].update(x for x in h["pick"].get("perehody", []) if x != "cut")
    pick = {"ton": ton}
    # переходы: склейка — основа ритма, плюс 2–3 новых вида
    pool = [n for n, t in BANKS["perehody"].items() if ton in t and n != "cut"]
    fresh = [n for n in pool if n not in recent["perehody"]]
    if pak_dir() is None:
        fresh = [n for n in fresh if n != "pak"]
        pool = [n for n in pool if n != "pak"]
    n_tr = 3 if ton == E else 2
    chosen = rnd.sample(fresh, min(n_tr, len(fresh)))
    while len(chosen) < n_tr:
        chosen.append(rnd.choice([p for p in pool if p not in chosen]))
    pick["perehody"] = ["cut", chosen[0], "cut", *chosen[1:]]
    for b in ("tekst", "subs", "fon", "akcent", "kamera"):
        pick[b] = pick_one(b, ton, recent[b], rnd)
    if pick["fon"] == "pak" and pak_dir() is None:
        pick["fon"] = pick_one("fon", ton, recent["fon"] | {"pak"}, rnd)
    for f in fixes:
        k, v = f.split("=", 1)
        if k == "perehody":
            pick[k] = v.split(",")
        elif k in BANKS:
            if v not in BANKS[k]:
                sys.exit(f"нет варианта {v} в банке {k}: {', '.join(BANKS[k])}")
            pick[k] = v
    pak, notes = pak_pick(src, rnd, ton, "pak" in pick["perehody"], pick["fon"] == "pak")
    if pak:
        pick["pak"] = pak
    rec = {"name": name or pathlib.Path(src).resolve().parent.parent.name, "seed": seed, "brand": brand(), "pick": pick}
    out = pathlib.Path(src) / "recept.json"
    out.write_text(json.dumps(rec, ensure_ascii=False, indent=2), encoding="utf-8")
    hist.append({"date": time.strftime("%Y-%m-%d"), "name": rec["name"], "pick": pick})
    HIST.write_text(json.dumps(hist[-30:], ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Рецепт «{rec['name']}» → {out}")
    for k in ("perehody", "tekst", "subs", "fon", "akcent", "kamera"):
        v = pick[k]
        print(f"  {k:9} {', '.join(v) if isinstance(v, list) else v}")
    if pak:
        print("  пак      ", pak)
    for n in notes:
        print("  " + n)
    if pak_dir() is None:
        print("  (пак монтажёра не поставлен: python3 инструменты/pak.py install --light — тогда рецепт берёт из него переходы и звуки)")


def pokaz():
    hist = load_hist()
    for b, v in BANKS.items():
        print(f"{b} ({len(v)}): {', '.join(v)}")
    print("\nПоследние ролики:")
    for h in hist[-5:]:
        p = h["pick"]
        print(f"  {h['date']} {h['name']}: {', '.join(p['perehody'])} | {p['tekst']} | {p['subs']} | {p['fon']} | {p['akcent']} | {p['kamera']}")


def proverka():
    bad = 0
    for b, names in BANKS.items():
        code = (KIT / FILES[b]).read_text(encoding="utf-8")
        for n in names:
            if not re.search(rf'["\']{re.escape(n)}["\']|\b{re.escape(n)}:', code):
                print(f"✗ {b}: «{n}» нет в {FILES[b]}")
                bad += 1
    print("ok: все варианты есть в коде" if not bad else f"{bad} расхождений")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    a = sys.argv[1:]
    if "--pokaz" in a:
        pokaz()
    elif "--proverka" in a:
        proverka()
    elif not a or a[0].startswith("-"):
        print(__doc__)
    else:
        def opt(n, d=None):
            return a[a.index(n) + 1] if n in a else d
        fixes = []
        if "--fix" in a:
            i = a.index("--fix") + 1
            while i < len(a) and not a[i].startswith("--"):
                fixes.append(a[i]); i += 1
        seed = opt("--seed")
        PAK = opt("--pak")
        make(a[0], opt("--ton", E), opt("--name"), fixes, int(seed) if seed else None)
