"""Прослушка для Gemini: кандидаты на роли склеиваются в один mp3 с паузами, плюс карта «№ → секунда».

  python3 -I audition.py build ВЫХОД_ПАПКА      → group_N.mp3 + group_N.json по группам ролей
Роли и отбор кандидатов — в POOLS (категория, длина, слова в названии, стоп-слова).
"""
import json, pathlib, random, re, subprocess, sys

import sys; sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent)); import _env
LIB = _env.lib() / "звуки"
STOP = ("game", "arcade", "cartoon", "funny", "comic", "kid", "laugh", "bubble", "drop", "water", "horror", "scream",
        "bird", "animal", "fart", "8-bit", "retro", "lose", "coin", "jump", "magic wand", "fairy", "baby", "toy", "squeak")
POOLS = {
    "cut":    dict(cats={"swoosh", "whoosh", "transition"}, lo=0.2, hi=0.9),
    "whoosh": dict(cats={"whoosh", "transition", "cinematic", "swoosh"}, lo=0.9, hi=2.6),
    "pop":    dict(cats={"pop", "click", "interface", "notification"}, lo=0.06, hi=0.45),
    "ui":     dict(cats={"interface", "technology", "sci-fi", "click"}, lo=0.1, hi=0.7, words=("interface", "tech", "digital", "ui", "beep", "data", "hud", "scan", "computer", "select", "click")),
    "hit":    dict(cats={"impact", "hit", "cinematic"}, lo=0.3, hi=1.6),
    "boom":   dict(cats={"boom", "bass", "impact", "cinematic"}, lo=1.2, hi=4.5, words=("boom", "bass", "deep", "drop", "sub", "impact", "thud", "cinematic")),
    "glitch": dict(cats={"glitch", "technology", "sci-fi"}, lo=0.12, hi=0.9, words=("glitch", "static", "distort", "digital", "error", "noise")),
    "riser":  dict(cats={"riser", "transition", "cinematic", "sci-fi", "whoosh"}, lo=1.4, hi=4.0, words=("rise", "riser", "build", "swell", "up", "suspense", "tension")),
    "type":   dict(cats={"typing", "technology", "click"}, lo=0.8, hi=8.0, words=("typ", "keyboard", "key")),
    "notif":  dict(cats={"notification", "interface", "pop"}, lo=0.2, hi=1.3),
    "roll":   dict(cats={"technology", "interface", "click", "sci-fi", "notification"}, lo=0.5, hi=3.0, words=("tick", "count", "slot", "roll", "scroll", "spin", "data", "process", "loading", "computing")),
}
GROUPS = [["cut", "whoosh", "riser"], ["pop", "ui", "notif"], ["hit", "boom", "glitch"], ["type", "roll"]]
N = 10


def pick(cat, role):
    p = POOLS[role]
    rows = []
    for sid, v in cat.items():
        t = v["title"].lower()
        if v["cat"] not in p["cats"] or not (p["lo"] <= v.get("len", 0) <= p["hi"]):
            continue
        if any(s in t for s in STOP):
            continue
        if p.get("words") and not any(w in t for w in p["words"]):
            continue
        rows.append(sid)
    random.Random(role).shuffle(rows)
    return rows[:N]


def build(out):
    out = pathlib.Path(out); out.mkdir(parents=True, exist_ok=True)
    cat = json.loads((LIB / "каталог.json").read_text())
    for gi, group in enumerate(GROUPS, 1):
        parts, mapping, t, used = [], [], 0.0, set()
        for role in group:
            for k, sid in enumerate([x for x in pick(cat, role) if x not in used], 1):
                used.add(sid)
                v = cat[sid]
                ln = min(v["len"], 3.0)
                slot = round(ln + 1.2, 2)
                tmp = out / f"_{len(parts):03d}.wav"
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(LIB / v["file"]), "-af",
                                f"atrim=0:{ln},afade=t=out:st={max(0, ln - 0.15)}:d=0.15,apad=whole_dur={slot}", "-ar", "48000", "-ac", "2", str(tmp)], check=True)
                parts.append(tmp)
                mapping.append({"n": len(mapping) + 1, "role": role, "id": sid, "start": round(t, 2), "title": v["title"]})
                t += slot
        lst = out / "_list.txt"
        lst.write_text("".join(f"file '{p}'\n" for p in parts))
        mp3 = out / f"group_{gi}.mp3"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c:a", "libmp3lame", "-b:a", "128k", str(mp3)], check=True)
        for p in parts:
            p.unlink()
        lst.unlink()
        (out / f"group_{gi}.json").write_text(json.dumps(mapping, ensure_ascii=False, indent=1))
        print(mp3, len(mapping), f"{t:.0f} c")


if __name__ == "__main__":
    build(sys.argv[2])
