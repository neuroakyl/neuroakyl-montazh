#!/usr/bin/env python3
"""План монтажа — обязательный шаг ДО сцен (Бобби 27.11.2026: «модель сначала смотрит и думает, как смонтировать; в коде всё
прописано, чтобы не было права ошибаться»). Думает модель (Opus), правила проверяет код.

  python3 -I инструменты/plan.py zagotovka <src> [--ton dinamichno|sredne|spokoyno]   → <src>/plan.json + ../ПЛАН.md
  python3 -I инструменты/plan.py proverka <src>                                         → ошибки плана (код выхода 1)

1. `zagotovka` режет речь (src/words.json) на фразы по паузам и знакам и пишет заготовку: у каждой фразы время, текст и подсказки
   (цифра → типографика). Тон — из --ton, иначе из src/recept.json, иначе средний.
2. Модель заполняет plan.json: общая идея и фирменный кадр, по каждой фразе — кадр, крупность, вид текста, ключевое слово, пример,
   переход, звук и «зачем». Опора — свод эталонов (`разбор-эталона.md`, `../референсы/ручной-отбор/СВОД.md`) и `приёмы.md`.
3. `proverka` — правила эталонов в коде (ниже RULES). Пока есть ошибки, сцены не писать; proverka.py (и deliver.py) без годного
   плана ролик не сдают. Сцены пишутся строго по плану: фраза → то, что в плане.

Поля фразы (значения — только из списков ниже):
  kadr       front | side | broll:<файл в public/clips> | vyrezka (аватар на своём фоне) | grafika (полный кадр типографики/цифры)
  krupnost   1 | 2 | 3 (уровни TEMP.krupnosti рецепта)
  tekst      build (субтитры по голосу) | bigsmall (мелкое + огромное) | behind (слово за головой) | scramble (буквы вразнобой)
             | cifra (число типографикой) | type (печать) | net
  klyuch     ключевое слово фразы (для bigsmall / behind / scramble / cifra — обязательно, слово из фразы)
  primer     net | broll | vyrezka (предмет без фона) | emoji3d | interfeys (реальный, не чаще 1 раза за ролик) | foto
  perehod    cut (голая склейка) | push (толчок в склейку) | pull (влёт) | jump (джамп-кат крупности) | flash | cold
  zvuk       список: vzhuh, klik, pop, zatvor, tap, udar (громче голоса), rayzer, revers, pechat
  zachem     коротко: почему так (смысл фразы → приём)
"""
import json, pathlib, re, sys

TON = {"spokoyno": "S", "sredne": "M", "dinamichno": "E", "спокойный": "S", "средний": "M", "динамичный": "E"}
# правила эталонов (СВОД 27.11, 13 роликов): событие на лице, частота SFX, вспышки, удары — по тону
RULES = {
    "S": {"lico_bez_sobytiya": 3.5, "sfx": (0.4, 1.0), "svet_mezhdu": 16, "udarov_na_60": 3},
    "M": {"lico_bez_sobytiya": 2.6, "sfx": (0.8, 2.0), "svet_mezhdu": 10, "udarov_na_60": 5},
    "E": {"lico_bez_sobytiya": 2.2, "sfx": (1.5, 4.0), "svet_mezhdu": 8, "udarov_na_60": 6},
}
KADR = {"front", "side", "vyrezka", "grafika"}
TEKST = {"build", "bigsmall", "behind", "scramble", "cifra", "type", "net"}
NUZHEN_KLYUCH = {"bigsmall", "behind", "scramble", "cifra"}
PRIMER = {"net", "broll", "vyrezka", "emoji3d", "interfeys", "foto"}
PEREHOD = {"cut", "push", "pull", "jump", "flash", "cold"}
ZVUK = {"vzhuh", "klik", "pop", "zatvor", "tap", "udar", "rayzer", "revers", "pechat"}
YADRO = {"bigsmall", "behind", "scramble", "cifra", "push", "pull", "vyrezka"}  # приёмы ядра трендового монтажа
# число в речи: цифры или слова-разряды (кыргызча и по-русски) — «эки жүз», «бир жарым миллион», «сто тысяч», «20 пайыз»
CIFRA = re.compile(r"\d|%|\b(жүз|миң|миллион\w*|миллиард\w*|пайыз\w*|процент\w*|тысяч\w*|сто|двести|сотн\w*)\b", re.I)
ZAPRET = re.compile(r"рамк|плашк|стрелк|блёстк|блестк|инфограф|схем|lottie|ramk|plashk|strelk|sparkle|arrow|frame|badge", re.I)


def ton_of(src, arg):
    if arg:
        return TON.get(arg, "M")
    try:
        return TON.get(json.loads((src / "recept.json").read_text(encoding="utf-8"))["pick"]["ton"], "M")
    except Exception:
        return "M"


def frazy(words):
    out, cur = [], []
    for i, w in enumerate(words):
        cur.append(w)
        dl = cur[-1]["end"] - cur[0]["start"]
        konec = (w.get("pause_after", 0) >= 0.15 or re.search(r"[.!?…,:;»]$", w["text"]) or len(cur) >= 8 or dl >= 3.2)
        if konec or i == len(words) - 1:
            out.append(cur)
            cur = []
    return out


def zagotovka(src, ton_arg):
    words = json.loads((src / "words.json").read_text(encoding="utf-8"))
    ton = ton_of(src, ton_arg)
    fr = []
    for n, ws in enumerate(frazy(words), 1):
        tekst = " ".join(w["text"] for w in ws)
        cif = next((w["text"].strip(".,!?«»") for w in ws if CIFRA.search(w["text"])), "")
        fr.append({"id": n, "a": round(ws[0]["start"], 2), "b": round(ws[-1]["end"], 2), "tekst": tekst,
                   "kadr": "front", "krupnost": 1 + (n % 2), "tekst_vid": "cifra" if cif else "build", "klyuch": cif,
                   "primer": "net", "perehod": "cut", "zvuk": [], "zachem": ""})
    plan = {"ton": {"S": "spokoyno", "M": "sredne", "E": "dinamichno"}[ton], "dlit": round(words[-1]["end"], 2),
            "ideya": "", "firmennyi_kadr": "", "frazy": fr}
    p = src / "plan.json"
    if p.exists():
        sys.exit(f"{p} уже есть — правь его (заготовка не перезаписывает)")
    p.write_text(json.dumps(plan, ensure_ascii=False, indent=1), encoding="utf-8")
    md(src, plan)
    print(f"заготовка: {len(fr)} фраз, тон {plan['ton']} → {p}\nЗаполни ideya, firmennyi_kadr и каждую фразу, потом: plan.py proverka {src}")


def md(src, plan):
    rows = [f"# План монтажа · тон {plan['ton']} · {plan['dlit']} с", "", f"**Идея:** {plan.get('ideya') or '—'}  ",
            f"**Фирменный кадр:** {plan.get('firmennyi_kadr') or '—'}", "",
            "| # | с | фраза | кадр | кр. | текст | ключ | пример | переход | звук | зачем |", "|---|---|---|---|---|---|---|---|---|---|---|"]
    for f in plan["frazy"]:
        rows.append(f"| {f['id']} | {f['a']:.1f}–{f['b']:.1f} | {f['tekst']} | {f['kadr']} | {f['krupnost']} | {f['tekst_vid']} | {f.get('klyuch', '')} | "
                    f"{f['primer']} | {f['perehod']} | {', '.join(f.get('zvuk', []))} | {f.get('zachem', '')} |")
    (src.parent.parent / "ПЛАН.md").write_text("\n".join(rows) + "\n", encoding="utf-8")


def proverit(src):
    """→ (ошибки, замечания). Без plan.json — одна ошибка."""
    p = src / "plan.json"
    if not p.exists():
        return [f"нет плана монтажа: `plan.py zagotovka {src}` → заполнить → `plan.py proverka` (план до сцен, Бобби 27.11)"], []
    try:
        plan = json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:
        return [f"plan.json не читается: {e}"], []
    errs, warns = [], []
    ton = TON.get(plan.get("ton", "sredne"), "M")
    R = RULES[ton]
    fr = plan.get("frazy", [])
    dur = plan.get("dlit") or (fr[-1]["b"] if fr else 0)
    if not plan.get("ideya") or not plan.get("firmennyi_kadr"):
        errs.append("не заполнены ideya и firmennyi_kadr — сначала придумать ролик целиком, потом фразы")
    if ZAPRET.search(json.dumps(plan, ensure_ascii=False)):
        errs.append(f"в плане ИИ-вид ({ZAPRET.search(json.dumps(plan, ensure_ascii=False)).group(0)}): рамки, плашки, стрелки, инфографика, Lottie — нельзя (SKILL §0 п.7)")
    brolls, interfeys, svet, udar, sfx, yadro = {}, 0, [], 0, 0, set()
    pust = 0
    for f in fr:
        tag = f"фраза {f.get('id')} ({f.get('a')} с)"
        k = f.get("kadr", "")
        if not (k in KADR or k.startswith("broll:")):
            errs.append(f"{tag}: kadr «{k}» — только {', '.join(sorted(KADR))} или broll:<файл>")
        if k.startswith("broll:"):
            brolls.setdefault(k, []).append(f["id"])
            clip = src.parent / "public" / "clips" / k[6:]
            if not clip.exists():
                errs.append(f"{tag}: нет файла {clip.name} в public/clips")
        tv = f.get("tekst_vid", "")
        if tv not in TEKST:
            errs.append(f"{tag}: tekst_vid «{tv}» — только {', '.join(sorted(TEKST))}")
        kl = (f.get("klyuch") or "").strip()
        if tv in NUZHEN_KLYUCH:
            if not kl:
                errs.append(f"{tag}: для {tv} нужно ключевое слово (klyuch)")
            elif kl.lower().strip(".,!?«»") not in f.get("tekst", "").lower():
                errs.append(f"{tag}: ключ «{kl}» не из этой фразы")
        if CIFRA.search(f.get("tekst", "")) and tv not in ("cifra", "bigsmall", "behind", "scramble"):
            errs.append(f"{tag}: в фразе число — подать типографикой (cifra / bigsmall / behind), а не обычными субтитрами")
        if f.get("primer", "net") not in PRIMER:
            errs.append(f"{tag}: primer «{f.get('primer')}» — только {', '.join(sorted(PRIMER))}")
        interfeys += f.get("primer") == "interfeys"
        ph = f.get("perehod", "cut")
        if ph not in PEREHOD:
            errs.append(f"{tag}: perehod «{ph}» — только {', '.join(sorted(PEREHOD))}")
        if ph in ("flash", "cold"):
            svet.append(f["a"])
        zv = f.get("zvuk", []) or []
        bad = [z for z in zv if z not in ZVUK]
        if bad:
            errs.append(f"{tag}: звук {bad} — только {', '.join(sorted(ZVUK))}")
        udar += zv.count("udar")
        sfx += len(zv)
        if tv in YADRO:
            yadro.add(tv)
        if ph in YADRO:
            yadro.add(ph)
        if f.get("primer") == "vyrezka" or k == "vyrezka":
            yadro.add("vyrezka")
        pust += not (f.get("zachem") or "").strip()
        posl = None
    for i, f in enumerate(fr):
        prev = fr[i - 1] if i else None
        # событие = движение в кадре; смена строки обычных субтитров (build) событием не считается (урок 15: «лицо без движения ≤2–3 с»)
        sob = (not prev or f.get("tekst_vid") not in ("net", "build") or f.get("kadr") != prev.get("kadr") or f.get("krupnost") != prev.get("krupnost")
               or f.get("perehod", "cut") != "cut" or f.get("primer", "net") != "net")
        if f.get("kadr", "").startswith("broll:"):
            posl = None
            continue
        if sob:
            posl = f["a"]
        elif posl is not None and f["b"] - posl > R["lico_bez_sobytiya"]:
            errs.append(f"фраза {f['id']}: лицо без события {f['b'] - posl:.1f} с (тон {plan.get('ton')}: не дольше {R['lico_bez_sobytiya']} с)")
            posl = f["b"]
    # одинаковый текст-приём подряд по всему ролику = монотонно: дать хотя бы 3 вида текста
    vidy = {f.get("tekst_vid") for f in fr} - {"net"}
    if len(fr) >= 8 and len(vidy) < 3:
        errs.append(f"видов текста {len(vidy)} ({', '.join(sorted(vidy))}) — нужно ≥3 (build + bigsmall/behind/cifra/scramble)")
    if len(yadro) < 3:
        errs.append(f"приёмов ядра {len(yadro)} ({', '.join(sorted(yadro)) or 'ничего'}) из 3 нужных: bigsmall, behind, scramble, cifra, push, pull, vyrezka")
    for a, b in zip(svet, svet[1:]):
        if b - a < R["svet_mezhdu"]:
            errs.append(f"световые переходы на {a} и {b} с — чаще раза в {R['svet_mezhdu']} с (эталоны: только смена блока)")
    lim_u = max(2, round(R["udarov_na_60"] * dur / 60))
    if udar > lim_u:
        errs.append(f"ударов громче голоса {udar}, для {dur:.0f} с не больше {lim_u}")
    if interfeys > 1:
        errs.append(f"реальный интерфейс {interfeys} раза — не чаще 1 раза за ролик")
    lo, hi = R["sfx"]
    if dur and not lo <= sfx / dur <= hi:
        warns.append(f"звуков {sfx} = {sfx / dur:.2f}/с, у эталонов этого тона {lo}–{hi}/с")
    for k, ids in brolls.items():
        if len(ids) > 1 and any(b - a > 1 for a, b in zip(ids, ids[1:])):
            warns.append(f"{k[6:]} стоит в фразах {ids} — клип не повторять (кроме намеренной рифмы)")
    if pust > len(fr) // 2:
        warns.append(f"«зачем» пусто у {pust} из {len(fr)} фраз — план без смысла превращается в шаблон")
    return errs, warns


def main():
    a = sys.argv[1:]
    if len(a) < 2 or a[0] not in ("zagotovka", "proverka"):
        sys.exit(__doc__)
    src = pathlib.Path(a[1]).resolve()
    if a[0] == "zagotovka":
        zagotovka(src, a[a.index("--ton") + 1] if "--ton" in a else None)
        return
    errs, warns = proverit(src)
    try:
        md(src, json.loads((src / "plan.json").read_text(encoding="utf-8")))
    except Exception:
        pass
    for e in errs:
        print("ОШИБКА  " + e)
    for w in warns:
        print("замечание  " + w)
    print("план: " + ("есть ошибки — сцены не писать" if errs else "годен — писать сцены строго по плану"))
    sys.exit(1 if errs else 0)


if __name__ == "__main__":
    main()
