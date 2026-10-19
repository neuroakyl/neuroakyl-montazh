"""Общее для инструментов: корень репозитория, ключи из .env, рабочие программы.

Ключи берутся из окружения или из .env в корне репозитория (в Git не попадает).
Библиотека звуков и музыки — в MONTAZH_LIB (из local.md/.env), по умолчанию <репозиторий>/библиотека (в Git не попадает).
"""
import os, pathlib, shutil

ROOT = pathlib.Path(__file__).resolve().parent.parent


def _read(f):
    for line in f.read_text().splitlines():
        line = line.split("#", 1)[0].strip()
        if "=" in line:
            k, v = (x.strip() for x in line.split("=", 1))
            if v and not os.environ.get(k):
                os.environ[k] = v


def load_env():
    """.env корня; строка ENV_FILES=путь1:путь2 подключает ключи из уже существующих .env (не дублировать ключи)."""
    f = ROOT / ".env"
    if f.exists():
        _read(f)
        for extra in os.environ.get("ENV_FILES", "").split(":"):
            e = pathlib.Path(extra).expanduser()
            if extra and e.exists():
                _read(e)


def key(name):
    load_env()
    v = os.environ.get(name, "").strip()
    if not v:
        raise SystemExit(f"нет ключа {name}: впиши его в {ROOT / '.env'} (образец — .env.example)")
    return v


def lib():
    load_env()
    return pathlib.Path(os.environ.get("MONTAZH_LIB") or ROOT / "библиотека").expanduser()


def ytdlp():
    p = ROOT / ".venv" / "bin" / "yt-dlp"
    return str(p) if p.exists() else (shutil.which("yt-dlp") or "yt-dlp")


def cookies():
    load_env()
    c = os.environ.get("YT_COOKIES", "").strip()
    return os.path.expanduser(c) if c else None
