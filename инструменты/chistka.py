#!/usr/bin/env python3
"""Чистка своей записи голоса через Auphonic: мягко, голос остаётся живым (проверено автором 04.11.2026).

  python3 -I chistka.py ВИДЕО_ИЛИ_ЗВУК [ВЫХОД.mp3]

Шумодав static (постоянный гул), эхо комнаты −12 дБ, Voice AutoEQ (приятный тембр), мягкий компрессор, −16 LUFS.
Без speech_isolation / studiovoice / bwe — они перерисовывают голос (на слух — «робот»).
Бесплатный тариф: 2 ч в месяц и мелодия Auphonic в конце — её обрезаем до длины исходника.
Ключ — AUPHONIC_API_KEY в .env корня (auphonic.com → Account → API Key).
"""
import json, pathlib, subprocess, sys, tempfile, time, urllib.request, uuid

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent)); from _env import key as env_key

API = "https://auphonic.com/api"
SETTINGS = {
    "filtering": "true", "filtermethod": "autoeq",
    "denoise": "true", "denoisemethod": "static", "denoiseamount": "0", "deverbamount": "12",
    "leveler": "true", "compressor": "soft",
    "normloudness": "true", "loudnesstarget": "-16", "maxpeak": "-1",
}


def call(url, k, body=None, ctype=None):
    req = urllib.request.Request(url, data=body, headers={"Authorization": f"bearer {k}"})
    if ctype:
        req.add_header("Content-Type", ctype)
    with urllib.request.urlopen(req, timeout=600) as r:
        return r.read()


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True).stdout
    return float(out.strip())


def main():
    src = pathlib.Path(sys.argv[1]).resolve()
    dst = pathlib.Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else src.with_name(src.stem + "-чистый.mp3")
    k = env_key("AUPHONIC_API_KEY")
    with tempfile.TemporaryDirectory() as tmp:
        flac = pathlib.Path(tmp) / "in.flac"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vn", "-ac", "1", "-ar", "48000", "-c:a", "flac", str(flac)], check=True)

        b = uuid.uuid4().hex
        parts = [f'--{b}\r\nContent-Disposition: form-data; name="{n}"\r\n\r\n{v}\r\n'.encode()
                 for n, v in {**SETTINGS, "title": src.stem, "action": "start"}.items()]
        parts.append(f'--{b}\r\nContent-Disposition: form-data; name="input_file"; filename="in.flac"\r\n'
                     f'Content-Type: audio/flac\r\n\r\n'.encode() + flac.read_bytes() + b"\r\n")
        body = b"".join(parts) + f"--{b}--\r\n".encode()
        prod = json.loads(call(f"{API}/simple/productions.json", k, body, f"multipart/form-data; boundary={b}"))["data"]
        print("auphonic:", prod["uuid"], flush=True)

        while True:
            data = json.loads(call(f"{API}/production/{prod['uuid']}.json", k))["data"]
            if data["status_string"] == "Done":
                break
            if data["status_string"] == "Error":
                sys.exit(f"ошибка auphonic: {data.get('error_message')}")
            time.sleep(10)

        raw = pathlib.Path(tmp) / "out.mp3"
        # curl, а не urllib: ссылка уводит в хранилище, и urllib тащит туда ключ → 400
        subprocess.run(["curl", "-s", "-f", "-L", "-H", f"Authorization: bearer {k}", "-o", str(raw),
                        data["output_files"][0]["download_url"]], check=True)
        # мелодия бесплатного тарифа — в конце: режем по длине исходника
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-t", f"{duration(flac):.3f}", "-c", "copy", str(dst)], check=True)
    print("готово:", dst)


if __name__ == "__main__":
    main()
