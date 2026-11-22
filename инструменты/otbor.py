"""Отбор эталонов монтажа пачкой: ссылки (Pinterest, Instagram, YouTube, TikTok) → скачать → Gemini оценивает → видео удалить.

  python3 -I otbor.py ocenka ПАПКА [--chast 1/4]  ПАПКА/пины.json ([{"id"|"url", ...}]) → ПАПКА/оценки/<id>.json, видео не копятся
  python3 -I otbor.py top ПАПКА [--n 100]     сводка: лучшие по pro_level без «ИИ-слопа» → ПАПКА/топ.json + печать
  python3 -I otbor.py razbor ПАПКА [--n 100] [--openrouter google/gemini-3.8-flash --max-usd 3]
                                              глубокий разбор топа (журнал монтажа) → ПАПКА/разборы/<id>.md

Зачем: Бобби (22.11.2026) — «проанализировать через Gemini как можно больше роликов (500), вывести 100 самых эталонных
и применять их в монтаже». Смотрит Gemini (бесплатный ключ AI Studio, GEMINI_API_KEY) — лимит Claude не тратится.
Перезапуск продолжает с места: готовые оценки пропускаются. 429 (лимит в минуту/день) — ждёт и пробует другие модели.
Видео живёт только пока его смотрят (≤20 МБ inline), потом удаляется. Топ для разбора скачивается заново.
"""
import argparse, json, pathlib, re, subprocess, sys, time, urllib.error

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import _env, watch  # noqa: E402

YTDLP = str(_env.ROOT / ".venv" / "bin" / "yt-dlp")
MODELS = list(watch.FALLBACK)  # --modeli меняет; у lite-моделей свой дневной лимит бесплатного уровня

OCENKA = """You are a senior short-form video editor at a top US agency judging a reel as a REFERENCE for an editing engine.
Watch the whole video with sound. Reply with ONLY one JSON object, no markdown:
{"is_edit": true/false (is this a real example of edited short-form video, not a software screen tutorial, not a static image/slideshow, not a meme),
 "format": "talking_head" | "before_after" | "broll_montage" | "motion_graphics" | "podcast_clip" | "product_ad" | "tutorial" | "other",
 "tempo": "dynamic" | "medium" | "calm",
 "pro_level": 1-10 (10 = would impress senior editors; judge craft: rhythm, timing to speech, typography, motion curves, sound design, color),
 "ai_slop": 1-10 (10 = looks auto-generated/cheap: random zooms, stock pops, generic captions, kiddy sounds, effects not tied to meaning),
 "niche": "short label, e.g. business coach, real estate, fitness, tech, beauty",
 "techniques": ["up to 8 concrete techniques with timing/feel, e.g. 'punch-in 110% on key word, hard cut', 'text behind subject', 'whoosh synced to slide 0.3s'"],
 "sound": ["up to 5: what sound design does (types of sfx, music behavior, silences)"],
 "typography": "fonts/weights/placement/animation in one line",
 "why": "one sentence in Russian: what makes it pro or cheap"}"""

RAZBOR = """Ты — старший моушн-дизайнер, разбираешь вертикальный ролик, чтобы пересобрать его ТОЧНО и понять, почему он выглядит
как работа профи, а не ИИ. Смотри покадрово, со звуком. Пиши по-русски, коротко, без воды. Выдай:
1) Речь с таймкодами (если есть).
2) Таблица событий: начало–конец (0,1 с) | слой (спикер / Б-ролл / текст / графика / оверлей) | что видно (тексты дословно, цвета hex,
шрифт, вес, размер к ширине кадра) | как входит (тип, направление, длительность, кривая, размытие, масштаб) | удержание | как уходит |
звук в этот момент | к какому слову речи привязано.
3) Система субтитров и типографики. 4) Камера: зумы, панорамы, тряска — когда и на сколько. 5) Переходы.
6) Звук: музыка (жанр, где громче/тише/тишина) и каждый эффект по времени и характеру (удар, бас, вжух, клик, райзер...).
7) Ритм: средняя длина плана, где ускорение и где передышка.
8) Пять вещей, которые делают этот монтаж профессиональным, и что в нём было бы «палевом ИИ», если сделать небрежно.
9) Правила, которые можно вшить в движок монтажа (конкретные числа: длительности, проценты, громкость).
Не выдумывай значения, оценки помечай (оц.)."""


def url_of(p):
    return p.get("url") or f"https://www.pinterest.com/pin/{p['id']}/"


def download(url, tmp):
    for f in tmp.parent.glob(tmp.name + ".*"):
        f.unlink()
    r = subprocess.run([YTDLP, "-q", "--no-warnings", "--no-playlist", "-f", "best[height<=720][filesize<19M]/best[height<=720]/best",
                        "--max-filesize", "19M", "-o", str(tmp) + ".%(ext)s", url], capture_output=True, text=True, timeout=300)
    got = [f for f in tmp.parent.glob(tmp.name + ".*") if f.suffix in (".mp4", ".webm", ".mov", ".m4v")]
    return got[0] if got else None, r.stderr[-300:]


def ask(path, prompt, hi=False):
    """Gemini по моделям; 429 по всем ключам модели — следующая модель, все в лимите — пауза и заново."""
    waits = 0
    while True:
        for m in MODELS:  # ключи (основной + GEMINI_API_KEY_2 …) перебирает watch.call
            try:
                return watch.call(m, str(path), prompt, hi), m
            except urllib.error.HTTPError as e:
                code = e.code
                msg = e.read()[:200].decode(errors="ignore")
                if code == 400:
                    raise RuntimeError(f"400: {msg}")
                if code not in (429, 404, 500, 503):
                    print(f"  [{m}] HTTP {code}: {msg}", file=sys.stderr)
            except Exception as e:  # обрыв сети на раздаче с телефона
                print(f"  [{m}] {e}", file=sys.stderr)
                time.sleep(5)
        waits += 1
        pause = min(60 * waits, 900)
        print(f"  все модели в лимите — жду {pause} с", file=sys.stderr)
        time.sleep(pause)


OR = {"model": None, "max_usd": 3.0, "spent": 0.0}  # --openrouter МОДЕЛЬ: платно, потолок денег в коде (--max-usd)


def ask_openrouter(path, prompt):
    """OpenRouter (ключ OPENROUTER_API_KEY): видео inline base64. Считает потраченное по usage.cost и не выходит за потолок."""
    import base64, os, urllib.request
    if OR["spent"] >= OR["max_usd"]:
        sys.exit(f"потолок ${OR['max_usd']} достигнут (потрачено ${OR['spent']:.2f}) — остановка")
    data = base64.b64encode(pathlib.Path(path).read_bytes()).decode()
    body = {"model": OR["model"], "usage": {"include": True},
            "messages": [{"role": "user", "content": [{"type": "video_url", "video_url": {"url": f"data:video/mp4;base64,{data}"}},
                                                      {"type": "text", "text": prompt}]}]}
    for attempt in range(4):
        try:
            req = urllib.request.Request("https://openrouter.ai/api/v1/chat/completions", data=json.dumps(body).encode(),
                                         headers={"Content-Type": "application/json", "Authorization": "Bearer " + _env.key("OPENROUTER_API_KEY")})
            r = json.load(urllib.request.urlopen(req, timeout=600))
            OR["spent"] += float((r.get("usage") or {}).get("cost") or 0)
            return r["choices"][0]["message"]["content"], OR["model"]
        except urllib.error.HTTPError as e:
            msg = e.read()[:300].decode(errors="ignore")
            print(f"  [openrouter] HTTP {e.code}: {msg}", file=sys.stderr)
            if e.code in (400, 401, 402):
                raise RuntimeError(f"{e.code}: {msg}")
        except Exception as e:
            print(f"  [openrouter] {e}", file=sys.stderr)
        time.sleep(10 * (attempt + 1))
    raise RuntimeError("openrouter не ответил")


def parse_json(text):
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    raw = m.group(0)
    for fix in (lambda x: x, lambda x: re.sub(r'\\(?!["\\/bfnrtu])', r"\\\\", x), lambda x: re.sub(r",\s*([}\]])", r"\1", x)):
        try:
            return json.loads(fix(raw))
        except json.JSONDecodeError:
            raw = fix(raw)
    return {"raw": text[:3000]}  # lite-модели иногда ломают JSON — сырой ответ остаётся, оценку можно повторить


def ocenka(d, chast="1/1"):
    k, n = map(int, chast.split("/"))
    pins = json.loads((d / "пины.json").read_text(encoding="utf-8"))
    out = d / "оценки"; out.mkdir(exist_ok=True)
    tmp = d / "_tmp"; tmp.mkdir(exist_ok=True)
    done = 0
    for i, p in enumerate(pins):
        if i % n != k - 1:
            continue
        pid = str(p.get("id") or re.sub(r"\W+", "_", p["url"])[-40:])
        f = out / f"{pid}.json"
        if f.exists():
            continue
        url = url_of(p)
        vid, err = download(url, tmp / pid)
        if not vid:
            f.write_text(json.dumps({"id": pid, "url": url, "error": "не скачалось " + err.strip()[-150:]}, ensure_ascii=False))
            continue
        try:
            text, model = ask(vid, OCENKA)
            j = parse_json(text) or {"raw": text[:2000]}
        except Exception as e:
            j = {"error": str(e)[:200]}
            model = None
        vid.unlink(missing_ok=True)
        j.update({"id": pid, "url": url, "model": model, **{k: v for k, v in p.items() if k not in ("id", "url")}})
        f.write_text(json.dumps(j, ensure_ascii=False))
        done += 1
        print(f"{i + 1}/{len(pins)} {pid} pro {j.get('pro_level')} slop {j.get('ai_slop')} {j.get('format')} {j.get('tempo')}", flush=True)
    print(f"готово: новых оценок {done}")


def load(d):
    return [json.loads(f.read_text(encoding="utf-8")) for f in sorted((d / "оценки").glob("*.json"))]


NUZHNO = ("talking_head", "before_after", "broll_montage", "motion_graphics", "podcast_clip")  # реклама товара, уроки по софту — не наш монтаж


def top(d, n):
    """Лучшие без «ИИ-слопа», только нужные форматы; квоты, чтобы в топ попали и спокойные, и говорящая голова, а не одна динамика."""
    from collections import Counter
    allr = load(d)
    rows = [r for r in allr if r.get("is_edit") and isinstance(r.get("pro_level"), (int, float)) and r.get("format") in NUZHNO]
    rows.sort(key=lambda r: (r["pro_level"] - 0.5 * r.get("ai_slop", 5)), reverse=True)
    good = [r for r in rows if r["pro_level"] >= 7 and r.get("ai_slop", 10) <= 4]
    best, per_f, per_t = [], Counter(), Counter()
    cap_f, cap_t = max(8, n * 35 // 100), max(10, n * 60 // 100)  # один формат ≤35 %, один темп ≤60 % — пока есть из чего брать
    for r in good:
        if per_f[r["format"]] < cap_f and per_t[r.get("tempo")] < cap_t:
            best.append(r); per_f[r["format"]] += 1; per_t[r.get("tempo")] += 1
    for r in good:  # добор, если квоты не дали n
        if len(best) >= n:
            break
        if r not in best:
            best.append(r)
    best = best[:n]
    (d / "топ.json").write_text(json.dumps(best, ensure_ascii=False, indent=1))
    print(f"оценено {len(allr)}, нужного формата {len(rows)}, хороших {len(good)}, ошибок {sum(1 for r in allr if r.get('error') or r.get('raw'))}, в топе {len(best)}")
    print("форматы топа:", dict(Counter(r.get("format") for r in best)))
    print("темп топа:", dict(Counter(r.get("tempo") for r in best)))


def razbor(d, n, chast="1/1"):
    k, kn = map(int, chast.split("/"))
    best = json.loads((d / "топ.json").read_text(encoding="utf-8"))[:n]
    out = d / "разборы"; out.mkdir(exist_ok=True)
    tmp = d / "_tmp"; tmp.mkdir(exist_ok=True)
    for i, r in enumerate(best):
        if i % kn != k - 1:
            continue
        f = out / f"{r['id']}.md"
        if f.exists():
            continue
        vid, err = download(r["url"], tmp / r["id"])
        if not vid:
            print(f"{r['id']}: не скачалось", file=sys.stderr); continue
        try:
            text, model = ask_openrouter(vid, RAZBOR) if OR["model"] else ask(vid, RAZBOR, hi=True)
        except RuntimeError as e:
            print(f"{r['id']}: {e}", file=sys.stderr); vid.unlink(missing_ok=True); continue
        vid.unlink(missing_ok=True)
        f.write_text(f"<!-- {r['url']} · {model} · pro {r.get('pro_level')} · {r.get('format')} · {r.get('tempo')} -->\n{text}\n", encoding="utf-8")
        print(f"{i + 1}/{len(best)} {r['id']} разобран · потрачено ${OR['spent']:.2f}", flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["ocenka", "top", "razbor"]); ap.add_argument("dir"); ap.add_argument("--n", type=int, default=100)
    ap.add_argument("--modeli", help="модели Gemini через запятую, напр. gemini-3.5-flash-lite,gemini-3.1-flash-lite (первичная оценка)")
    ap.add_argument("--openrouter", help="модель OpenRouter для razbor (платно), напр. google/gemini-3.8-flash")
    ap.add_argument("--max-usd", type=float, default=3.0, help="потолок денег за запуск (OpenRouter)")
    ap.add_argument("--chast", default="1/1", help="k/n — параллельные потоки: каждый берёт свою долю списка")
    a = ap.parse_args()
    d = pathlib.Path(a.dir)
    OR["model"], OR["max_usd"] = a.openrouter, a.max_usd
    if a.modeli:
        MODELS[:] = a.modeli.split(",")
    {"ocenka": lambda: ocenka(d, a.chast), "top": lambda: top(d, a.n), "razbor": lambda: razbor(d, a.n, a.chast)}[a.cmd]()
