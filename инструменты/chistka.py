#!/usr/bin/env python3
"""Чистка своей записи голоса через Auphonic: мягко, голос остаётся живым (проверено автором 04.11.2026).

  python3 -I chistka.py ВИДЕО_ИЛИ_ЗВУК [ВЫХОД.mp3]

Шумодав static (постоянный гул), эхо комнаты −12 дБ, Voice AutoEQ (приятный тембр), мягкий компрессор, −16 LUFS.
Без speech_isolation / studiovoice / bwe — они перерисовывают голос (на слух — «робот»).
Бесплатный тариф: 2 ч в месяц, заставка Auphonic в начале (6,41 с) и мелодия в конце — обе обрезаем, длина = исходнику.
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


def offset(ref, out):
    """Где в выходе Auphonic начинается наш звук: бесплатный тариф вставляет заставку в НАЧАЛО (6,41 с, замер 16.11.2026)
    и мелодию в конец. Ищем сдвиг по огибающей громкости (10 мс) первых 60 с, в пределах 0..20 с."""
    import array, math
    def env(p, t0, d):
        b = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(t0), "-t", str(d), "-i", str(p), "-ac", "1", "-ar", "8000",
                            "-f", "s16le", "-"], capture_output=True).stdout
        a = array.array("h", b); hop = 80
        e = [20 * math.log10(math.sqrt(sum(x * x for x in a[i:i + hop:4]) / (hop / 4)) + 1) for i in range(0, len(a) - hop, hop)]
        m = sum(e) / len(e); s = math.sqrt(sum((x - m) ** 2 for x in e) / len(e)) or 1
        return [(x - m) / s for x in e]
    r, o = env(ref, 0, 40), env(out, 0, 62)
    best = max(range(0, len(o) - len(r)), key=lambda L: sum(r[i] * o[L + i] for i in range(0, len(r), 2)))
    return best / 100


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
        # заставка бесплатного тарифа — в начале, мелодия — в конце: отрезаем обе, длина = исходнику (иначе голос отстаёт от видео)
        sh = offset(flac, raw)
        print(f"заставка Auphonic в начале: {sh:.2f} с — отрезаю", flush=True)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{sh:.3f}", "-i", str(raw), "-t", f"{duration(flac):.3f}",
                        "-c:a", "libmp3lame", "-b:a", "192k", str(dst)], check=True)
    print("готово:", dst)


if __name__ == "__main__":
    main()
