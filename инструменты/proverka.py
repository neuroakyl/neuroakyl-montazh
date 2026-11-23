"""Проверка монтажа на уровень профи — по готовому видео, без глаз. Числа — из шаблон/src/kit/profi.ts (свод эталонов — профи.md).

  python3 -I proverka.py ВИДЕО.mp4 [--src ПАПКА_src] [--profil golova]

Что ловит:
  ОШИБКА  «мёртвый кадр»: дольше, чем разрешает профиль, в кадре ничего не происходит (пауза-тест — так монтаж и палится как ИИ);
  ОШИБКА  дешёвые звуки в public/sfx и public/pak ролика: яркий тональный звон (колокольчик, монетка, shimmer) — кроме профиля «mem»;
  замечание  длина планов сильно не та для профиля (дёрганый спокойный ролик или вялая динамика);
  замечание  стробоскоп: много планов короче 0,33 с вне профиля «динамика» (свод v2, правило 14);
  замечание  монотонный ритм: серия склеек без единой передышки ≥1,5 с (закон 10: «дыхание и пауза»);
  замечание  громкость ролика не −14 LUFS ±1 или true peak выше −1 dBFS.
Пороги профилей — из profi.ts (свод профи.md v2, 156 эталонов).
Профиль: --profil, иначе из src/recept.json (pick.profil или тон), иначе golova. src ищется сам: рядом с видео (движок/src) или ./src.
deliver.py вызывает проверку перед сдачей: при ОШИБКАХ ролик не сдаётся (обойти — только явным --prinyat с причиной).
"""
import json, pathlib, re, subprocess, sys

HERE = pathlib.Path(__file__).resolve().parent
PROFI = HERE.parent / "шаблон" / "src" / "kit" / "profi.ts"


def profili():
    """Профили из profi.ts (один источник чисел): имя → plan [a, b], sobytie."""
    t = PROFI.read_text(encoding="utf-8")
    out = {}
    for m in re.finditer(r'^\s+"?([\w-]+)"?: \{\s*\n?\s*imya: "([^"]+)", plan: \[([\d.]+), ([\d.]+)\], sobytie: ([\d.]+)', t, re.M):
        out[m.group(1)] = {"imya": m.group(2), "plan": (float(m.group(3)), float(m.group(4))), "sobytie": float(m.group(5))}
    return out


def chislo(imya, default):
    """Число из ZVUK/DLIT в profi.ts (один источник): `lufs: -14`, `truePeak: -1.0`, `brollMin: 0.33`."""
    m = re.search(rf"\b{imya}:\s*(-?[\d.]+)", PROFI.read_text(encoding="utf-8"))
    return float(m.group(1)) if m else default


def najti_src(video, src):
    if src:
        return pathlib.Path(src)
    v = pathlib.Path(video).resolve()
    for c in (v.parent / "движок" / "src", v.parent.parent / "движок" / "src", pathlib.Path.cwd() / "src", v.parent / "src"):
        if (c / "recept.json").exists():
            return c
    return None


def profil_iz(src):
    try:
        p = json.loads((src / "recept.json").read_text(encoding="utf-8")).get("pick", {})
        return p.get("profil") or ("spokoyno" if p.get("ton") == "spokoyno" else "golova")
    except Exception:
        return "golova"


def raznica_kadrov(video):
    """Средняя разница соседних кадров (0–255) по каждому кадру, на уменьшенной картинке."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-v", "error", "-i", video, "-an", "-vf",
                        "fps=15,scale=180:-2,format=gray,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-",
                        "-f", "null", "-"], capture_output=True, text=True)
    vals, t = [], []
    for line in r.stdout.splitlines():
        if "pts_time:" in line:
            t.append(float(line.split("pts_time:")[1]))
        elif "YAVG=" in line:
            vals.append(float(line.split("=")[1]))
    return list(zip(t, vals))


def sobytiya(d):
    """Событие в кадре: всплеск разницы кадров относительно своей округи (±1 с) — склейка, влёт слова, плашка, панч.
    Порог локальный: в динамичном ролике фон и так живой, событие — то, что выделяется на нём (≥2,2× округи и ≥2,5)."""
    if not d:
        return [], 0
    ev = []
    for i, (t, v) in enumerate(d):
        okr = sorted(x for tt, x in d if abs(tt - t) <= 1.0)
        med = okr[len(okr) // 2]
        if v >= max(2.5, 2.2 * med) and v >= max(x for _, x in d[max(0, i - 2):i + 3]):
            ev.append(t)
    return ev, 0


def skleiki(d):
    """Жёсткие склейки — очень большие всплески (≥ 12) с промежутком ≥ 0,2 с."""
    out = []
    for t, v in d:
        if v >= 12 and (not out or t - out[-1] >= 0.2):
            out.append(t)
    return out


def harakter(wav):
    """Замер звука: яркость (Гц), тональность (0–1), сколько звенит (с). Колокольчик = ярко + тонально + звенит."""
    try:
        import numpy as np
    except ImportError:  # старая установка без numpy — звук не проверяем, но сдачу не ломаем (python3 install.py доставит)
        return 0, 0, 0
    sr = 22050
    x = np.frombuffer(subprocess.run(["ffmpeg", "-v", "error", "-i", str(wav), "-ac", "1", "-ar", str(sr), "-f", "s16le", "-"],
                                     capture_output=True).stdout, np.int16).astype(np.float32) / 32768
    win, hop = 2048, 512
    if len(x) < win * 2:
        return 0, 0, 0
    n = (len(x) - win) // hop
    fr = np.lib.stride_tricks.as_strided(x, (n, win), (x.strides[0] * hop, x.strides[0])) * np.hanning(win)
    S = np.abs(np.fft.rfft(fr, axis=1)); f = np.fft.rfftfreq(win, 1 / sr)
    e = (S ** 2).sum(1); w = e / (e.sum() + 1e-12)
    cen = float(((S * f).sum(1) / (S.sum(1) + 1e-9) * w).sum())
    flat = float((np.exp(np.log(S + 1e-9).mean(1)) / (S.mean(1) + 1e-9) * w).sum())
    env = 10 * np.log10(e + 1e-12)
    ring = float((env > env.max() - 20).sum() * hop / sr)
    return cen, 1 - flat, ring


def gromkost(video):
    """(интегральная громкость LUFS, true peak dBFS) — один проход ebur128 с peak=true."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", video, "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", r)
    pk = re.findall(r"Peak:\s+(-?[\d.]+) dBFS", r)
    return (float(m[-1]) if m else None), (float(pk[-1]) if pk else None)


def proverit(video, src=None, profil=None):
    src = najti_src(video, src)
    pr_all = profili()
    profil = profil or (profil_iz(src) if src else "golova")
    pr = pr_all.get(profil) or pr_all["golova"]
    errs, warns = [], []

    d = raznica_kadrov(video)
    dur = d[-1][0] if d else 0
    ev, _ = sobytiya(d)
    tochki = [0.0] + ev + [max(0.0, dur - 0.8)]  # последние 0,8 с — финальный кадр держится, это норма
    for a, b in zip(tochki, tochki[1:]):
        dvizh = [v for t, v in d if a < t < b]
        zhivoy = dvizh and sum(dvizh) / len(dvizh) >= 3.0  # кадр сам всё время движется (лента, счётчик, камера) — не мёртвый
        if b - a > pr["sobytie"] + 0.5 and b - a > 1.0 and not zhivoy:
            errs.append(f"мёртвый кадр {a:.1f}–{b:.1f} с ({b - a:.1f} с без события; профиль «{pr['imya']}» — не дольше {pr['sobytie']} с): "
                        f"добавить событие по смыслу — панч на ударное слово, Б-ролл, плашку, смену крупности")
    cuts = skleiki(d)
    if len(cuts) >= 3:
        planы = sorted(b - a for a, b in zip([0.0] + cuts, cuts + [dur]))
        med = planы[len(planы) // 2]
        lo, hi = pr["plan"]
        if med < lo / 2 or med > hi * 2:
            warns.append(f"средний план {med:.2f} с, а для «{pr['imya']}» {lo}–{hi} с")
        # стробоскоп: планы короче порога читаемости (0,33 с) — в динамике допустимы каскады, в остальных профилях нет
        min_plan = chislo("brollMin", 0.33)
        korotkie = [x for x in planы if x < min_plan]
        if profil != "dinamika" and len(planы) >= 6 and len(korotkie) / len(planы) > 0.4:
            warns.append(f"стробоскоп: {len(korotkie)} из {len(planы)} планов короче {min_plan} с — глаз не успевает прочитать кадр "
                         f"(для «{pr['imya']}» длиннее; склеить или убрать лишние)")
        # дыхание: серия быстрых склеек без единой передышки — признак пулемёта (закон 10)
        if dur >= 12 and len(planы) >= 8 and max(planы) < 1.5 and profil != "spokoyno":
            warns.append(f"монотонный ритм: {len(planы)} планов, самый длинный {max(planы):.1f} с — нужна передышка 1,8–3 с "
                         f"без шума после серии быстрых кадров (перед выводом или призывом)")

    if src:
        pub = src.parent / "public"
        kod = " ".join(f.read_text(encoding="utf-8", errors="ignore") for f in src.rglob("*.ts*"))
        for wav in sorted(list(pub.glob("sfx/*.wav")) + list(pub.glob("pak/**/*.wav"))):
            if f'"{wav.stem}"' not in kod and wav.name not in kod and "pak" not in wav.parts:
                continue  # лежит, но в ролике не звучит
            cen, ton, ring = harakter(wav)
            if cen > 2000 and ton > 0.85 and ring > 0.5 and profil != "mem":
                errs.append(f"дешёвый звук {wav.relative_to(pub)}: звенит {ring:.2f} с, яркость {cen:.0f} Гц (колокольчик/шиммер) — "
                            f"заменить на удар, бас, щелчок или фоли (pak.py find удар)")

        try:
            trend = json.loads((src / "recept.json").read_text(encoding="utf-8")).get("pick", {}).get("trend", [])
        except Exception:
            trend = []
        if trend:
            sceny = " ".join(f.read_text(encoding="utf-8", errors="ignore") for f in src.rglob("*.tsx")
                             if "kit" not in f.parts and not f.stem.endswith("Demo") and f.stem not in ("Varianty", "Root"))
            vzyato = [x for x in trend if re.search(rf"<{x}\b", sceny)]
            nado = 1 if profil == "spokoyno" else 2
            if len(vzyato) < nado:
                errs.append(f"трендовые приёмы рецепта не использованы: взято {len(vzyato)} из {', '.join(trend)} (нужно ≥{nado}) — "
                            f"детали в kit/trend.tsx, когда брать — приёмы.md «Тренд»")

    lufs, peak = gromkost(video)
    celevaya = chislo("lufs", -14)
    if lufs is not None and abs(lufs - celevaya) > 1.0:
        warns.append(f"громкость {lufs:.1f} LUFS, норма {celevaya:.0f} ±1 (deliver.py выровняет)")
    if peak is not None and peak > chislo("truePeak", -1.0):
        warns.append(f"true peak {peak:.1f} dBFS выше {chislo('truePeak', -1.0):.0f} — на телефоне будет клип (deliver.py выровняет)")
    return profil, pr, errs, warns, len(ev), dur


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a or a[0].startswith("-"):
        sys.exit(__doc__)
    opt = lambda n: a[a.index(n) + 1] if n in a else None
    profil, pr, errs, warns, n_ev, dur = proverit(a[0], opt("--src"), opt("--profil"))
    print(f"профиль: {pr['imya']} · событий в кадре {n_ev} за {dur:.1f} с")
    for e in errs:
        print("ОШИБКА  " + e)
    for w in warns:
        print("замечание  " + w)
    print("итог: " + ("есть ошибки — до показа исправить" if errs else "ошибок нет"))
    sys.exit(1 if errs else 0)
