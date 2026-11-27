"""Рецепт ролика: постоянный дизайн автора + новый набор приёмов на каждый ролик, без повторов последних роликов.

  python3 инструменты/recept.py <папка src ролика> [--ton dinamichno|sredne|spokoyno] [--brif ЭТАП-1.md] [--name "тема"] [--fix tekst=box subs=pill …] [--seed N]
      тон: --ton явно, или строка «Темп монтажа: динамичный|средний|спокойный» из брифа/ЭТАП-1 (--brif), иначе средний.
      Три тона (Бобби 26.11): уровень монтажа один, меняются частота смен, сила наездов и резкость переходов (TEMP ниже).
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

S, M, E = "spokoyno", "sredne", "dinamichno"
TON_ALIAS = {"spokoyno": S, "спокойный": S, "спокойно": S, "sredne": M, "sredniy": M, "средний": M, "средне": M,
             "dinamichno": E, "energichno": E, "динамичный": E, "динамично": E, "энергично": E}
TON_RU = {S: "спокойный", M: "средний", E: "динамичный"}
# Темп — что меняет тон (Бобби 26.11: «спокойный — тот же уровень монтажа, только без резких эффектов»).
# kit/litso.tsx берёт отсюда смену крупности лица и силу наездов, Reel — длину Б-ролла и частоту акцентов.
# krupnosti — уровни джамп-катов на смене фразы (свод ручного отбора 27.11, раздел 6): динамичный 100/115/130 (01, 03), средний 100/115
# (04, 07, 10, 11, 12), спокойный 100/108 (05, 06, урок 14). Потолок аватара HeyGen проверен кадрами 27.11 (74-той f1/s1): общий фронт —
# 1,15 постоянно, 1,3 коротко (до 2 с); близкий бок — до 1,15. Читают kit/vary/akcent.tsx (kamera steps) и kit/trend.tsx (jumpCuts).
TEMP = {
    E: {"krupnost_s": 2.2, "zoom_max": 1.24, "punch": 1.0, "broll_max_s": 2.4, "akcent_kazhdye_s": 2.5, "tryaska": True, "perehodov": 3, "krupnosti": [1, 1.15, 1.3]},
    M: {"krupnost_s": 3.0, "zoom_max": 1.18, "punch": 0.6, "broll_max_s": 3.0, "akcent_kazhdye_s": 3.5, "tryaska": False, "perehodov": 3, "krupnosti": [1, 1.15]},
    S: {"krupnost_s": 4.0, "zoom_max": 1.12, "punch": 0.0, "broll_max_s": 3.8, "akcent_kazhdye_s": 5.0, "tryaska": False, "perehodov": 2, "krupnosti": [1, 1.08]},
}
# имя → в каких тонах уместно. Спокойный: без вспышек, хлыстов и тряски. Средний: всё спокойное + живые, но не кричащие
# (хлыст, поп, штамп, бокс-субтитры, толчок камеры); без вспышки, глитча, пикселей, затвора, сплющивания, спина.
SME, SE, ME = [S, M, E], [S, M, E], [M, E]
BANKS = {
    "perehody": {"cut": SME, "push": ME, "slide-l": SME, "slide-r": SME, "slide-u": SME, "slide-d": SME, "dive": SME,
                 "pull": SME, "whip": ME, "flash": [E], "glitch": [E], "iris": SME, "wipe": SME, "shutter": [E],
                 "spin": [E], "squash": [E], "pixel": [E], "doors": SME, "blur": SME, "stretch": [E], "card": SME, "pak": SME},
    "tekst": {"fast": SME, "blur": SME, "pop": ME, "rise": SME, "type": SME, "letters": SME, "drop": ME, "slide": SME, "box": SME,
              "underline": SME, "glitch": [E], "flip": ME, "wave": [E], "stamp": ME, "split": SME},
    "subs": {"build": SME, "karaoke": SME, "box": ME, "single": ME, "underline": SME, "outline": ME, "pill": SME, "glow": [E],
             "lower": [S, M], "bounce": [E], "marker": SME},
    "fon": {"gradient": SME, "grid": ME, "dots": SME, "aurora": SME, "rays": [E], "stripes": [E], "bokeh": SME,
            "paper": [S, M], "mesh": SME, "rings": SME, "hud": [E], "split": SME, "pak": SME},
    "akcent": {"ellipse": SME, "underline": SME, "arrow": ME, "box": SME, "brackets": SME, "burst": [E], "spot": SME,
               "disc": SME, "sparkle": [E], "tag": ME},
    "kamera": {"drift": SME, "handheld": [E], "breathe": [S, M], "punch": ME, "sway": [S, M], "steps": SME, "float": [S], "still": [S]},
}
# ИИ-вид — сам рецепт эти варианты не берёт (Бобби 27.11.2026: «рамки, зарисовки, инфографика, лишние анимации — сразу палевно,
# что монтировал ИИ; нужен чистый трендовый монтаж, как монтажёр в After Effects»). Остаются склейки, наезды/отъезды, быстрые
# переходы, анимация шрифта. Вернуть вариант — только --fix с причиной (референс Бобби), рецепт предупредит.
II_VID = {
    "perehody": {"iris", "doors", "spin", "squash", "pixel", "card", "shutter", "stretch", "wipe"},
    "tekst": {"box", "stamp", "wave", "glitch"},
    "subs": {"box", "pill", "glow", "marker", "bounce"},
    "fon": {"grid", "dots", "rays", "stripes", "hud", "mesh", "rings", "aurora"},
    "akcent": {"ellipse", "arrow", "box", "brackets", "burst", "disc", "sparkle", "tag", "spot"},
    "kamera": set(),
}
# Основа по своду ручного отбора 27.11 (13 эталонов Бобби): из чего рецепт выбирает сам, без --fix. Остальное в банках — только --fix.
#   subs — build всегда (слово встаёт на своё место по голосу, 13 из 13; полосы субтитров нет ни в одном эталоне);
#   tekst — fast (слово встаёт за 2–3 кадра), rise, type; не blur: вход 0,28 с с масштабом — это и есть наш ИИ-вид (свод §1 п.5);
#   kamera — steps: джамп-каты крупности по уровням тона; дрейфа на спикере нет у 7 из 13;
#   perehody — голая склейка основная: только каждый третий стык не cut; push (толчок в склейку) первым у среднего и динамичного,
#   световой переход (flash, glitch, засветка пака) — не больше одного на ролик, раз в 8–16 с.
OSNOVA = {"subs": ["build"], "tekst": ["fast", "rise", "type"], "kamera": ["steps"]}
SVET = {"flash", "glitch", "pak"}
FILES = {"perehody": "perehody.tsx", "tekst": "tekst.tsx", "subs": "subs.tsx", "fon": "fon.tsx", "akcent": "akcent.tsx", "kamera": "akcent.tsx"}
NO_REPEAT = 3  # роликов назад без повтора
NO_REPEAT_TR = 2


def load_hist():
    try:
        return json.loads(HIST.read_text(encoding="utf-8"))
    except Exception:
        return []


def ton_iz_brifa(path):
    """«Темп монтажа: средний» (или «Темп: …») из брифа / ЭТАП-1.md / строки банка → код тона; нет — None"""
    try:
        t = pathlib.Path(path).read_text(encoding="utf-8")
    except Exception:
        return None
    m = re.search(r"[Тт]емп(?: монтажа)?\**\s*[:—-]\s*\**\s*([А-Яа-яёa-z]+)", t)
    return TON_ALIAS.get(m.group(1).lower()) if m else None


def ton_kod(v):
    t = TON_ALIAS.get((v or "").lower())
    if not t:
        sys.exit(f"тон «{v}» не знаю: dinamichno | sredne | spokoyno (или динамичный / средний / спокойный)")
    return t


def brand():
    b = {"accent": "#FFD400", "dark": "#0B0B0C", "light": "#FFFFFF", "head": "head", "text": "inter"}  # текст — Inter: чистый гротеск эталонов 27.11
    if BRAND.exists():
        j = json.loads(BRAND.read_text(encoding="utf-8"))
        for k in ("accent", "dark", "light", "head", "text"):
            if j.get(k):
                b[k] = j[k]
    return b


def pick_one(bank, ton, recent, rnd):
    pool = [n for n, t in BANKS[bank].items() if ton in t and n not in II_VID[bank]]
    pool = [n for n in pool if n in OSNOVA.get(bank, pool)] or pool  # основа свода; нет подходящей под тон — весь банк
    fresh = [n for n in pool if n not in recent] or pool
    return rnd.choice(fresh)


PAK = None  # --pak <папка> — другой пак (по умолчанию внешнее/пак)


# Свои ролики — сборный пак автора (MONTAZH_LIB/_пак-сбор: паки монтажёров, звуки из рилсов-витрин) — на нём
# Бобби принял «Беш адам» 07.11. Бесплатный сток внешнее/пак (Freesound, LottieFiles) — только если сборного нет (ученик).
# Бобби 27.11: «звуки монтажёров у нас были, а ты их не используешь».
TREND_SND = ("тренд-сет-1/", "тренд-сет-рилсы/", "тренд-сет-4/", "кино-сет/")  # паки монтажёров, витрины, кино-сет
STOK_SND = ("тренд-сет-2/", "тренд-сет-3-мемы/")  # Freesound и myinstants — тот самый «ИИ-звук»


def pak_dir():
    if PAK:
        c = [pathlib.Path(PAK)]
    else:
        try:
            sys.path.insert(0, str(ROOT / "инструменты"))
            import _env
            c = [_env.lib() / "_пак-сбор"]
        except Exception:
            c = []
        c.append(ROOT / "внешнее" / "пак")
    for d in c:
        if (d / "каталог.json").exists():
            return d
    return None


def pak_items():
    d = pak_dir()
    if not d:
        return []
    try:
        c = json.loads((d / "каталог.json").read_text(encoding="utf-8"))
    except Exception:
        return []
    out = []
    for i in (c if isinstance(c, list) else list(c.values())):
        # два вида каталога: пак install.py (local, dur, id, set) и сборный пак автора (path, dur_s) — приводим к одному
        loc = i.get("local") or i.get("path")
        if not loc or not (d / loc).exists():
            continue
        out.append({**i, "local": loc, "dur": i.get("dur", i.get("dur_s")), "id": i.get("id") or loc,
                    "set": i.get("set") or i.get("category", "").split("/")[0], "title": i.get("title") or pathlib.Path(loc).name})
    return out


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
                 and "multiply" not in str(i.get("blend", "")) and i["category"] not in bad_tr and (ton != S or i["category"] in calm_tr))
        if tr:
            ids.append(tr["id"])
            out["perehod"] = "pak/" + tr["local"]
            out["perehodBlend"] = "normal" if tr.get("alpha") and str(tr.get("blend", "normal")) == "normal" else "screen"
    if need_tex:
        tex = one(lambda i: i["set"] == "текстуры" and "multiply" not in str(i.get("blend", "")))
        if tex:
            ids.append(tex["id"])
            out["tekstura"] = "pak/" + tex["local"]
    if ids and d.name == "_пак-сбор":  # сборный пак — не в пак.json, копируем напрямую по пути
        for i in ids:
            (public / "pak" / i).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(d / i, public / "pak" / i)
    elif ids:
        cmd = [sys.executable, str(ROOT / "инструменты" / "pak.py"), "take", *ids, "--to", str(public)] + (["--dest", str(d)] if PAK else [])
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            notes.append("пак: не скопировалось — " + (r.stdout + r.stderr).strip()[:200])
            out = {}
    # звуки склеек: три разных вжуха, удар, клик. Подбор по тегам; пик звука (pik_ms) пишется в рецепт —
    # sound.tsx ставит звук так, чтобы пик попал ровно на склейку. Уже лежащие в public/sfx файлы не трогаются.
    sfx = public / "sfx"
    # кино-сет лежит своими папками — сводим к общим категориям
    KINO = {"звуки/вжухи": ("Вжухи_", "Переходы"), "звуки/удары-дропы": ("Удары", "Саб_дропы"),
            "звуки/интерфейс": ("Тики_щелчки", "Касания_экрана", "Появления_интерфейса"), "звуки/кино-стинги": ("Удары", "Падения_уходы")}
    snd = [i for i in items if i["local"].startswith("звуки/")]
    trend = [i for i in snd if any(t in i["local"] for t in TREND_SND)]
    pool_snd = trend or [i for i in snd if not any(t in i["local"] for t in STOK_SND)] or snd
    def cat_ok(i, cat):
        if i["category"] == cat:
            return True
        return i["category"].startswith("звуки/кино-сет/") and any(k in i["category"] for k in KINO.get(cat, ()))
    def tagged(cat, good, bad=(), max_dur=2.5, max_pik=900):
        return lambda i: (i in pool_snd and cat_ok(i, cat) and i["local"].endswith(".wav") and i["id"] not in used
                          and (i.get("dur") or 9) <= max_dur and (i.get("pik_ms") or 0) <= max_pik
                          and any(g in " ".join(i.get("tags", [])) for g in good) and not any(b in " ".join(i.get("tags", [])) for b in bad))
    soft = ("вжух мягкий", "вжух на смену плана", "переход") if ton == S else ("вжух быстрый", "вжух на смену плана", "переход резкий")
    want = {
        "whoosh1": tagged("звуки/вжухи", soft),
        "whoosh2": tagged("звуки/вжухи", soft),
        "whoosh3": tagged("звуки/вжухи", soft),
        "hit": tagged("звуки/удары-дропы", ("жёсткий удар", "кино-удар", "бас-удар", "акцент на цифре", "удар"), ("драка", "гром", "взрыв", "топ", "дрон"), 3.5, 1500)
        if ton != S else tagged("звуки/кино-стинги", ("",), (), 3.5, 1500),
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
    pick = {"ton": ton, "temp": TEMP[ton]}
    # переходы: склейка — основа ритма, плюс 2–3 новых вида
    pool = [n for n, t in BANKS["perehody"].items() if ton in t and n not in ("cut", "push") and n not in II_VID["perehody"]]
    fresh = [n for n in pool if n not in recent["perehody"]]
    if pak_dir() is None:
        fresh = [n for n in fresh if n != "pak"]
        pool = [n for n in pool if n != "pak"]
    n_tr = TEMP[ton]["perehodov"]
    chosen = ["push"] if ton in BANKS["perehody"]["push"] else []  # толчок в склейку — основная замена вспышки (свод 27.11)
    def ok(n):  # световой (вспышка, глитч, засветка) — не больше одного
        return n not in chosen and not (n in SVET and any(c in SVET for c in chosen))
    for n in rnd.sample(fresh, len(fresh)):
        if len(chosen) < n_tr and ok(n):
            chosen.append(n)
    for n in rnd.sample(pool, len(pool)):
        if len(chosen) < n_tr and ok(n):
            chosen.append(n)
    # голая склейка — основной вид: 2 склейки, потом переход из набора (свет при 3 видах — раз в 9 стыков ≈ 13–25 с)
    pick["perehody"] = [x for c in chosen for x in ("cut", "cut", c)]
    for b in ("tekst", "subs", "fon", "akcent", "kamera"):
        pick[b] = pick_one(b, ton, recent[b], rnd)
    if pick["fon"] == "pak" and pak_dir() is None:
        pick["fon"] = pick_one("fon", ton, recent["fon"] | {"pak"}, rnd)
    for f in fixes:
        k, v = f.split("=", 1)
        zapret = [x for x in v.split(",") if x in II_VID.get(k, ())]
        if zapret:
            print(f"  ВНИМАНИЕ  {k}={','.join(zapret)} — ИИ-вид (Бобби 27.11), ставить только по референсу Бобби")
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
    print(f"  тон      {TON_RU[ton]} (смена крупности ~{TEMP[ton]['krupnost_s']} с, наезд до ×{TEMP[ton]['zoom_max']}, Б-ролл до {TEMP[ton]['broll_max_s']} с)")
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
        ton = opt("--ton")
        if not ton and opt("--brif"):
            ton = ton_iz_brifa(opt("--brif"))
            if not ton:
                print(f"  в {opt('--brif')} нет строки «Темп монтажа: …» — беру средний")
        make(a[0], ton_kod(ton or M), opt("--name"), fixes, int(seed) if seed else None)
