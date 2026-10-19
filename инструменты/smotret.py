"""Смотреть ролик: раскадровка + склейки (Claude) и слух + общий разбор (Gemini).

  python3 -I smotret.py ПАПКА_РЕФЕРЕНСА [--hi] [--no-gemini]
В папке должен лежать original.mp4 (скачан yt-dlp). Результат:
  лист_NN.jpg — кадр в секунду, 5×4 на лист; склейки.txt — жёсткие склейки (с);
  gemini.md — разбор Gemini: речь с таймкодами, структура, монтаж, музыка/SFX, голос, приёмы.
"""
import argparse, pathlib, subprocess, sys

WATCH = pathlib.Path(__file__).resolve().parent / "watch.py"
PROMPT = """Ты — сильный монтажёр и саунд-дизайнер вирусных Reels. Разбери ролик для того, кто будет делать ролик в том же стиле (не копию).
Ответ по-русски, по разделам:
1. РЕЧЬ: кратко по смыслу с таймкодами [мм:сс] (не дословно, пересказ каждой фразы), язык оригинала, длина ролика.
2. СТРУКТУРА: хук (что в первые 3 с и почему цепляет), блоки, кульминация, призыв. Где «петля» или удержание.
3. МОНТАЖ ПО ВРЕМЕНИ: таблица [время | что на экране | тип (лицо/Б-ролл/моушн/скринкаст/текст) | анимация и переход].
   Отдельно: как появляется текст (по слову/по букве/целиком; масштаб, размытие, отскок, маска, печать), шрифт (тип, жирность, капс), цвета, раскладка.
4. ТЕМП: средняя длина кадра, где ускоряется/замедляется.
5. МУЗЫКА: жанр, настроение, примерный BPM, есть ли дропы/паузы; совпадают ли склейки и анимации с битом (где именно).
6. ЗВУКОВЫЕ ЭФФЕКТЫ: какие (свуш, клик, удар, глитч, райзер, «поп», печать и т.д.) и на каких событиях, с таймкодами; громкость относительно голоса.
7. ГОЛОС: живой/ИИ, тембр, темп, эмоции, паузы.
8. ЧТО ДЕЛАЕТ РОЛИК СОЧНЫМ: 5–8 конкретных приёмов, которые стоит повторить.
9. СТИЛЬ ОДНОЙ СТРОКОЙ: короткое название стиля монтажа."""


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, **kw)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dir"); ap.add_argument("--hi", action="store_true"); ap.add_argument("--no-gemini", action="store_true")
    a = ap.parse_args()
    d = pathlib.Path(a.dir)
    src = d / "original.mp4"
    if not src.exists():
        sys.exit(f"нет {src}")
    if not list(d.glob("лист_*.jpg")):
        run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vf", "fps=1,scale=216:384:force_original_aspect_ratio=decrease,pad=216:384:(ow-iw)/2:(oh-ih)/2,tile=5x4", str(d / "лист_%02d.jpg")])
    if not (d / "склейки.txt").exists():
        r = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(src), "-vf", "select='gt(scene,0.3)',showinfo", "-f", "null", "-"], capture_output=True, text=True).stderr
        ts = [l.split("pts_time:")[1].split()[0] for l in r.splitlines() if "pts_time:" in l]
        (d / "склейки.txt").write_text(" ".join(f"{float(t):.2f}" for t in ts) + "\n")
    if a.no_gemini or (d / "gemini.md").exists():
        return
    small = d / "_small.mp4"
    run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vf", "scale=540:-2", "-r", "24", "-c:v", "libx264", "-crf", "30", "-preset", "veryfast",
         "-c:a", "aac", "-b:a", "96k", str(small)])
    args = ["python3", "-I", str(WATCH), str(small), PROMPT, "--out", str(d / "gemini.md")]
    if a.hi:
        args.append("--hi")
    r = subprocess.run(args, capture_output=True, text=True)
    small.unlink(missing_ok=True)
    if r.returncode:
        print(r.stderr[-500:], file=sys.stderr)
        sys.exit(1)
    print("ok", d.name)


if __name__ == "__main__":
    main()
