"""Отправить готовое видео (или текст) себе в Telegram через своего бота. Mac и Windows.

  python инструменты/telegram.py видео.mp4 ["подпись"]
  python инструменты/telegram.py --text "сообщение"
Ключи в .env: TELEGRAM_BOT_TOKEN (от @BotFather). TELEGRAM_CHAT_ID найдётся сам после того, как человек нажал
Start у своего бота, и допишется в .env. Лимит бота — 50 МБ: больше — скрипт сожмёт копию до 720p и отправит её.
"""
import json, pathlib, subprocess, sys, urllib.request, uuid

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import _env

TOKEN = _env.key("TELEGRAM_BOT_TOKEN")
API = f"https://api.telegram.org/bot{TOKEN}"


def call(method, data=None, files=None):
    if files is None:
        req = urllib.request.Request(f"{API}/{method}", data=json.dumps(data or {}).encode(), headers={"Content-Type": "application/json"})
    else:
        b = uuid.uuid4().hex
        body = b"".join(f"--{b}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode() for k, v in data.items())
        (field, path), = files.items()
        body += f"--{b}\r\nContent-Disposition: form-data; name=\"{field}\"; filename=\"{path.name}\"\r\n\r\n".encode() + path.read_bytes() + f"\r\n--{b}--\r\n".encode()
        req = urllib.request.Request(f"{API}/{method}", data=body, headers={"Content-Type": f"multipart/form-data; boundary={b}"})
    return json.load(urllib.request.urlopen(req, timeout=600))


def chat_id():
    _env.load_env()
    import os
    cid = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    if cid:
        return cid
    ups = call("getUpdates").get("result", [])
    chats = [u["message"]["chat"]["id"] for u in ups if "message" in u]
    if not chats:
        sys.exit("Бот пока не знает тебя: открой своего бота в Telegram, нажми Start и запусти ещё раз.")
    cid = str(chats[-1])
    with open(_env.ROOT / ".env", "a", encoding="utf-8") as f:
        f.write(f"\nTELEGRAM_CHAT_ID={cid}\n")
    return cid


args = sys.argv[1:]
cid = chat_id()
if args[:1] == ["--text"]:
    call("sendMessage", {"chat_id": cid, "text": " ".join(args[1:])})
else:
    f = pathlib.Path(args[0])
    cap = args[1] if len(args) > 1 else f.stem
    if f.stat().st_size > 48 * 1024 * 1024:
        small = f.with_name(f.stem + "-превью.mp4")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(f), "-vf", "scale=-2:'min(1280,ih)'", "-c:v", "libx264", "-crf", "28",
                        "-preset", "veryfast", "-c:a", "aac", "-b:a", "128k", str(small)], check=True)
        f, cap = small, cap + " (превью, сжато)"
    r = call("sendVideo", {"chat_id": cid, "caption": cap, "supports_streaming": "true"}, {"video": f})
    print("отправлено" if r.get("ok") else r)
