"""Установка движка монтажа — Mac и Windows, без прав администратора. Запускает Claude Code (см. УСТАНОВКА.md).

  python3 install.py            библиотеки анимаций целиком (~0,5 ГБ)
  python3 install.py --light    только проверенные нужные файлы (~90 МБ)

Всё ставится внутрь папки движка, в .venv/: Python-пакеты (yt-dlp, fonttools), ffmpeg (static-ffmpeg),
Node.js (nodeenv), пакеты Remotion в шаблон/. Повторный запуск безопасен: доставляет недостающее, ничего не удаляет.
"""
import os, pathlib, platform, shutil, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent
WIN = platform.system() == "Windows"
VENV = ROOT / ".venv"
BIN = VENV / ("Scripts" if WIN else "bin")
EXE = ".exe" if WIN else ""
LIGHT = "--light" in sys.argv
fails = []


def ok(msg): print(f"  ✓ {msg}", flush=True)
def bad(msg): print(f"  ✗ {msg}", flush=True); fails.append(msg)
def run(cmd, **kw): return subprocess.run([str(c) for c in cmd], **kw)


def env():
    e = dict(os.environ)
    e["PATH"] = str(BIN) + os.pathsep + e.get("PATH", "")
    e["VIRTUAL_ENV"] = str(VENV)
    return e


print("1. Программы")
git = shutil.which("git")
ok(f"git") if git else bad("нет git: Mac — выполнить `xcode-select --install` и нажать «Установить»; Windows — `winget install --id Git.Git -e`")
ok(f"python {platform.python_version()}")
if sys.version_info < (3, 9):
    bad("нужен Python 3.9 или новее")
if fails:
    sys.exit("Поставь недостающее и запусти install.py ещё раз.")

print("2. Окружение движка (.venv/: Python-пакеты, ffmpeg, Node.js)")
if not (BIN / f"python{EXE}").exists():
    run([sys.executable, "-m", "venv", VENV], check=True)
py = BIN / f"python{EXE}"
run([py, "-m", "pip", "install", "-q", "--upgrade", "pip"], check=True)
run([py, "-m", "pip", "install", "-q", "--upgrade", "yt-dlp", "fonttools", "static-ffmpeg", "nodeenv"], check=True)
ok("yt-dlp, fonttools")
# ffmpeg: static-ffmpeg качает сборку под систему; кладём ffmpeg/ffprobe рядом с python, чтобы они были в PATH окружения
out = run([BIN / f"static_ffmpeg_paths{EXE}"], capture_output=True, text=True, env=env()).stdout
paths = dict(line.split("=", 1) for line in out.splitlines() if "=" in line)
for name in ("ffmpeg", "ffprobe"):
    src, dst = pathlib.Path(paths.get(name.upper(), "")), BIN / f"{name}{EXE}"
    if src.exists():
        if dst.exists() or dst.is_symlink():
            dst.unlink()
        shutil.copy2(src, dst)
ok("ffmpeg") if (BIN / f"ffmpeg{EXE}").exists() else bad("ffmpeg не поставился (static-ffmpeg)")
# Node.js внутрь .venv (nodeenv, готовая сборка с nodejs.org)
node = BIN / ("node.exe" if WIN else "node")
if not node.exists() and not (VENV / "Scripts" / "node.exe").exists():
    run([BIN / f"nodeenv{EXE}", "-p", "--prebuilt", "--node=22.12.0"], check=True, env=env())
ok(f"Node.js {run(['node', '-v'], capture_output=True, text=True, env=env()).stdout.strip()}")

print("3. Движок (Remotion — шаблон/node_modules)")
npm = shutil.which("npm", path=env()["PATH"]) or "npm"
r = run([npm, "install", "--no-audit", "--no-fund", "--loglevel=error"], cwd=ROOT / "шаблон", env=env())
ok("Remotion") if r.returncode == 0 else bad("npm install в шаблон/ не прошёл")

print("4. Библиотеки анимаций (внешнее/)" + (" — лёгкая версия" if LIGHT else " — целиком"))
for line in (ROOT / "внешнее" / "ИСТОЧНИКИ.tsv").read_text(encoding="utf-8").splitlines():
    if not line.strip() or line.startswith("#"):
        continue
    d, url, commit = line.split("\t")[:3]
    dest = ROOT / "внешнее" / d
    if dest.exists() and not (dest / ".git").exists():
        ok(f"{d} — уже лежит"); continue
    head = run(["git", "-C", dest, "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip() if dest.exists() else ""
    if head == commit:
        ok(f"{d} — уже стоит"); continue
    dest.mkdir(parents=True, exist_ok=True)
    g = lambda *a, **kw: run(["git", "-C", dest, *a], capture_output=True, text=True, **kw)
    g("init", "-q")
    if g("remote", "add", "origin", url).returncode:
        g("remote", "set-url", "origin", url)
    if LIGHT:
        g("sparse-checkout", "set", "--no-cone", "--stdin", input=(ROOT / "внешнее" / "пути" / f"{d}.txt").read_text(encoding="utf-8"))
        filt = ["--filter=blob:none"]
    else:
        g("sparse-checkout", "disable")
        filt = []
    if g("fetch", "-q", "--depth", "1", *filt, "origin", commit).returncode == 0 and g("checkout", "-q", "FETCH_HEAD").returncode == 0:
        ok(f"{d} @ {commit[:7]}")
    else:
        bad(f"{d}: не скачался {url}")

print("5. Личные настройки")
for src, dst in (("local.example.md", "local.md"), (".env.example", ".env")):
    if not (ROOT / dst).exists():
        shutil.copy(ROOT / src, ROOT / dst); ok(f"создан {dst}")
    else:
        ok(f"{dst} уже есть")
run(["git", "-C", ROOT, "config", "core.hooksPath", ".githooks"], capture_output=True)
ok("проверка коммитов на ключи и личные данные")

print()
if fails:
    print("Есть ошибки:\n  " + "\n  ".join(fails)); sys.exit(1)
print("Готово. Команды движка запускать через окружение: " + ("`.venv\\Scripts\\activate`" if WIN else "`source .venv/bin/activate`") + ".")
