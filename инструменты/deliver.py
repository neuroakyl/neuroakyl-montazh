"""Сдача ролика: обложка первыми 0,1 с, звук −14 LUFS (истинный пик −1 дБ). Mac и Windows.

  python инструменты/deliver.py видео.mp4 звук.wav обложка.jpg ВЫХОД.mp4
"""
import json, subprocess, sys

v, a, c, o = sys.argv[1:5]
# первый проход: замер громкости
r = subprocess.run(["ffmpeg", "-hide_banner", "-i", a, "-af", "loudnorm=I=-14:TP=-1:LRA=11:print_format=json", "-f", "null", "-"],
                   capture_output=True, text=True).stderr
m = json.loads(r[r.rindex("{"):r.rindex("}") + 1])
af = (f"loudnorm=I=-14:TP=-1:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
      f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
# второй проход: обложка поверх первых 0,1 с (shortest=1 — иначе зацикленная картинка тянет видео дальше звука)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", v, "-i", a, "-loop", "1", "-i", c, "-filter_complex",
                "[2:v]scale=1080:1920,format=yuv420p[c];[0:v][c]overlay=enable='lt(t,0.1)':shortest=1[v]",
                "-map", "[v]", "-map", "1:a", "-af", af, "-ar", "48000", "-c:v", "libx264", "-crf", "18", "-preset", "slow",
                "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "256k", "-shortest", "-movflags", "+faststart", o], check=True)
print("готово", o)
