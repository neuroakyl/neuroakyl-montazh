#!/usr/bin/env python3
"""Пак монтажёра: звуки, засветки, переходы, элементы, текстуры, Lottie-анимации, шрифты.

Файлы мы не раздаём: пак/пак.json — это список ссылок на ОРИГИНАЛЬНЫЕ источники (Freesound, Kenney, Pixabay, Wikimedia,
LottieFiles, Google Fonts, YouTube…) и рецепт обработки. Эта программа скачивает их к тебе и обрабатывает.
Mac и Windows, Python 3.9+, без лишних пакетов; ffmpeg и yt-dlp — из .venv движка (их ставит install.py) или системные.

  python3 инструменты/pak.py list                          наборы: сколько файлов, сколько весят, что уже стоит
  python3 инструменты/pak.py install --light               отборные ~370 МБ: лучшее из каждой категории
  python3 инструменты/pak.py install                       все наборы, кроме yt (≈ 2,3 ГБ)
  python3 инструменты/pak.py install звуки lottie          только эти наборы
  python3 инструменты/pak.py install yt                    зелёные экраны с YouTube (качает yt-dlp, долго)
  python3 инструменты/pak.py find вжух --set звуки         поиск по тегам и названиям
  python3 инструменты/pak.py find зелёный --alpha          только прозрачные
  python3 инструменты/pak.py take snd-1a2b3c … --to путь/к/public    скопировать выбранное в public/pak/ ролика

Установка идёт в внешнее/пак/ (в Git не попадает; поменять место: --dest). Повторный запуск докачивает недостающее и ничего
не качает заново. В конце появляются каталог.json (что стоит, с тегами и pik_ms) и АВТОРЫ.md (кого указывать по лицензии).
ВАЖНО: весь пак в public шаблона не класть — Remotion копирует public при каждом рендере. Берут нужное через `take`.
"""
import argparse, collections, concurrent.futures as cf, json, os, pathlib, platform, re, shutil, subprocess, sys, threading, time
import urllib.error, urllib.parse, urllib.request, zipfile

try:
    sys.stdout.reconfigure(encoding="utf-8"); sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAK_JSON = ROOT / "пак" / "пак.json"
DEFAULT_DEST = ROOT / "внешнее" / "пак"
WIN = platform.system() == "Windows"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36"
TARGET_M = -16.0           # как в sfxlib.py: пик кратковременной громкости (momentary, 400 мс) каждого звука
YT_FORMAT = "bv*[height<=1080][vcodec^=avc1]/bv*[height<=1080]/b[height<=1080]"
KEY_SIM, KEY_BLEND = "0.10", "0.05"   # chromakey: подобрано глазами на тёмном и светлом фоне (см. SKILL.md)

# вежливость к серверам: (одновременных запросов, минимальная пауза между стартами, сек)
HOST_LIMITS = {"cdn.pixabay.com": (2, 0.5), "upload.wikimedia.org": (2, 1.0), "kenney.nl": (1, 1.0), "ambientcg.com": (2, 1.0),
               "acg-download.struffelproductions.com": (2, 1.0), "cdn.freesound.org": (6, 0.1), "actions.google.com": (4, 0.2),
               "assets-v2.lottiefiles.com": (6, 0.0), "raw.githubusercontent.com": (6, 0.0), "youtu.be": (2, 1.0)}
DEFAULT_LIMIT = (4, 0.2)


# --- программы ------------------------------------------------------------------------------------------------------

def tool(name):
    exe = name + (".exe" if WIN else "")
    for d in (ROOT / ".venv" / ("Scripts" if WIN else "bin"),):
        if (d / exe).exists():
            return str(d / exe)
    return shutil.which(name)


def ytdlp():
    e = os.environ.get("YTDLP", "").strip()
    if e:
        return os.path.expanduser(e)
    return tool("yt-dlp")


def run(cmd, **kw):
    return subprocess.run([str(c) for c in cmd], capture_output=True, text=True, **kw)


# --- данные -----------------------------------------------------------------------------------------------------------

def load():
    if not PAK_JSON.exists():
        sys.exit(f"нет {PAK_JSON}: обнови движок (git pull)")
    return json.loads(PAK_JSON.read_text(encoding="utf-8"))


def mb(n):
    return f"{n/1e6:.0f} МБ" if n >= 1e7 else f"{n/1e6:.1f} МБ"


def have(dest, it):
    f = dest / it["local"]
    return f.exists() and f.stat().st_size > 0


# --- скачивание -----------------------------------------------------------------------------------------------------

class Hosts:
    """Не больше N одновременных запросов на хост и пауза между стартами."""

    def __init__(self):
        self.lock, self.state = threading.Lock(), {}

    def slot(self, host):
        n, gap = HOST_LIMITS.get(host, DEFAULT_LIMIT)
        with self.lock:
            st = self.state.setdefault(host, {"sem": threading.Semaphore(n), "last": 0.0, "lock": threading.Lock(), "gap": gap})
        return st

    def __call__(self, host):
        st = self.slot(host)
        st["sem"].acquire()
        with st["lock"]:
            wait = st["last"] + st["gap"] - time.time()
            if wait > 0:
                time.sleep(wait)
            st["last"] = time.time()
        return st["sem"]


HOSTS = Hosts()


class Dead(Exception):
    """Ссылка не работает (404/410): повторять бессмысленно."""


def _open(url, referer=None):
    h = {"User-Agent": UA}
    if referer:
        h["Referer"] = referer
    return urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=40)


def fetch(url, dst, referer=None, tries=4):
    """Скачать url в dst (через .part, переименование в конце). Ретраи с нарастающей паузой."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    part = dst.with_name(dst.name + ".part")
    host = urllib.parse.urlparse(url).netloc
    last = None
    for k in range(tries):
        sem = HOSTS(host)
        try:
            if "kenney.nl/download-link/" in url:      # Kenney: сначала подписанная ссылка (json), потом сам архив
                real = json.loads(_open(url, referer).read().decode())["url"]
                r = _open(real, referer)
            else:
                r = _open(url, referer)
            with r, open(part, "wb") as f:
                while True:
                    b = r.read(1 << 18)
                    if not b:
                        break
                    f.write(b)
            if part.stat().st_size == 0:
                raise IOError("пустой ответ")
            part.replace(dst)
            return
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code}"
            if e.code in (404, 410):
                raise Dead(last)
            wait = int(e.headers.get("Retry-After", 0) or 0) if e.code == 429 else 0
            time.sleep(max(wait, 3 * (k + 1)))
        except Exception as e:
            last = f"{type(e).__name__}: {e}"[:120]
            time.sleep(2 * (k + 1))
        finally:
            sem.release()
            if not dst.exists():
                part.unlink(missing_ok=True)
    raise IOError(last or "не скачалось")


# --- обработка (рецепты) --------------------------------------------------------------------------------------------

def measure_momentary(ff, f):
    r = run([ff, "-hide_banner", "-nostats", "-i", f, "-af", "ebur128=peak=true", "-f", "null", "-"]).stderr
    ms = [float(x) for x in re.findall(r"M:\s*(-?[0-9.]+)", r)]
    return max(ms) if ms else -70.0


def true_peak(ff, f):
    r = run([ff, "-hide_banner", "-nostats", "-i", f, "-af", "ebur128=peak=true", "-f", "null", "-"]).stderr
    m = re.findall(r"Peak:\s*(-?[0-9.]+) dBFS", r)
    return float(m[-1]) if m else None


def audio_norm(ff, src, dst):
    """Как в sfxlib.py: обрезать тишину в начале, пик momentary → −16 LUFS, true peak ≤ −1 дБ, wav 48 кГц стерео."""
    tmp = dst.with_name(dst.stem + ".trim.wav")
    part = dst.with_name(dst.stem + ".part.wav")
    r = run([ff, "-v", "error", "-y", "-i", src, "-af", "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.005",
             "-ar", "48000", "-ac", "2", tmp])
    if r.returncode or not tmp.exists() or tmp.stat().st_size < 1000:
        tmp.unlink(missing_ok=True)
        raise IOError("ffmpeg не смог прочитать звук")
    gain = TARGET_M - measure_momentary(ff, tmp)
    r = run([ff, "-v", "error", "-y", "-i", tmp, "-af", f"volume={gain:.2f}dB,alimiter=limit=0.89:level=false", "-ar", "48000", part])
    tmp.unlink(missing_ok=True)
    if r.returncode:
        part.unlink(missing_ok=True)
        raise IOError("ffmpeg: " + r.stderr[-100:])
    # лимитер держит пик отсчётов, а межотсчётный (true peak) может выйти за −1 дБ: добиваем тише ровно на излишек
    tp = true_peak(ff, part)
    if tp is not None and tp > -1.0:
        fix = part.with_name(part.stem + ".fix.wav")
        r = run([ff, "-v", "error", "-y", "-i", part, "-af", f"volume={-1.05 - tp:.2f}dB", "-ar", "48000", fix])
        if r.returncode == 0:
            fix.replace(part)
    part.replace(dst)


def lottie_unzip(src, dst):
    """.lottie — это zip: берём animations/*.json, картинки (если есть) вшиваем в json."""
    raw = pathlib.Path(src).read_bytes()
    if raw[:1] in (b"{", b"["):
        dst.write_bytes(raw)
        return
    with zipfile.ZipFile(src) as z:
        names = sorted(n for n in z.namelist() if n.startswith("animations/") and n.endswith(".json"))
        if not names:
            raise IOError("в .lottie нет animations/*.json")
        data = json.loads(z.read(names[0]).decode("utf-8"))
        imgs = {n.split("/", 1)[1]: n for n in z.namelist() if n.startswith("images/") and not n.endswith("/")}
        if imgs:
            import base64, mimetypes
            for a in data.get("assets", []):
                p = a.get("p")
                if isinstance(p, str) and p in imgs:
                    mt = mimetypes.guess_type(p)[0] or "image/png"
                    a["p"], a["u"], a["e"] = f"data:{mt};base64," + base64.b64encode(z.read(imgs[p])).decode(), "", 1
    dst.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def zip_member(zf, member, dst):
    names = {n.replace("\\", "/").lower(): n for n in zf.namelist()}
    n = names.get(member.replace("\\", "/").lower())
    if not n:
        raise IOError(f"в архиве нет {member}")
    dst.parent.mkdir(parents=True, exist_ok=True)
    part = dst.with_name(dst.name + ".part")
    part.write_bytes(zf.read(n))
    part.replace(dst)


def detect_key(ff, src):
    """Цвет фона зелёного/синего экрана: медиана пикселей по рамке кадра в нескольких точках; берём самую «зелёную»."""
    best = None
    for t in ("0.3", "1", "2"):
        r = subprocess.run([ff, "-v", "error", "-ss", t, "-i", str(src), "-frames:v", "1", "-vf", "scale=32:18", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                           capture_output=True)
        px = [r.stdout[i:i + 3] for i in range(0, len(r.stdout) - 2, 3)]
        if len(px) != 32 * 18:
            continue
        edge = [px[y * 32 + x] for y in range(18) for x in range(32) if x in (0, 31) or y in (0, 17)]
        med = [sorted(p[c] for p in edge)[len(edge) // 2] for c in range(3)]
        rr, g, b = med
        for typ, score in (("green", g - max(rr, b)), ("blue", b - max(rr, g))):
            if score >= 40 and (best is None or score > best[0]):
                best = (score, "0x%02X%02X%02X" % tuple(med), typ)
    return best and (best[1], best[2])


def chroma_to_webm(ff, src, dst):
    key = detect_key(ff, src)
    if not key:
        raise IOError("не нашёл зелёный/синий фон (кадр без экрана) — пропущено")
    col, typ = key
    part = dst.with_name(dst.name + ".part")
    vf = f"chromakey=color={col}:similarity={KEY_SIM}:blend={KEY_BLEND},despill=type={typ}:mix=0.6:expand=0.2,format=yuva420p"
    r = run([ff, "-v", "error", "-y", "-i", src, "-vf", vf, "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "30",
             "-deadline", "good", "-cpu-used", "4", "-row-mt", "1", "-auto-alt-ref", "0", "-an", "-f", "webm", part])
    if r.returncode or not part.exists():
        part.unlink(missing_ok=True)
        raise IOError("ffmpeg (vp9 с альфой): " + r.stderr[-120:])
    part.replace(dst)


def to_mp4(ff, fp, src, dst):
    codec = run([fp or "ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name", "-of", "csv=p=0", src]).stdout.strip()
    part = dst.with_name(dst.name + ".part")
    if codec == "h264" and src.suffix == ".mp4":
        shutil.copyfile(src, part)
    else:
        r = run([ff, "-v", "error", "-y", "-i", src, "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", "-f", "mp4", part])
        if r.returncode:
            part.unlink(missing_ok=True)
            raise IOError("ffmpeg (mp4): " + r.stderr[-120:])
    part.replace(dst)


# --- установка ------------------------------------------------------------------------------------------------------

class Progress:
    def __init__(self, total):
        self.total, self.done, self.ok, self.bad, self.lock = total, 0, 0, 0, threading.Lock()
        self.tty = sys.stdout.isatty()
        self.t0 = time.time()

    def step(self, ok, name, why=""):
        with self.lock:
            self.done += 1
            self.ok += ok
            self.bad += (not ok)
            if not ok:
                print(("\r" + " " * 100 + "\r" if self.tty else "") + f"  ✗ {name}: {why}", flush=True)
            line = f"[{self.done}/{self.total}] ✓ {self.ok}  ✗ {self.bad}  {int(time.time()-self.t0)} с"
            if self.tty:
                print("\r" + line + "   ", end="", flush=True)
            elif self.done % 25 == 0 or self.done == self.total:
                print(line, flush=True)


def install_group(dest, items, ff, fp, yt, ffsem, prog, fails):
    """Одна задача: один файл или архив, из которого берём несколько файлов."""
    tmpd = dest / "_tmp"
    tmpd.mkdir(parents=True, exist_ok=True)
    first = items[0]
    rec = first["recipe"]
    try:
        if rec == "unzip":
            z = tmpd / (first["id"] + ".zip")
            fetch(first["url"], z, first.get("page") or None)
            try:
                with zipfile.ZipFile(z) as zf:
                    for it in items:
                        try:
                            zip_member(zf, it["member"], dest / it["local"])
                            prog.step(True, it["id"])
                        except Exception as e:
                            fails.append((it["id"], str(e)))
                            prog.step(False, it["id"], str(e))
            finally:
                z.unlink(missing_ok=True)
            return
        it = first
        out = dest / it["local"]
        out.parent.mkdir(parents=True, exist_ok=True)
        src = tmpd / (it["id"] + ".src")
        if rec.startswith("chroma") or (it["set"] == "yt"):
            if not yt:
                raise IOError("нет yt-dlp (запусти install.py)")
            vid = it["url"].rsplit("/", 1)[1]
            for f in tmpd.glob(vid + ".*"):
                f.unlink()
            sem = HOSTS("youtu.be")
            try:
                tail, got = "?", []
                for k in range(3):
                    cmd = [yt, "-q", "--no-warnings", "--no-playlist", "--socket-timeout", "30", "-f", YT_FORMAT, "-o", str(tmpd / "%(id)s.%(ext)s"), it["url"]]
                    c = os.environ.get("YT_COOKIES", "").strip()
                    if c:
                        cmd += ["--cookies", os.path.expanduser(c)]
                    r = run(cmd)
                    got = [f for f in tmpd.glob(vid + ".*") if f.suffix not in (".part", ".ytdl")]
                    if got:
                        break
                    tail = (r.stderr.strip().splitlines() or ["?"])[-1][:140]
                    if "needs to be reloaded" in tail:
                        tail += " — yt-dlp в .venv устарел (на Python 3.9 не обновляется): поставь Python 3.10+ и перезапусти install.py или укажи свой yt-dlp в .env: YTDLP=путь"
                        break
                    time.sleep(3 * (k + 1))
                if not got:
                    raise IOError("yt-dlp: " + tail)
            finally:
                sem.release()
            src = got[0]
            with ffsem:
                if rec.startswith("chroma"):
                    chroma_to_webm(ff, src, out)
                else:
                    to_mp4(ff, fp, src, out)
            src.unlink(missing_ok=True)
        elif rec == "audio-norm":
            fetch(it["url"], src, it.get("page") or None)
            with ffsem:
                audio_norm(ff, src, out)
            src.unlink(missing_ok=True)
        elif rec == "lottie-unzip":
            fetch(it["url"], src)
            lottie_unzip(src, out)
            src.unlink(missing_ok=True)
        else:
            fetch(it["url"], out)
        prog.step(True, it["id"])
    except Exception as e:
        for it in items:
            if not have(dest, it):
                fails.append((it["id"], f"{type(e).__name__}: {e}" if not isinstance(e, (IOError, Dead)) else str(e)))
                prog.step(False, it["id"], str(e))


def cmd_install(a):
    d = load()
    dest = pathlib.Path(a.dest).expanduser().resolve() if a.dest else DEFAULT_DEST
    sets = a.sets or [s for s in d["sets"] if s != "yt" or a.light or a.all]
    bad = [s for s in sets if s not in d["sets"]]
    if bad:
        sys.exit(f"нет набора {bad}. Есть: {', '.join(d['sets'])}")
    want = [it for it in d["items"] if it["set"] in sets and (it.get("light") or not a.light) and (not a.id or it["id"] in a.id)]
    todo = [it for it in want if not have(dest, it)]
    print(f"пак → {dest}\nнаборы: {', '.join(sets)}{' (light)' if a.light else ''}: {len(want)} файлов, уже стоит {len(want)-len(todo)}, "
          f"осталось {len(todo)} (≈ {mb(sum(i.get('size', 0) for i in todo))})")
    if a.dry or not todo:
        finish(dest, d)
        return 0
    ff, fp, yt = tool("ffmpeg"), tool("ffprobe"), ytdlp()
    need_ff = [i for i in todo if i["recipe"] in ("audio-norm",) or i["set"] == "yt"]
    if need_ff and not ff:
        print(f"  ! нет ffmpeg: {len(need_ff)} файлов (звуки, yt) пропущу. Запусти install.py — он поставит ffmpeg в .venv")
        todo = [i for i in todo if i not in need_ff]
    if any(i["set"] == "yt" for i in todo) and not yt:
        print("  ! нет yt-dlp: набор yt пропущу (install.py поставит)")
        todo = [i for i in todo if i["set"] != "yt"]
    groups = collections.OrderedDict()
    for it in todo:
        groups.setdefault(it["url"] if it["recipe"] == "unzip" else it["id"], []).append(it)
    prog, fails = Progress(len(todo)), []
    ffsem = threading.Semaphore(max(1, min(3, a.jobs // 2)))
    # тяжёлые и «вежливые» хосты — вперёд очередью по хосту, чтобы потоки не стояли на одном
    order = sorted(groups.values(), key=lambda g: urllib.parse.urlparse(g[0]["url"]).netloc)
    t0 = time.time()
    try:
        with cf.ThreadPoolExecutor(a.jobs) as ex:
            futs = [ex.submit(install_group, dest, g, ff, fp, yt, ffsem, prog, fails) for g in order]
            for f in cf.as_completed(futs):
                f.result()
    except KeyboardInterrupt:
        print("\nостановлено; запусти ту же команду — докачает с места")
        os._exit(130)
    print()
    t = time.time() - t0
    print(f"готово за {int(t//60)} мин {int(t%60)} с: скачано и обработано {prog.ok}, не получилось {prog.bad}")
    if fails:
        why = collections.Counter(re.sub(r"[0-9a-f]{6,}", "…", r)[:70] for _, r in fails)
        print("причины:", dict(why))
        (dest / "ошибки.txt").write_text("\n".join(f"{i}\t{r}" for i, r in fails), encoding="utf-8")
        print(f"список — {dest / 'ошибки.txt'}; повторный запуск попробует их снова")
    shutil.rmtree(dest / "_tmp", ignore_errors=True)
    finish(dest, d)
    return 1 if (fails and prog.ok == 0) else 0


def finish(dest, d):
    """Локальный каталог.json и АВТОРЫ.md для того, что реально стоит."""
    if not dest.exists():
        return
    inst = [it for it in d["items"] if have(dest, it)]
    keys = ("id", "set", "category", "title", "tags", "dur", "alpha", "blend", "res", "pik_ms", "license", "local")
    (dest / "каталог.json").write_text(json.dumps([{k: it[k] for k in keys if k in it} for it in inst], ensure_ascii=False, indent=1), encoding="utf-8")
    L = d["licenses"]
    out = ["# Авторы и лицензии пака", "", "Файлы скачаны с оригинальных источников. Что обязательно указывать (в описании ролика или титрах):", ""]
    by = collections.defaultdict(list)
    for it in inst:
        by[it["license"]].append(it)
    for lk in ("ccby4", "ccby3"):
        if by[lk]:
            out += [f"## {L[lk]['name']}", "", f"Лицензия: {L[lk]['url']}", ""]
            for c in sorted({it.get("credit", "") for it in by[lk]}):
                out.append(f"- {c} — {sum(1 for it in by[lk] if it.get('credit') == c)} файлов")
            out.append("")
    if by["lottie"]:
        out += ["## Lottie-анимации (Lottie Simple License)", "", "Коммерческое использование можно, автора указывать. Автор каждой анимации — на её странице:", ""]
        out += [f"- `{it['local']}` — {it['page']}" for it in by["lottie"]]
        out.append("")
    if by["yt"]:
        out += ["## YouTube-оверлеи и зелёные экраны (набор yt)", "", "Авторы заявляют свободное использование. Проверь условия на странице автора перед коммерческим использованием.", ""]
        out += [f"- `{it['local']}` — {it['page'] or it['url']}" for it in by["yt"]]
        out.append("")
    for lk in ("ofl", "ufl", "apache"):
        if by[lk]:
            fam = sorted({it["title"].split(" — ")[0] for it in by[lk]})
            out += [f"## Шрифты: {L[lk]['name']}", "", f"Лицензия: {L[lk]['url']}. Семейства: {', '.join(fam)}", ""]
    for lk in ("cc0", "pixabay"):
        if by[lk]:
            out += [f"## {L[lk]['name']}", "", f"{len(by[lk])} файлов; указывать автора не обязательно. {L[lk]['url']}", ""]
    (dest / "АВТОРЫ.md").write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"поставлено файлов: {len(inst)}; каталог.json и АВТОРЫ.md — в {dest}")


# --- list / find / take ---------------------------------------------------------------------------------------------

def cmd_list(a):
    d = load()
    dest = pathlib.Path(a.dest).expanduser().resolve() if a.dest else DEFAULT_DEST
    print(f"{'набор':<10} {'файлов':>7} {'вес':>9}   {'light':>6} {'вес':>8}   {'стоит':>6}   что внутри")
    T = [0, 0, 0, 0, 0]
    for s, desc in d["sets"].items():
        a_ = [i for i in d["items"] if i["set"] == s]
        l = [i for i in a_ if i.get("light")]
        n = sum(1 for i in a_ if have(dest, i))
        w, lw = sum(i.get("size", 0) for i in a_), sum(i.get("size", 0) for i in l)
        print(f"{s:<10} {len(a_):>7} {mb(w):>9}   {len(l):>6} {mb(lw):>8}   {n:>6}   {desc}")
        T = [T[0] + len(a_), T[1] + w, T[2] + len(l), T[3] + lw, T[4] + n]
    print(f"{'всего':<10} {T[0]:>7} {mb(T[1]):>9}   {T[2]:>6} {mb(T[3]):>8}   {T[4]:>6}")
    print("\nВес — примерный, на диске после обработки. Набор yt в `install` без названия не входит (качается с YouTube, долго): `install yt`.")
    print("Лицензии:", ", ".join(f"{L['name']} — {sum(1 for i in d['items'] if i['license']==k)}" for k, L in d["licenses"].items()))


def cmd_find(a):
    d = load()
    dest = pathlib.Path(a.dest).expanduser().resolve() if a.dest else DEFAULT_DEST
    toks = [t.lower().replace('ё', 'е') for t in a.words]
    hits = []
    for it in d["items"]:
        if a.set and it["set"] != a.set:
            continue
        if a.alpha and not it.get("alpha"):
            continue
        if a.installed and not have(dest, it):
            continue
        hay = " ".join([it["id"], it["category"], it.get("title", ""), " ".join(it.get("tags", [])), it["local"]]).lower().replace("ё", "е")
        if all(t in hay for t in toks):
            hits.append(it)
    hits.sort(key=lambda i: (not have(dest, i), i["set"], i["category"], i.get("dur") or 0))
    for it in hits[:a.n]:
        mark = "✓" if have(dest, it) else "·"
        pik = f" pik {it['pik_ms']} мс" if it.get("pik_ms") is not None else ""
        dur = f" {it['dur']} с" if it.get("dur") else ""
        al = " альфа" if it.get("alpha") else ""
        bl = f" [{it['blend']}]" if it.get("blend") and it["blend"] not in ("normal",) else ""
        print(f"{mark} {it['id']:<13} {it['category']:<28}{dur}{pik}{al}{bl}  {it.get('title','')[:40]}\n    {it['local']}")
    print(f"\nнайдено {len(hits)}" + (f", показано {a.n} (больше: --n 100)" if len(hits) > a.n else "") + "; ✓ — уже стоит, · — ещё не скачано (`install`)")


def cmd_take(a):
    d = load()
    dest = pathlib.Path(a.dest).expanduser().resolve() if a.dest else DEFAULT_DEST
    by = {i["id"]: i for i in d["items"]}
    to = pathlib.Path(a.to).expanduser().resolve()
    if to.name != "pak":
        to = to / "pak"
    rc = 0
    for i in a.ids:
        it = by.get(i)
        if not it:
            print(f"  ✗ {i}: нет такого id (ищи через find)")
            rc = 1
            continue
        src = dest / it["local"]
        if not src.exists():
            print(f"  ✗ {i}: не скачан — `pak.py install {it['set']}`" + (" --light" if it.get("light") else ""))
            rc = 1
            continue
        dst = to / it["local"]
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dst)
        hint = []
        if it.get("pik_ms") is not None:
            hint.append(f"pik {it['pik_ms']} мс: start = момент_удара − pik")
        if it.get("blend") and it["blend"] != "normal":
            hint.append(f"blend {it['blend']}")
        if it.get("alpha"):
            hint.append("альфа")
        print(f"  ✓ {i} → staticFile('pak/{it['local']}')" + (f"   ({'; '.join(hint)})" if hint else ""))
    return rc


def main():
    p = argparse.ArgumentParser(prog="pak.py", description="Пак монтажёра: скачивание с оригинальных источников", formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--dest", help="куда ставить (по умолчанию внешнее/пак/ в корне движка)")
    sub.add_parser("list", parents=[common], help="наборы, сколько файлов и вес")
    i = sub.add_parser("install", parents=[common], help="скачать и обработать")
    i.add_argument("sets", nargs="*", help="наборы (по умолчанию все, кроме yt)")
    i.add_argument("--light", action="store_true", help="отборный поднабор ~370 МБ (с несколькими файлами yt)")
    i.add_argument("--all", action="store_true", help="включая набор yt")
    i.add_argument("--jobs", type=int, default=8, help="потоков (по умолчанию 8)")
    i.add_argument("--id", nargs="+", help="только эти id (для проверки)")
    i.add_argument("--dry", action="store_true", help="только посчитать, ничего не качать")
    f = sub.add_parser("find", parents=[common], help="поиск по тегам, названиям, категориям")
    f.add_argument("words", nargs="*")
    f.add_argument("--set", help="только этот набор")
    f.add_argument("--alpha", action="store_true", help="только с прозрачностью")
    f.add_argument("--installed", action="store_true", help="только уже скачанное")
    f.add_argument("--n", type=int, default=30, help="сколько показать")
    t = sub.add_parser("take", parents=[common], help="скопировать выбранные файлы в public/pak/ ролика")
    t.add_argument("ids", nargs="+")
    t.add_argument("--to", required=True, help="папка public ролика (внутри создастся pak/)")
    a = p.parse_args()
    sys.exit({"list": cmd_list, "install": cmd_install, "find": cmd_find, "take": cmd_take}[a.cmd](a) or 0)


if __name__ == "__main__":
    main()
