#!/usr/bin/env python3
"""Эталон монтажа по ссылке — всё сырьё для покадрового разбора одной командой (Бобби 27.11.2026: «по умолчанию, у всех так»).

  <движок>/.venv/bin/python -I инструменты/etalon.py ССЫЛКА [ССЫЛКА …] [--stil "подпись автора"] [--papka ПАПКА]

Для каждой ссылки (Pinterest, YouTube/Shorts, TikTok, Instagram — что берёт yt-dlp; Instagram может требовать куки):
  1. папка NN-<id>/ в папке эталонов (номер продолжает список), original.mp4;
  2. ролик до 3 мин → razbor12.py: замер склеек/вспышек/звука, слова, листы КАЖДОГО кадра (kadry/), обзор 2 к/с;
     длиннее 3 мин → «урок»: субтитры YouTube (subs.*.vtt) + обзор, кадры берутся точечно при разборе;
  3. zvuk_etalona.py — звук словами (Gemini слушает только звук; нет ключа — шаг пропускается, разбор идёт по замеру);
  4. строка в список.md.
Дальше — разбор по `разбор-эталона.md` (корень навыка): вердикт «трендовый или обычный», приёмы в числах, перенос в kit,
повтор рядом с оригиналом. Папка эталонов: --papka, иначе ../референсы/ручной-отбор (раскладка автора), иначе <навык>/эталоны.
"""
import json, pathlib, re, subprocess, sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
import _env  # noqa: E402

PY = str(_env.VENV_BIN / ("python.exe" if _env.WIN else "python"))
UROK_S = 180


def papka_etalonov(arg):
    if arg:
        return pathlib.Path(arg).expanduser().resolve()
    avtor = ROOT.parent / "референсы" / "ручной-отбор"
    return avtor if avtor.is_dir() else ROOT / "эталоны"


def vid_id(url):
    m = re.search(r"(?:pin/|shorts/|v=|youtu\.be/|video/|reel/|p/)([\w-]{6,})", url)
    return m.group(1) if m else re.sub(r"\W+", "", url)[-12:]


def sled_nomer(root):
    n = [int(p.name[:2]) for p in root.glob("[0-9][0-9]-*") if p.is_dir()]
    return max(n, default=0) + 1


def ytdlp(args):
    base = [_env.ytdlp(), "-q", "--no-warnings"]
    c = _env.cookies()
    if c and pathlib.Path(c).exists():
        base += ["--cookies", c]
    return subprocess.run(base + args, capture_output=True, text=True)


def dlina(url):
    r = ytdlp(["--skip-download", "--print", "%(duration)s", url])
    try:
        return float(r.stdout.strip().splitlines()[-1])
    except Exception:
        return 0.0


def stroka_spiska(root, n, url, stil, status):
    s = root / "список.md"
    if not s.exists():
        s.write_text("# Эталоны монтажа — список автора\n\n| № | ссылка | стиль | статус |\n|---|---|---|---|\n", encoding="utf-8")
    with s.open("a", encoding="utf-8") as f:
        f.write(f"| {n:02d} | {url} | {stil} | {status} |\n")


def odin(root, url, stil):
    n = sled_nomer(root)
    d = root / f"{n:02d}-{vid_id(url)}"
    d.mkdir(parents=True, exist_ok=True)
    dur = dlina(url)
    urok = dur > UROK_S
    fmt = "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080]/bv*+ba/b"
    r = ytdlp(["-f", fmt, "--merge-output-format", "mp4", "-o", str(d / "original.%(ext)s"), url])
    if not (d / "original.mp4").exists():
        (d / "dl.log").write_text(r.stdout + r.stderr, encoding="utf-8")
        stroka_spiska(root, n, url, stil, "не скачалось (dl.log)")
        return f"{d.name}: НЕ СКАЧАЛОСЬ — {(r.stderr or r.stdout).strip()[-160:]}"
    if urok:
        ytdlp(["--skip-download", "--write-auto-subs", "--write-subs", "--sub-langs", "ru.*,en.*", "--sub-format", "vtt", "-o", str(d / "subs"), url])
        subprocess.run([PY, "-I", str(HERE / "razbor12.py"), str(d / "original.mp4"), "--fps", "1", "--whisper", "none"], capture_output=True)
        stroka_spiska(root, n, url, stil or "урок", "сырьё готово (урок): субтитры + обзор")
        return f"{d.name}: урок {dur / 60:.0f} мин — субтитры и обзор готовы"
    r = subprocess.run([PY, "-I", str(HERE / "razbor12.py"), str(d / "original.mp4")], capture_output=True, text=True)
    itog = (r.stdout.strip().splitlines() or ["замер не прошёл: " + r.stderr[-200:]])[-1]
    z = subprocess.run([PY, "-I", str(HERE / "zvuk_etalona.py"), str(d)], capture_output=True, text=True)
    zv = "звук разобран" if (d / "zvuk.md").exists() else "звук не разобран (нет ключа Gemini или лимит) — только замер"
    stroka_spiska(root, n, url, stil or "—", "сырьё готово, ждёт разбора")
    return f"{d.name}: {itog.split(': ', 1)[-1].split(' → ')[0]}; {zv}"


def main():
    a = sys.argv[1:]
    if not a or a[0] in ("-h", "--help"):
        sys.exit(__doc__)
    opt = lambda n: a[a.index(n) + 1] if n in a else None
    skip = {i + 1 for i, x in enumerate(a) if x in ("--stil", "--papka")}
    urls = [x for i, x in enumerate(a) if x.startswith("http") and i not in skip]
    root = papka_etalonov(opt("--papka"))
    root.mkdir(parents=True, exist_ok=True)
    for u in urls:
        print(odin(root, u, opt("--stil") or ""), flush=True)
    print(f"\nПапка эталонов: {root}\nДальше — разбор каждого по {ROOT / 'разбор-эталона.md'}")


if __name__ == "__main__":
    main()
