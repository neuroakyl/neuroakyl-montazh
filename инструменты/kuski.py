"""Куски лица аватара → public/clips + src/litso.json. Без стоп-кадра на хвосте (Бобби 26.11.2026, ролик 74: «лицо застывает на стыке»).

  python3 -I kuski.py --raw heygen/raw --segs heygen/kuski/segs.json --plan "f1:front s1:side f2:front s2:side f3:front" \
      --dvizhok движок [--fps 25]

--plan — по куску на сегмент из segs.json, по порядку: имя_файла_в_raw:камера (front | side).
Что делает:
  • клип режется до min(длина куска голоса, длина живого сырого клипа) — сырой HeyGen бывает короче куска на 0,04–0,16 с,
    хвост НЕ дотягивается (раньше tpad clone → мёртвое лицо);
  • частота — как у ролика (--fps, по умолчанию из движок/src/lib.ts): HeyGen 25 к/с в ролике 30 перегоняется minterpolate;
  • пишет src/litso.json: id, camera, file, start/end куска в треке и live — сколько секунд клип живой.
    Деталь kit/litso.tsx по live считает, когда уходить из лица (vyhod), proverka.py по нему ищет застывания.
"""
import argparse, json, pathlib, re, subprocess, sys


def dlit(p):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=duration,r_frame_rate",
                        "-of", "json", str(p)], capture_output=True, text=True)
    s = json.loads(r.stdout)["streams"][0]
    a, _, b = s["r_frame_rate"].partition("/")
    return float(s["duration"]), float(a) / float(b or 1)


def fps_rolika(dv):
    t = (dv / "src" / "lib.ts")
    m = re.search(r"export const FPS = (\d+)", t.read_text(encoding="utf-8")) if t.exists() else None
    return int(m.group(1)) if m else 30


ap = argparse.ArgumentParser()
ap.add_argument("--raw", required=True); ap.add_argument("--segs", required=True); ap.add_argument("--plan", required=True)
ap.add_argument("--dvizhok", required=True); ap.add_argument("--fps", type=int)
a = ap.parse_args()
raw, dv = pathlib.Path(a.raw), pathlib.Path(a.dvizhok)
segs = json.loads(pathlib.Path(a.segs).read_text(encoding="utf-8"))["segs"]
plan = [x.split(":") for x in a.plan.split()]
if len(plan) != len(segs):
    sys.exit(f"в --plan {len(plan)} кусков, в segs.json {len(segs)}")
fps = a.fps or fps_rolika(dv)
clips = dv / "public" / "clips"; clips.mkdir(parents=True, exist_ok=True)
out = []
for (name, cam), sg in zip(plan, segs):
    src = raw / f"{name}.mp4"
    if not src.exists():
        sys.exit(f"нет {src} — скачать заново из HeyGen по id (ЭТАП-1.md / кредиты.txt)")
    d_raw, f_raw = dlit(src)
    need = round(sg["end"] - sg["start"], 3)
    live = round(min(need, d_raw), 3)
    vf = [] if abs(f_raw - fps) < 0.5 else [f"minterpolate=fps={fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1"]
    cmd = ["ffmpeg", "-v", "error", "-y", "-i", str(src), "-an", *(["-vf", ",".join(vf)] if vf else []), "-t", f"{live}",
           "-r", str(fps), "-c:v", "libx264", "-crf", "14", "-preset", "slow", "-pix_fmt", "yuv420p", str(clips / f"{name}.mp4")]
    subprocess.run(cmd, check=True)
    d_out, _ = dlit(clips / f"{name}.mp4")
    out.append({"id": name, "camera": cam, "file": f"clips/{name}.mp4", "start": sg["start"], "end": sg["end"],
                "live": round(min(live, d_out), 3), "words": sg.get("words", "")})
    short = need - d_raw
    print(f"{name:4} {cam:5} кусок {need:.2f} с, сырой {d_raw:.2f} с, живой {out[-1]['live']:.2f} с"
          + (f"  — короче на {short:.2f} с: уходить из лица до {sg['start'] + out[-1]['live']:.2f}" if short > 0.001 else ""))
(dv / "src" / "litso.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"→ {dv / 'src' / 'litso.json'}")
