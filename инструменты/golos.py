"""Голос ElevenLabs (v4) + тайминг слов из выравнивания по буквам.

  python3 -I golos.py ТЕКСТ.txt ПАПКА_РОЛИКА --voice adam|brian [--model eleven_v4] [--stability 0.5]
Текст может содержать теги эмоций v4 в квадратных скобках: [excited], [serious], [whispers] …
Результат в ПАПКА/assets: voice.mp3 (как пришёл), voice.wav (highpass + компрессор + −16 LUFS);
ПАПКА/words.json — слова без тегов: [{text, start, end}]. Расход символов пишется в расход.log рядом.
Ключ: ELEVENLABS_API_KEY в .env корня репозитория.
"""
import argparse, base64, datetime, json, pathlib, re, subprocess, sys, urllib.error, urllib.request

import sys; sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent)); import _env
LOG = _env.ROOT / "out" / "расход-elevenlabs.log"
VOICES = {"adam": "pNInz6obpgDQGcFmaJgB", "brian": "nPczCjzI2devNBz1zQrb", "harry": "SOYHLrjzK2X1ezoPC6cr"}


def key():
    return _env.key("ELEVENLABS_API_KEY")


def words_from_alignment(al):
    chars, st, en = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
    out, cur, s0, e0, depth = [], "", None, None, 0
    for c, s, e in zip(chars, st, en):
        if c == "[":
            depth += 1; continue
        if c == "]":
            depth = max(0, depth - 1); continue
        if depth:
            continue
        if c.isspace():
            if cur.strip():
                out.append({"text": cur.strip(), "start": round(s0, 3), "end": round(e0, 3)})
            cur, s0 = "", None
            continue
        if s0 is None:
            s0 = s
        cur += c; e0 = e
    if cur.strip():
        out.append({"text": cur.strip(), "start": round(s0, 3), "end": round(e0, 3)})
    # «слова» из одной пунктуации приклеиваем к предыдущему
    res = []
    for w in out:
        if res and not re.search(r"\w", w["text"]):
            res[-1]["text"] += w["text"]; res[-1]["end"] = w["end"]
        else:
            res.append(w)
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("text"); ap.add_argument("job")
    ap.add_argument("--voice", default="adam"); ap.add_argument("--model", default="eleven_v4")
    ap.add_argument("--stability", type=float, default=0.5); ap.add_argument("--speed", type=float, default=1.0)
    a = ap.parse_args()
    text = pathlib.Path(a.text).read_text().strip()
    job = pathlib.Path(a.job); (job / "assets").mkdir(parents=True, exist_ok=True)
    vid = VOICES.get(a.voice, a.voice)
    body = {"text": text, "model_id": a.model, "language_code": "ky",
            "voice_settings": {"stability": a.stability, "similarity_boost": 0.8, "speed": a.speed}}
    req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{vid}/with-timestamps?output_format=mp3_44100_128",
                                 data=json.dumps(body).encode(), headers={"xi-api-key": key(), "Content-Type": "application/json"})
    try:
        r = json.load(urllib.request.urlopen(req, timeout=300))
    except urllib.error.HTTPError as e:
        sys.exit(f"ElevenLabs {e.code}: {e.read()[:400].decode(errors='ignore')}")
    mp3 = job / "assets" / "voice.mp3"
    mp3.write_bytes(base64.b64decode(r["audio_base64"]))
    words = words_from_alignment(r.get("normalized_alignment") or r["alignment"])
    (job / "words.json").write_text(json.dumps(words, ensure_ascii=False, indent=1))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(mp3), "-af",
                    "highpass=f=70,acompressor=threshold=-20dB:ratio=2.5:attack=8:release=120:makeup=2dB,loudnorm=I=-16:TP=-1.5:LRA=7",
                    "-ar", "48000", "-ac", "2", str(job / "assets" / "voice.wav")], check=True)
    dur = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(mp3)], capture_output=True, text=True).stdout.strip()
    LOG.parent.mkdir(exist_ok=True)
    with LOG.open("a") as f:
        f.write(f"{datetime.datetime.now():%Y-%m-%d %H:%M} {job.name} {a.voice} {len(text)} симв {dur} с\n")
    print(f"ok: {len(words)} слов, {dur} с, {len(text)} символов")


if __name__ == "__main__":
    main()
