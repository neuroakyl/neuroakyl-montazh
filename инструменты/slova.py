"""Слова голоса с якорями для сцен: время и как на него сослаться в коде (at("слово#2")).

  python3 -I slova.py words.json
Якорь — начало слова; если такое начало уже встречалось, добавляется #номер.
"""
import json, re, sys

words = json.load(open(sys.argv[1]))
clean = lambda s: re.sub(r"[^a-z0-9а-яёңөүәіұқғһ-]", "", s.lower())
seen = []
for w in words:
    c = clean(w["text"])
    n = sum(1 for p in seen if p.startswith(c)) + 1  # сколько раньше слов начинались так же
    seen.append(c)
    print(f'{w["start"]:7.2f}  {w["text"]:<22} at("{c}{"#" + str(n) if n > 1 else ""}")')
