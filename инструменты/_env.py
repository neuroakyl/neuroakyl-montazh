"""Общее для инструментов: корень репозитория, ключи из .env, рабочие программы.

Ключи берутся из окружения, из .env в корне репозитория (в Git не попадает) и из общего файла ключей ~/.claude/.env
(пакет «Умный Claude» и контент-завод держат все ключи там). Уже заданное раньше не перезаписывается.
Библиотека звуков и музыки — в MONTAZH_LIB (из local.md/.env), по умолчанию <репозиторий>/библиотека (в Git не попадает).
"""
import os, pathlib, platform, shutil

ROOT = pathlib.Path(__file__).resolve().parent.parent
OBSHCHIE = pathlib.Path.home() / ".claude" / ".env"
WIN = platform.system() == "Windows"
VENV_BIN = ROOT / ".venv" / ("Scripts" if WIN else "bin")


def _read(f):
    for line in f.read_text(encoding="utf-8-sig").splitlines():
        line = line.split("#", 1)[0].strip()
        if "=" in line:
            k, v = (x.strip() for x in line.split("=", 1))
            if v and not os.environ.get(k):
                os.environ[k] = v


def load_env():
    """.env корня, потом ~/.claude/.env; строка ENV_FILES=путь1<разделитель>путь2 подключает ещё файлы
    (разделитель — «:» на Mac, «;» на Windows, как в PATH)."""
    for f in (ROOT / ".env", OBSHCHIE):
        if f.exists():
            _read(f)
    for extra in os.environ.get("ENV_FILES", "").split(os.pathsep):
        e = pathlib.Path(extra).expanduser()
        if extra and e.exists():
            _read(e)


def env_file():
    """Куда скрипту дописывать найденное (например TELEGRAM_CHAT_ID): .env движка, если он есть, иначе общий."""
    return ROOT / ".env" if (ROOT / ".env").exists() else OBSHCHIE


def key(name):
    load_env()
    v = os.environ.get(name, "").strip()
    if not v:
        raise SystemExit(f"нет ключа {name}: впиши его строкой {name}=… в {OBSHCHIE} (или в .env движка)")
    return v


def lib():
    load_env()
    return pathlib.Path(os.environ.get("MONTAZH_LIB") or ROOT / "библиотека").expanduser()


def ytdlp():
    # YTDLP — свой yt-dlp, если в .venv старый (на Python 3.9 он не обновляется, YouTube отвечает «page needs to be reloaded»)
    load_env()
    if os.environ.get("YTDLP", "").strip():
        return os.path.expanduser(os.environ["YTDLP"].strip())
    p = VENV_BIN / ("yt-dlp.exe" if WIN else "yt-dlp")
    return str(p) if p.exists() else (shutil.which("yt-dlp") or "yt-dlp")


def cookies():
    load_env()
    c = os.environ.get("YT_COOKIES", "").strip()
    return os.path.expanduser(c) if c else None


def samoobnovlenie(chasov=12):
    """Автообновление движка у всех (Бобби 27.11.2026: «пускай у учеников автоматически обновится»): раз в `chasov` часов
    тихий `git pull --ff-only` в папке навыка. Без сети, без git или с правками в навыке — молча пропускает, ролик не ломает.
    Зовут recept.py и etalon.py (начало каждого монтажа и разбора). Отключить: MONTAZH_NO_UPDATE=1."""
    import subprocess, time
    load_env()
    if os.environ.get("MONTAZH_NO_UPDATE") or not (ROOT / ".git").exists() or not shutil.which("git"):
        return
    metka = ROOT / ".obnovleno"
    try:
        if metka.exists() and time.time() - metka.stat().st_mtime < chasov * 3600:
            return
        metka.touch()
        do = subprocess.run(["git", "-C", str(ROOT), "rev-parse", "HEAD"], capture_output=True, text=True, timeout=10).stdout.strip()
        r = subprocess.run(["git", "-C", str(ROOT), "pull", "--ff-only", "-q"], capture_output=True, text=True, timeout=40)
        posle = subprocess.run(["git", "-C", str(ROOT), "rev-parse", "HEAD"], capture_output=True, text=True, timeout=10).stdout.strip()
        if r.returncode == 0 and do and posle != do:
            izm = subprocess.run(["git", "-C", str(ROOT), "diff", "--name-only", do, posle], capture_output=True, text=True, timeout=10).stdout
            print("движок монтажа обновлён с GitHub" + (" — изменились пакеты: запусти `python3 install.py`" if "package.json" in izm else ""))
    except Exception:
        pass
