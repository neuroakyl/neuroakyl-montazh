"""Лица на видео и фото → дорожки для детали FaceEmoji (закрыть лица близких эмодзи, которое едет за лицом).

  python3 -I litsa.py ФАЙЛ_ИЛИ_ПАПКА …            найти лица, рядом положить <имя>.litsa.json и лист вырезок <имя>.litsa.jpg
  python3 -I litsa.py ФАЙЛ --keep 0               дорожка 0 — тот, чьё лицо оставляем открытым (обычно автор ролика)

Лицо находит детектор, дальше его ведёт трекер Vision кадр за кадром (держит профиль и мелкие лица).
Лист вырезок: лица по дорожкам слева направо (дорожка 0, 1, 2 …), чтобы глазами понять, кто где.
Перезапуск сбрасывает --keep и может поменять номера — после перезапуска отмечать заново по листу.
Дорожка: keys [[t, cx, cy, s]] — центр лица и сторона квадрата в пикселях показанного кадра, сглажено.
"""
import argparse, json, pathlib, subprocess, sys, tempfile

HERE = pathlib.Path(__file__).resolve().parent
BIN = HERE / ".litsa-bin"  # собранная программа (в Git не идёт)
MEDIA = {".mp4", ".mov", ".m4v", ".jpg", ".jpeg", ".png", ".heic", ".webp"}


def build():
    src = HERE / "litsa.swift"
    if not BIN.exists() or BIN.stat().st_mtime < src.stat().st_mtime:
        subprocess.run(["swiftc", "-O", "-suppress-warnings", str(src), "-o", str(BIN)], check=True)


def merge(tracks, gap=3.0):
    """Склеивает обрывки одного лица (профиль, рука перед лицом): следующий кусок начинается позже и рядом с концом прошлого."""
    tracks = sorted(tracks, key=lambda b: b[0][0])
    out = []
    for b in tracks:
        t0, b0 = b[0]
        best = None
        for a in out:
            t1, b1 = a[-1]
            if 0 < t0 - t1 <= gap:  # строго позже: лица одного момента — разные люди
                d = ((b0[0] + b0[2] / 2 - b1[0] - b1[2] / 2) ** 2 + (b0[1] + b0[3] / 2 - b1[1] - b1[3] / 2) ** 2) ** 0.5
                if d < max(b0[2] * 1.5, b1[2] * 1.5, 90) and (best is None or d < best[0]):  # мелкие лица дальше прыгают
                    best = (d, a)
        if best:
            best[1].extend(b)
        else:
            out.append(list(b))
    return out


def fill_gaps(tracks, min_gap=0.25):
    """Дыры в дорожке (лицо отвернулось, запрокинуто) заполняет движением соседнего лица, которое в это время видно:
    ребёнок на руках или на плечах двигается вместе со взрослым. К концу дыры плавно подтягивает к следующей точке."""
    def at(b, t):
        for (t1, x1), (t2, x2) in zip(b, b[1:]):
            if t1 <= t <= t2:
                u = (t - t1) / max(1e-6, t2 - t1)
                return [x1[j] + (x2[j] - x1[j]) * u for j in range(4)]
        return None
    out = []
    for a in tracks:
        filled = [a[0]]
        for (t1, b1), (t2, b2) in zip(a, a[1:]):
            if t2 - t1 > min_gap:
                others = [o for o in tracks if o is not a and at(o, t1) and at(o, t2)]
                if others:
                    o = min(others, key=lambda o: abs(at(o, t1)[0] - b1[0]) + abs(at(o, t1)[1] - b1[1]))
                    p1, p2 = at(o, t1), at(o, t2)
                    t = t1 + 1 / 15
                    while t < t2:
                        u, p = (t - t1) / (t2 - t1), at(o, t)
                        box = [b1[j] + (p[j] - p1[j]) + u * ((b2[j] - b1[j]) - (p2[j] - p1[j])) for j in (0, 1)] + [b1[2] + (b2[2] - b1[2]) * u, b1[3] + (b2[3] - b1[3]) * u]
                        filled.append((t, box)); t += 1 / 15
            filled.append((t2, b2))
        out.append(filled)
    return out


def smooth(boxes, r=2):
    keys = [[t, b[0] + b[2] / 2, b[1] + b[3] / 2, max(b[2], b[3])] for t, b in boxes]
    out = []
    for i, k in enumerate(keys):
        win = keys[max(0, i - r): i + r + 1]
        out.append([round(k[0], 3)] + [round(sum(w[j] for w in win) / len(win), 1) for j in (1, 2, 3)])
    return out


def sheet(path, data, out):
    """Вырезка каждого лица в середине его дорожки, в ряд."""
    tmp = pathlib.Path(tempfile.mkdtemp())
    rot = ""  # фото с телефона: ffmpeg не поворачивает по EXIF, а координаты лиц — в повёрнутом кадре
    if data["fps"] == 0:
        o = subprocess.run(["sips", "-g", "orientation", str(path)], capture_output=True, text=True).stdout.split()[-1:]
        rot = {"6": "transpose=1,", "8": "transpose=2,", "3": "hflip,vflip,"}.get(o[0] if o else "", "")
    for i, tr in enumerate(data["tracks"]):
        t, cx, cy, s = tr["keys"][len(tr["keys"]) // 2]
        s2 = s * 1.4
        x, y = max(0, cx - s2 / 2), max(0, cy - s2 / 2)
        vf = rot + f"crop={int(min(s2, data['w'] - x))}:{int(min(s2, data['h'] - y))}:{int(x)}:{int(y)},scale=240:240"
        subprocess.run(["ffmpeg", "-v", "quiet", "-y", *(["-ss", str(t)] if data["fps"] else []), "-i", str(path), "-frames:v", "1", "-vf", vf, str(tmp / f"{i:03d}.jpg")])
    n = len(data["tracks"])
    if n:
        subprocess.run(["ffmpeg", "-v", "quiet", "-y", "-i", str(tmp / "%03d.jpg"), "-vf", f"tile={n}x1", "-frames:v", "1", str(out)])


def run(path, step, min_len):
    raw = json.loads(subprocess.run([str(BIN), str(path), str(step)], capture_output=True, text=True, check=True).stdout)
    tracks = [[(b[0], b[1:]) for b in tr["boxes"]] for tr in raw["tracks"]]
    if raw["fps"]:
        tracks = fill_gaps([b for b in merge(tracks) if len(b) >= min_len])
    keys = lambda b: smooth(b, 3)[::2] if raw["fps"] else smooth(b)  # видео: сглаживание по 7 кадрам, ключ через кадр
    data = {"w": raw["w"], "h": raw["h"], "fps": raw["fps"], "keep": [],
            "tracks": [{"id": i, "keys": keys(b)} for i, b in enumerate(sorted(tracks, key=lambda b: b[0][0]))]}
    js = path.with_name(path.name + ".litsa.json")
    js.write_text(json.dumps(data, ensure_ascii=False))
    sheet(path, data, path.with_name(path.name + ".litsa.jpg"))
    spans = ", ".join(f"{tr['id']}: {tr['keys'][0][0]}–{tr['keys'][-1][0]} с, {int(tr['keys'][0][3])} px" for tr in data["tracks"])
    print(f"{path.name}: лиц-дорожек {len(data['tracks'])} ({spans or 'нет'})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--step", type=int, default=3, help="детектор лиц на каждом N-м кадре (трекер — на каждом)")
    ap.add_argument("--min", type=int, default=8, help="дорожка короче N кадров — шум, выкинуть")
    ap.add_argument("--keep", help="номера дорожек, которые оставить открытыми: 0 или 0,2")
    a = ap.parse_args()
    paths = []
    for f in map(pathlib.Path, a.files):
        paths += sorted(p for p in f.iterdir() if p.suffix.lower() in MEDIA) if f.is_dir() else [f]
    paths = [p for p in paths if ".litsa." not in p.name]  # свои листы вырезок не трогать
    if a.keep is not None:
        for p in paths:
            js = p.with_name(p.name + ".litsa.json")
            d = json.loads(js.read_text()); d["keep"] = [int(x) for x in a.keep.split(",") if x != ""]
            js.write_text(json.dumps(d, ensure_ascii=False)); print(f"{p.name}: открыты {d['keep']}")
        return
    build()
    for p in paths:
        try:
            run(p, a.step, a.min)
        except subprocess.CalledProcessError as e:
            print(f"{p.name}: не прочиталось ({e.returncode})", file=sys.stderr)


if __name__ == "__main__":
    main()
