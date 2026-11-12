"""compose.py — кладёт куски аватара поверх сплошного трека голоса → raw.mp4 (звук только из трека).

Запуск (python3 -I):
  compose.py --track TRACK.mp4 --segs ПАПКА/segs.json --vdir ПАПКА/v --out raw.mp4 [--w 1080 --h 1920]
Куски — ПАПКА/v/N.mp4 (N = i из segs.json), ставятся на свои start. Пока куска нет, держится последний кадр
предыдущего (или фон трека). Трек должен быть видео (mp4); аудио-трек — сначала сделай mp4 с чёрным/любым кадром.
"""
import argparse, json, subprocess, pathlib
ap = argparse.ArgumentParser()
ap.add_argument("--track", required=True); ap.add_argument("--segs", required=True); ap.add_argument("--vdir", required=True)
ap.add_argument("--out", required=True); ap.add_argument("--w", type=int, default=1080); ap.add_argument("--h", type=int, default=1920)
a = ap.parse_args()
d = json.load(open(a.segs)); segs = d["segs"] if isinstance(d, dict) else d  # старый формат — список
vdir = pathlib.Path(a.vdir)
args = ["-i", a.track]; f = ""; last = "0:v"
for n, s in enumerate(segs):
    args += ["-i", str(vdir / f"{s['i']}.mp4")]
    f += f"[{n + 1}:v]fps=25,scale={a.w}:{a.h},setpts=PTS-STARTPTS+{s['start']}/TB[s{n}];[{last}][s{n}]overlay=eof_action=repeat[o{n}];"
    last = f"o{n}"
f = f.rstrip(";")
subprocess.run(["ffmpeg", "-v", "error", "-y", *args, "-filter_complex", f, "-map", f"[{last}]", "-map", "0:a", "-c:v", "libx264", "-crf", "16", "-preset", "fast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest", a.out], check=True)
print("raw ok", a.out)
