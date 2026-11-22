"""Gemini смотрит видео по ссылке (YouTube) или локальный файл (до ~18 МБ) и отвечает на вопрос.

Ключ: GEMINI_API_KEY в .env корня репозитория (бесплатный уровень AI Studio).
Запуск:
  python3 -I watch.py URL "вопрос" [--model gemini-3.8-flash] [--out файл.md] [--hi]
--hi — смотреть в обычном качестве (дороже по лимиту), по умолчанию низкое.
При 429 (лимит) пробует следующие модели из FALLBACK.
"""
import argparse, json, os, re, pathlib, sys, time, urllib.error, urllib.request

FALLBACK = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash",
            "gemini-3.5-flash", "gemini-flash-latest", "gemini-3-flash-preview"]
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent)); import _env


def key():
    return _env.key("GEMINI_API_KEY")


def keys():
    """Основной ключ + запасные GEMINI_API_KEY_2, _3 … (общий файл ключей ~/.claude/.env или .env репозитория)."""
    main = key()
    extra = [os.environ[k] for k in sorted(os.environ) if re.fullmatch(r"GEMINI_API_KEY_\d+", k) and os.environ[k].strip()]
    return [k for k in dict.fromkeys([main] + extra) if k]


_K = {"i": 0}  # ключ, который отвечал последним: с него и начинаем (лимит каждого ключа свой)


def media_part(url):
    """Ссылка YouTube или локальный файл до ~18 МБ (уходит inline)."""
    p = pathlib.Path(url)
    if p.exists():
        import base64, mimetypes
        mime = mimetypes.guess_type(p.name)[0] or "video/mp4"
        return {"inline_data": {"mime_type": mime, "data": base64.b64encode(p.read_bytes()).decode()}}
    return {"file_data": {"file_uri": url}}


def call(model, url, prompt, hi):
    body = {"contents": [{"parts": [media_part(url), {"text": prompt}]}]}
    if not hi:
        body["generationConfig"] = {"mediaResolution": "MEDIA_RESOLUTION_LOW"}
    data = json.dumps(body).encode()
    ks = keys()
    last = None
    for j in range(len(ks)):  # 429 (лимит ключа) — тот же запрос следующим ключом, модель не меняем
        i = (_K["i"] + j) % len(ks)
        req = urllib.request.Request(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            data=data, headers={"Content-Type": "application/json", "x-goog-api-key": ks[i]})
        try:
            r = json.load(urllib.request.urlopen(req, timeout=int(os.environ.get("GEMINI_TIMEOUT", "900"))))
        except urllib.error.HTTPError as e:
            if e.code == 429 and j < len(ks) - 1:
                last = e
                continue
            raise
        _K["i"] = i
        return "".join(p.get("text", "") for p in r["candidates"][0]["content"]["parts"])
    raise last


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url"); ap.add_argument("prompt")
    ap.add_argument("--model"); ap.add_argument("--out"); ap.add_argument("--hi", action="store_true")
    a = ap.parse_args()
    m_ = re.search(r"youtube\.com/shorts/([\w-]{11})", a.url)
    if m_:
        a.url = f"https://www.youtube.com/watch?v={m_.group(1)}"
    models = [a.model] + [m for m in FALLBACK if m != a.model] if a.model else FALLBACK
    for m in models:
        for attempt in range(2):
            try:
                text = call(m, a.url, a.prompt, a.hi)
                out = f"<!-- {a.url} · {m} -->\n{text}\n"
                if a.out:
                    pathlib.Path(a.out).write_text(out)
                print(out)
                return
            except urllib.error.HTTPError as e:
                msg = e.read()[:300].decode(errors="ignore")
                print(f"[{m}] HTTP {e.code}: {msg}", file=sys.stderr)
                if e.code == 400:
                    sys.exit("плохой запрос или ссылка")
                if e.code in (429, 404):
                    break  # следующая модель
                time.sleep(5)
            except Exception as e:  # обрыв сети на раздаче с телефона
                print(f"[{m}] {e}", file=sys.stderr)
                time.sleep(5)
    sys.exit("все модели отказали")


if __name__ == "__main__":
    main()
