"""Проверка готового ролика перед сдачей — то, что можно мерить кодом, без глаз.

  python3 -I proverka.py ВИДЕО.mp4 [--src ПАПКА_src]

Что ловит:
  ОШИБКА  дешёвые звуки в public/sfx и public/pak ролика: яркий тональный звон (колокольчик, монетка, shimmer);
  ОШИБКА  клип в public/clips не в частоте ролика (HeyGen 25 к/с при ролике 30) — кадры повторяются, лицо дёргается;
  ОШИБКА  в сценах меньше 3 приёмов ядра трендового монтажа (разбор 22 эталонов 25.10: мелкое+огромное, слово из размытия,
          отъезд-склейка, текст за спикером, пример-вырезка вперёд, вспышка со свушем) — Бобби 27.11;
  ОШИБКА  нет плана монтажа src/plan.json или он не проходит plan.py proverka (Бобби 27.11: сначала план, потом сцены);
  ОШИБКА  лицо аватара застыло (freezedetect по области лица у каждого куска из src/litso.json, порог 0,12 с) — обычно стык
          «лицо → Б-ролл»: клип дотянут стоп-кадром или переход держит лицо дольше живого клипа (Бобби 26.11, ролик 74);
  замечание  громкость ролика не −14 LUFS ±1 или true peak выше −1 dBFS;
  + tekst.py (аудит 24.11): ОШИБКА текст под интерфейсом Instagram, стоп-кадр перед концовкой; замечания — мелкий текст,
    дубль плашки и субтитра, чужой текст/вотермарка, исходник растянут больше чем в 1,5 раза.
Ритм и «мёртвые кадры» здесь не меряем: пороги из свода 765 роликов отозваны 26.11.2026 (Бобби: эталоны негодные).
Новые пороги — только из ручных эталонов Бобби, разобранных покадрово (референсы/ручной-отбор).
src ищется сам: рядом с видео (движок/src) или ./src. deliver.py вызывает проверку перед сдачей: при ОШИБКАХ ролик не сдаётся.
"""
import json, pathlib, re, subprocess, sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))  # tekst.py рядом; при python3 -I папка скрипта не в пути
LUFS, TRUE_PEAK = -14.0, -1.0  # правило сдачи (deliver.py)


def najti_src(video, src):
    if src:
        return pathlib.Path(src)
    v = pathlib.Path(video).resolve()
    for c in (v.parent / "движок" / "src", v.parent.parent / "движок" / "src", pathlib.Path.cwd() / "src", v.parent / "src"):
        if (c / "recept.json").exists():
            return c
    return None


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


def fps_of(path):
    """частота кадров видеопотока (r_frame_rate), 0 — не удалось"""
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", str(path)],
                       capture_output=True, text=True)
    try:
        a, _, b = r.stdout.strip().partition("/")
        return float(a) / float(b or 1)
    except (ValueError, ZeroDivisionError):
        return 0.0


def dlitelnost(video):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video], capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


def zamerzaniya(video, src):
    """Застывания лица: freezedetect по центру кадра (лицо) в окне каждого куска litso.json [start; end + 0,5]."""
    lj = src / "litso.json" if src else None
    if not lj or not lj.exists():
        return []
    try:
        kuski = json.loads(lj.read_text(encoding="utf-8"))
    except Exception:
        return []
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(video), "-an", "-vf",
                        "crop=iw*0.30:ih*0.22:iw*0.35:ih*0.18,scale=320:-2,freezedetect=n=-58dB:d=0.12", "-f", "null", "-"],
                       capture_output=True, text=True).stderr
    st = [float(x) for x in re.findall(r"freeze_start: ([\d.]+)", r)]
    en = [float(x) for x in re.findall(r"freeze_end: ([\d.]+)", r)]
    out = []
    konec = dlitelnost(str(video))
    for a, b in zip(st, en + [konec] * (len(st) - len(en))):
        if b <= 0.2:  # первые кадры — обложка, её вшивает deliver.py (ложная ошибка у любого ролика, 74 27.11)
            continue
        for k in kuski:
            if a < k["end"] + 0.5 and b > k["start"]:
                out.append(f"лицо {k['id']} застыло {a:.2f}–{b:.2f} с ({b - a:.2f} с; кусок {k['start']:.2f}–{k['end']:.2f}, "
                           f"живой до {k['start'] + k.get('live', k['end'] - k['start']):.2f}) — уходить из лица по kit/litso vyhod(), клип не дотягивать (kuski.py)")
                break
    return out


# Ядро трендового монтажа — разбор 22 эталонов Бобби 25.10 (../референсы/trend-montage/РАЗБОР.md), детали kit/trend.tsx.
# Ролики 60–74 ставили почти только Flash (Бобби 27.11: «разбирали, а самое важное ты не применяешь»).
YADRO = {"BigSmall": "мелкое + огромное (смешанные шрифты, ключевое жирным)", "BlurWords": "слово из размытия",
         "PullIn": "отъезд-склейка", "BehindText": "текст за спикером", "PopForward": "пример-вырезка вылетает вперёд",
         "Flash": "вспышка-переход со свушем", "PushCut": "толчок в склейку (свод 27.11)"}
YADRO_MIN = 3
DEMO = {"TrendDemo.tsx", "Varianty.tsx", "NovoeDemo.tsx", "KartaDemo.tsx", "Root.tsx", "Cover.tsx", "Povtor.tsx"}


def tryuki(src):
    """сколько приёмов ядра реально стоит в сценах ролика; Title с рецептом tekst=blur считается словом из размытия"""
    if not src:
        return []
    txt = " ".join(f.read_text(encoding="utf-8", errors="ignore") for f in src.glob("*.tsx") if f.name not in DEMO)
    est = {n for n in YADRO if re.search(r"<" + n + r"\b", txt)}
    try:
        if json.loads((src / "recept.json").read_text(encoding="utf-8"))["pick"].get("tekst") in ("blur", "rise", "fast") and "<Title" in txt:
            est.add("BlurWords")
        if any(x in ("dive", "pull") for x in json.loads((src / "recept.json").read_text(encoding="utf-8"))["pick"].get("perehody", [])):
            est.add("PullIn")
        if "push" in json.loads((src / "recept.json").read_text(encoding="utf-8"))["pick"].get("perehody", []) and "<Shots" in txt:
            est.add("PushCut")
    except Exception:
        pass
    if len(est) >= YADRO_MIN:
        return []
    net = [f"{n} — {YADRO[n]}" for n in YADRO if n not in est]
    return [f"трендовых приёмов ядра {len(est)} из {YADRO_MIN} нужных (стоят: {', '.join(sorted(est)) or 'ничего'}). "
            f"Добавить из kit/trend.tsx: " + "; ".join(net)]


def proverit(video, src=None):
    src = najti_src(video, src)
    errs, warns = [], []
    dur = dlitelnost(video)

    if src:
        pub = src.parent / "public"
        kod = " ".join(f.read_text(encoding="utf-8", errors="ignore") for f in src.rglob("*.ts*"))
        for wav in sorted(list(pub.glob("sfx/*.wav")) + list(pub.glob("pak/**/*.wav"))):
            if f'"{wav.stem}"' not in kod and wav.name not in kod and "pak" not in wav.parts:
                continue  # лежит, но в ролике не звучит
            cen, ton, ring = harakter(wav)
            if cen > 2000 and ton > 0.85 and ring > 0.5:
                errs.append(f"дешёвый звук {wav.relative_to(pub)}: звенит {ring:.2f} с, яркость {cen:.0f} Гц (колокольчик/шиммер) — "
                            f"заменить на удар, бас, щелчок или фоли (pak.py find удар)")

    lufs, peak = gromkost(video)
    if lufs is not None and abs(lufs - LUFS) > 1.0:
        warns.append(f"громкость {lufs:.1f} LUFS, норма {LUFS:.0f} ±1 (deliver.py выровняет)")
    if peak is not None and peak > TRUE_PEAK:
        warns.append(f"true peak {peak:.1f} dBFS выше {TRUE_PEAK:.0f} — на телефоне будет клип (deliver.py выровняет)")
    # частота кусков видео ≠ частоте ролика (HeyGen отдаёт 25 к/с, ролик 30) — каждый 6-й кадр повторяется, лицо дёргается
    # (ролик 68, 24.11.2026). Чинить: ffmpeg -vf "minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1"
    if src and (src.parent / "public" / "clips").is_dir():
        fps_v = fps_of(video)
        for clip in sorted((src.parent / "public" / "clips").glob("*.mp4")):
            f = fps_of(clip)
            if fps_v and f and abs(f - fps_v) > 0.5:
                errs.append(f"клип {clip.name}: {f:g} к/с, а ролик {fps_v:g} — кадры повторяются, движение дёргается. Перегнать: "
                            f'ffmpeg -i {clip.name} -vf "minterpolate=fps={fps_v:g}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1" …')
    errs += zamerzaniya(video, src)
    errs += tryuki(src)
    if src:  # план монтажа до сцен — обязателен (plan.py, Бобби 27.11): нет или с ошибками — ролик не сдаётся
        import plan
        pe, pw = plan.proverit(src)
        errs += ["план: " + e for e in pe]
        warns += ["план: " + w for w in pw]
    # то, что kritik ловил глазами в каждом ролике (аудит 24.11): безопасные зоны, стоп-кадр у концовки, дубли, чужой текст, мыло
    import tekst
    e2, w2 = tekst.proverit_tekst(video, src, dur)
    errs += e2
    warns += w2
    return errs, warns, dur


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a or a[0].startswith("-"):
        sys.exit(__doc__)
    opt = lambda n: a[a.index(n) + 1] if n in a else None
    errs, warns, dur = proverit(a[0], opt("--src"))
    print(f"ролик {dur:.1f} с")
    for e in errs:
        print("ОШИБКА  " + e)
    for w in warns:
        print("замечание  " + w)
    print("итог: " + ("есть ошибки — до показа исправить" if errs else "ошибок нет"))
    sys.exit(1 if errs else 0)
