"""Тайминги слов без нейросети: по паузам в чистом голосе (ElevenLabs, студийная запись).

  python3 -I words_vad.py голос.mp3 текст.txt -o words.json [--noise -35] [--min-sil 0.16]
Когда брать: нет MMS (torch не установлен) или нужно быстро. Точность: границы фраз — по реальным паузам (±0,03 с),
слова внутри фразы — по длине слова (обычно ±0,1–0,2 с). Для субтитров фразами хватает.
Как: ffmpeg silencedetect → куски речи; динамика подбирает, какие паузы — границы между словами текста
(паузы после знаков препинания дешевле, лишние паузы можно пропустить), внутри куска слова делятся по длине.
Выход как у words.py: [{"text", "start", "end", "pause_after"?}].
"""
import argparse, json, re, subprocess, sys


def speech_segments(path, noise, min_sil):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", path, "-af", f"silencedetect=noise={noise}dB:d={min_sil}", "-f", "null", "-"],
                       capture_output=True, text=True).stderr
    dur = float(re.search(r"Duration: (\d+):(\d+):([\d.]+)", r).groups()[2]) + 60 * float(re.search(r"Duration: (\d+):(\d+)", r).group(2)) + 3600 * float(re.search(r"Duration: (\d+)", r).group(1))
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", r)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", r)]
    sil = list(zip(starts, ends + [dur] * (len(starts) - len(ends))))
    segs, t = [], 0.0
    for a, b in sil:
        if a - t > 0.05:
            segs.append((t, a))
        t = b
    if dur - t > 0.05:
        segs.append((t, dur))
    return segs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio"); ap.add_argument("text"); ap.add_argument("-o", required=True)
    ap.add_argument("--noise", type=float, default=-35); ap.add_argument("--min-sil", type=float, default=0.16)
    a = ap.parse_args()
    raw = open(a.text, encoding="utf-8").read().split()
    words = [w for w in raw if re.search(r"\w", w)]
    W = [len(re.sub(r"[^\w]", "", w)) + 1.5 for w in words]  # вес слова ~ длительность
    punct = [bool(re.search(r"[.,!?:;…—]$", w)) for w in words]
    segs = speech_segments(a.audio, a.noise, a.min_sil)
    m, n = len(segs), len(words)
    rate = sum(e - s for s, e in segs) / sum(W)
    pre = [0.0]
    for x in W:
        pre.append(pre[-1] + x)
    INF = float("inf")
    # best[i][j]: куски 0..i-1 покрыты словами 0..j-1, i-й кусок закончился на границе
    best = [[INF] * (n + 1) for _ in range(m + 1)]
    back = [[None] * (n + 1) for _ in range(m + 1)]
    best[0][0] = 0.0
    for i in range(m):
        for j in range(n):
            if best[i][j] == INF:
                continue
            for i2 in range(i + 1, min(m, i + 4) + 1):  # можно склеить до 4 кусков (пауза внутри фразы)
                speech = sum(segs[k][1] - segs[k][0] for k in range(i, i2))
                for j2 in range(j + 1, min(n, j + 45) + 1):
                    exp = (pre[j2] - pre[j]) * rate
                    c = (speech - exp) ** 2 / max(speech, 0.3) + 0.04 * (i2 - i - 1)
                    if j2 < n and not punct[j2 - 1]:
                        c += 0.25  # граница не на знаке препинания — подозрительно
                    v = best[i][j] + c
                    if v < best[i2][j2]:
                        best[i2][j2] = v
                        back[i2][j2] = (i, j)
    if best[m][n] == INF:
        sys.exit("не сошлось: проверьте текст и порог тишины")
    groups, i, j = [], m, n
    while (i, j) != (0, 0):
        pi, pj = back[i][j]
        groups.append((pi, i, pj, j))
        i, j = pi, pj
    out = []
    for i0, i1, j0, j1 in reversed(groups):
        sub = segs[i0:i1]
        speech = sum(e - s for s, e in sub)
        tot = pre[j1] - pre[j0]
        pos = 0.0
        def at(x):  # x — секунды речи внутри группы → реальное время с учётом пауз
            for s, e in sub:
                if x <= e - s:
                    return s + x
                x -= e - s
            return sub[-1][1]
        for k in range(j0, j1):
            d = W[k] / tot * speech
            out.append({"text": words[k], "start": round(at(pos + 0.001), 3), "end": round(at(pos + d - 0.001), 3)})
            pos += d
    for k in range(len(out) - 1):
        gap = out[k + 1]["start"] - out[k]["end"]
        if gap >= 0.15:
            out[k]["pause_after"] = round(gap, 3)
    json.dump(out, open(a.o, "w"), ensure_ascii=False, indent=0)
    print(f"{len(out)} слов, {m} кусков речи, {len(groups)} фраз", file=sys.stderr)


if __name__ == "__main__":
    main()
