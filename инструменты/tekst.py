"""Автопроверка того, что kritik ловил глазами в каждом ролике (аудит 24.11.2026, ролики 60–69).

  python3 -I tekst.py ВИДЕО.mp4 [--src ПАПКА_src]      — отдельно; proverka.py (и deliver.py) зовёт сам

Текст в кадре читает macOS Vision (tekst.swift, собирается сам). Ловит:
  ОШИБКА     текст под интерфейсом Instagram: низ ближе 380 px, верх выше 220 px, справа под кнопками (ремесло.md §7)
  ОШИБКА     стоп-кадр перед концовкой: картинка застыла на стыке с концовкой (память avatar-no-freeze-before-cta)
  замечание  мелкий текст (не прочитать с телефона)
  замечание  дубль текста: плашка повторяет субтитр в том же кадре
  замечание  чужой текст: слова, которых нет ни в сценарии, ни в коде ролика (вотермарка, титры исходника)
  замечание  Б-ролл (видео) на весь кадр растянется больше чем в 1,5 раза — мыло
Подписи карт (© OpenStreetMap, Esri, Maxar) не считаются: их обязаны показывать.
Только тело ролика: концовка — готовый ролик со своей проверкой.
"""
import difflib, json, pathlib, platform, re, subprocess, sys

HERE = pathlib.Path(__file__).resolve().parent
SWIFT, BIN = HERE / "tekst.swift", HERE / ".tekst-bin"
SHAG = 0.5  # с между кадрами
NIZ, VERH, PRAVO = 380, 220, 130  # px при 1080×1920
MELKIY = 24  # px высоты строки: ниже — с телефона не читается
PODPISI = ("©", "OPENSTREETMAP", "ESRI", "MAXAR", "EARTHSTAR", "GEOGRAPHICS", "УЧАСТНИКИ", "ГРАНИЦЫ")
LAT = str.maketrans("ABCEHKMOPTXYacekmopxyÑñ", "АВСЕНКМОРТХУАСЕКМОРХУЙЙ")
KG = str.maketrans("ҢӨҮЁ", "НОУЕ")


def norm(s):
    return s.upper().translate(LAT).upper().translate(KG)


def slova(s):
    return re.findall(r"[А-ЯA-Z]{4,}", norm(s))


def ocr(video, shag=SHAG):
    if platform.system() != "Darwin":
        return None
    if not BIN.exists() or BIN.stat().st_mtime < SWIFT.stat().st_mtime:
        subprocess.run(["swiftc", "-O", str(SWIFT), "-o", str(BIN)], check=True, capture_output=True)
    r = subprocess.run([str(BIN), str(video), str(shag)], capture_output=True, text=True)
    return json.loads(r.stdout) if r.returncode == 0 and r.stdout.strip() else None


def konec_tela(src, dur):
    """Конец последнего слова (тело ролика); без words.json — длина минус концовка ≈ 11,5 с."""
    try:
        w = json.loads((src / "words.json").read_text(encoding="utf-8"))
        w = w.get("words", w) if isinstance(w, dict) else w
        return float(w[-1]["end"])
    except Exception:
        return max(0.0, dur - 11.5)


def slovar(src):
    if not src:
        return set()
    kod = " ".join(f.read_text(encoding="utf-8", errors="ignore") for f in src.rglob("*") if f.suffix in (".ts", ".tsx", ".json"))
    return set(slova(kod)) | set(slova(kod.replace("-", "")))  # «Ысык-Ата» OCR читает и слитно


def podryad(hits, shag=SHAG):
    """{ключ: [t…]} → только то, что держится ≥2 кадров подряд; ключ → (от, до)."""
    out = {}
    for k, ts in hits.items():
        ts = sorted(set(ts))
        for a, b in zip(ts, ts[1:]):
            if b - a <= shag * 1.5:
                lo, hi = out.get(k, (a, b))
                out[k] = (min(lo, a), max(hi, b))
    return out


def stop_kadr(video, t0, t1):
    """Сколько секунд картинка стоит намертво в окне [t0, t1]."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-ss", f"{max(0, t0):.2f}", "-t", f"{t1 - t0:.2f}", "-i", str(video), "-an",
                        "-vf", "freezedetect=n=0.002:d=0.3", "-f", "null", "-"], capture_output=True, text=True).stderr
    return sum(float(x) for x in re.findall(r"freeze_duration: ([\d.]+)", r))


def ishodniki(src, W, H):
    out = []
    if not src:
        return out
    pub = src.parent / "public"
    kod = " ".join(f.read_text(encoding="utf-8", errors="ignore") for f in src.rglob("*") if f.suffix in (".ts", ".tsx", ".json"))
    for f in sorted(pub.rglob("*")):
        if f.suffix.lower() not in (".mp4", ".mov", ".webm") or f.name.startswith(("end-", "av")):  # Б-роллы; картинки часто мелкие
            continue
        if any(p in f.parts for p in ("fonts", "cover", "sfx")) or (f.name not in kod and f.stem not in kod):
            continue
        r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", str(f)],
                           capture_output=True, text=True).stdout.strip().split(",")
        try:
            w, h = int(r[0]), int(r[1])
        except (ValueError, IndexError):
            continue
        k = max(W / w, H / h)
        if k > 1.5:
            out.append(f"Б-ролл {f.relative_to(pub)} {w}×{h}: если на весь кадр — растянут в {k:.1f} раза, мыло. "
                       f"Взять крупнее (4K) или ставить в рамку/на размытый фон")
    return out


def proverit_tekst(video, src=None, dur=None):
    errs, warns = [], []
    d = ocr(video)
    if d is None:
        return errs, ["текст в кадре не проверен: нужен macOS (Vision)"]
    W, H = d["w"], d["h"]
    s = H / 1920
    konec = konec_tela(src, d["dur"]) if src else d["dur"] - 11.5
    vocab = slovar(src)
    svoy = {}

    def nash(slovo):
        if slovo not in svoy:
            svoy[slovo] = slovo in vocab or bool(difflib.get_close_matches(slovo, vocab, n=1, cutoff=0.75))
        return svoy[slovo]

    zona, melk, dubl, chuzh = {}, {}, {}, {}
    for fr in d["frames"]:
        t = fr["t"]
        if t > konec + 0.2:
            break
        boxes = [b for b in fr["boxes"] if b[5] >= 0.5 and b[4] >= 14 * s and not any(norm(p) in norm(b[0]) for p in PODPISI)
                 and re.search(r"[А-ЯA-Z0-9]{2,}", norm(b[0]))
                 and not (b[2] > H - 70 * s and b[4] < 30 * s)]  # полоска подписей карты у самого низа
        for txt, x, y, w, h, c in boxes:
            k = norm(txt).strip()
            if y + h > H - NIZ * s:
                zona.setdefault(("низ", k, f"низ строки {y + h:.0f} px, а можно до {H - NIZ * s:.0f}"), []).append(t)
            if y < VERH * s:
                zona.setdefault(("верх", k, f"верх строки {y:.0f} px, а можно от {VERH * s:.0f}"), []).append(t)
            if x + w > W - PRAVO * s and y + h > H * 0.45:
                zona.setdefault(("справа", k, f"заходит под кнопки справа (край {x + w:.0f} px из {W:.0f})"), []).append(t)
            if h < MELKIY * s and c >= 0.6:
                melk.setdefault(k, []).append(t)
            for sl in slova(txt):
                if vocab and not nash(sl):
                    chuzh.setdefault(sl, []).append(t)
        for i, a in enumerate(boxes):
            for b in boxes[i + 1:]:
                if abs((a[2] + a[4] / 2) - (b[2] + b[4] / 2)) < max(a[4], b[4]):
                    continue  # одна строка
                na, nb = "".join(slova(a[0])), "".join(slova(b[0]))
                if len(na) >= 4 and len(nb) >= 4 and difflib.SequenceMatcher(None, na, nb).ratio() >= 0.85:
                    dubl.setdefault(min(na, nb), []).append(t)

    po_zone = {}
    for (kak, k, pochemu), (a, b) in podryad(zona).items():
        po_zone.setdefault(kak, []).append((a, b, k, pochemu))
    for kak, spisok in po_zone.items():
        spisok.sort()
        primer = "; ".join(f"{a:.1f}–{b:.1f} с «{k[:30]}» ({p})" for a, b, k, p in spisok[:3])
        errs.append(f"текст под интерфейсом Instagram ({kak}), {len(spisok)} раз: {primer}"
                    f"{' …' if len(spisok) > 3 else ''} — поднять/сдвинуть (ремесло.md §7)")
    m = podryad(melk)
    if m:
        warns.append("мелкий текст, с телефона не прочитать: " + "; ".join(f"{a:.1f} с «{k[:25]}»" for k, (a, b) in sorted(m.items(), key=lambda x: x[1])[:4]))
    m = podryad(dubl)
    if m:
        warns.append("дубль текста — плашка повторяет субтитр в том же кадре: " +
                     "; ".join(f"{a:.1f}–{b:.1f} с «{k[:20]}»" for k, (a, b) in sorted(m.items(), key=lambda x: x[1])[:4]))
    m = podryad(chuzh)
    if m:
        warns.append("чужой текст (нет в сценарии и коде — вотермарка, титры исходника?): " +
                     "; ".join(f"{a:.1f}–{b:.1f} с «{k}»" for k, (a, b) in sorted(m.items(), key=lambda x: x[1])[:5]))

    zastyl = stop_kadr(video, konec - 1.0, konec + 0.8)
    if zastyl >= 0.5:
        errs.append(f"стоп-кадр перед концовкой: картинка стоит {zastyl:.1f} с у стыка ({konec:.1f} с) — лицо кончилось раньше тела. "
                    f"Концовку раньше или кусок лица длиннее (память avatar-no-freeze-before-cta)")
    elif zastyl >= 0.3:
        warns.append(f"у стыка с концовкой картинка стоит {zastyl:.1f} с — глянуть по кадрам")
    warns += ishodniki(src, W, H)
    return errs, warns


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a or a[0].startswith("-"):
        sys.exit(__doc__)
    sys.path.insert(0, str(HERE))
    import proverka  # noqa: E402
    src = proverka.najti_src(a[0], a[a.index("--src") + 1] if "--src" in a else None)
    e, w = proverit_tekst(a[0], src)
    for x in e:
        print("ОШИБКА  " + x)
    for x in w:
        print("замечание  " + x)
    print("итог: " + ("есть ошибки" if e else "ошибок нет"))
    sys.exit(1 if e else 0)
