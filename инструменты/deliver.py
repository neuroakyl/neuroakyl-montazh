"""Сдача ролика: обложка первыми 0,1 с, звук −14 LUFS (истинный пик −1 дБ). Mac и Windows.

  python инструменты/deliver.py видео.mp4 звук.wav обложка.jpg ВЫХОД.mp4
"""
import json, pathlib, subprocess, sys

v, a, c, o = sys.argv[1:5]
if not pathlib.Path(c).exists():
    sys.exit(f"нет обложки {c}: ролик без обложки не сдаём — python3 -I инструменты/oblozhka.py sdelat (SKILL.md §«Обложка»)")
vw, vh = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", v],
                        capture_output=True, text=True).stdout.strip().split(",")[:2]
# первый проход: замер громкости
r = subprocess.run(["ffmpeg", "-hide_banner", "-i", a, "-af", "loudnorm=I=-14:TP=-1:LRA=11:print_format=json", "-f", "null", "-"],
                   capture_output=True, text=True).stderr
m = json.loads(r[r.rindex("{"):r.rindex("}") + 1])
af = (f"loudnorm=I=-14:TP=-1:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
      f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
# второй проход: обложка поверх первых 0,1 с (shortest=1 — иначе зацикленная картинка тянет видео дальше звука)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", v, "-i", a, "-loop", "1", "-i", c, "-filter_complex",
                f"[2:v]scale={vw}:{vh}:force_original_aspect_ratio=increase,crop={vw}:{vh},format=yuv420p[c];"
                "[0:v][c]overlay=enable='lt(t,0.1)':shortest=1[v]",
                "-map", "[v]", "-map", "1:a", "-af", af, "-ar", "48000", "-c:v", "libx264", "-crf", "18", "-preset", "slow",
                "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "256k", "-shortest", "-movflags", "+faststart", o], check=True)
print("готово", o)
