"""Материалы для спутниковой карты (kit/sputnik.tsx). Только стандартная библиотека + ffmpeg.

  python3 -I инструменты/karta.py globus <движок>/public            → public/karta/globus.jpg (Земля для глобуса, 8192 px)
  python3 -I инструменты/karta.py granica "Kyrgyzstan" <файл.json> [--tochnost 0.01]
        граница страны/области/города из OpenStreetMap (Nominatim) → [[[lon,lat],…],…] для <Naklejka shape>
        точность — упрощение в градусах: страна 0.01, область 0.003, город 0.0005
  python3 -I инструменты/karta.py tochka "Manas Ordo"             → координаты места (lon, lat)
  python3 -I инструменты/karta.py kartinka "Flag of Kyrgyzstan.svg" <файл.png> [--shirina 1200]
        флаг, герб или фото с Wikimedia Commons (имя файла со страницы Commons); --poisk "слова" — найти имя

  python3 -I инструменты/karta.py demo <движок>/public            → глобус + материалы витрин Karta/KartaAziya (ставит install.py)

Спутник — Esri World Imagery (детально до улиц), подпись источника ставит сам компонент.
"""
import json, os, subprocess, sys, time, urllib.parse, urllib.request

UA = {"User-Agent": "montazh-karta/1.0 (video map tool)"}
ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"


def get(url, tries=4):
    for i in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40).read()
        except Exception as e:
            if i == tries - 1:
                raise
            time.sleep(1.5 * (i + 1))


def arg(name, default=None):
    a = sys.argv
    return a[a.index(name) + 1] if name in a else default


def globus(public):
    # Земля в проекции Меркатора 8192×8192 (уровень 5 = 32×32 плитки) — текстура для шейдера глобуса
    from concurrent.futures import ThreadPoolExecutor
    z, n = 5, 32
    out = os.path.join(public, "karta")
    tmp = os.path.join(out, "_plitki")
    os.makedirs(tmp, exist_ok=True)
    def one(i):
        p = os.path.join(tmp, f"{i:04d}.jpg")
        if not os.path.exists(p):
            open(p, "wb").write(get(ESRI.format(z=z, x=i % n, y=i // n)))
    with ThreadPoolExecutor(8) as ex:
        list(ex.map(one, range(n * n)))
    dst = os.path.join(out, "globus.jpg")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-start_number", "0", "-i", os.path.join(tmp, "%04d.jpg"),
                    "-vf", f"tile={n}x{n}", "-frames:v", "1", "-q:v", "2", dst], check=True)
    for f in os.listdir(tmp):
        os.remove(os.path.join(tmp, f))
    os.rmdir(tmp)
    print("готово", dst)


def nominatim(q, extra):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({"q": q, "format": "jsonv2", "limit": 5, **extra})
    time.sleep(1.1)  # правило Nominatim: не чаще раза в секунду
    return json.loads(get(url))


def granica(q, dst, tochnost):
    res = [r for r in nominatim(q, {"polygon_geojson": 1, "polygon_threshold": tochnost})
           if r.get("geojson", {}).get("type") in ("Polygon", "MultiPolygon")]
    if not res:
        sys.exit(f"нет границы для «{q}» — уточни запрос (по-английски, «Talas Region», «Bishkek»)")
    r = res[0]
    g = r["geojson"]
    polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
    rings = [[[round(x, 4), round(y, 4)] for x, y in p[0]] for p in polys]  # только внешние контуры
    rings = [k for k in rings if len(k) >= 4]
    json.dump(rings, open(dst, "w"), separators=(",", ":"))
    print(f"{r['display_name']}\n{len(rings)} контур(ов), {sum(map(len, rings))} точек → {dst}")


def tochka(q):
    for r in nominatim(q, {})[:3]:
        print(f"lon {float(r['lon']):.4f}, lat {float(r['lat']):.4f} — {r['display_name']}")


def commons(params):
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({"format": "json", **params})
    return json.loads(get(url))


def kartinka(name, dst, shirina):
    if "--poisk" in sys.argv:
        d = commons({"action": "query", "list": "search", "srnamespace": 6, "srlimit": 10, "srsearch": arg("--poisk") + " filetype:bitmap|drawing"})
        for s in d["query"]["search"]:
            print(s["title"].removeprefix("File:"))
        return
    d = commons({"action": "query", "titles": "File:" + name.removeprefix("File:"), "prop": "imageinfo",
                 "iiprop": "url|extmetadata", "iiurlwidth": shirina})
    page = next(iter(d["query"]["pages"].values()))
    if "imageinfo" not in page:
        sys.exit(f"нет файла «{name}» на Commons — найди имя: --poisk \"слова\"")
    ii = page["imageinfo"][0]
    open(dst, "wb").write(get(ii.get("thumburl") or ii["url"]))
    lic = ii.get("extmetadata", {}).get("LicenseShortName", {}).get("value", "?")
    print(f"готово {dst} · лицензия: {lic}")


def demo(public):
    # всё, без чего шаблон не соберётся (витрины Karta импортируют эти файлы); уже скачанное не трогает
    k = os.path.join(public, "karta")
    os.makedirs(k, exist_ok=True)
    if not os.path.exists(os.path.join(k, "globus.jpg")):
        globus(public)
    for q, f, tol in (("Kyrgyzstan", "kg.json", 0.01), ("Talas Region", "talas.json", 0.003)):
        if not os.path.exists(os.path.join(k, f)):
            granica(q, os.path.join(k, f), tol)
    for name, f, w in (("Flag of Kyrgyzstan.svg", "flag-kg.png", 1200), ("Flag of Talas Province Kyrgyzstan.svg", "flag-talas.png", 1200),
                       ("Manas Ordo near Talas (cropped).jpg", "manas-ordo.jpg", 900)):
        if not os.path.exists(os.path.join(k, f)):
            kartinka(name, os.path.join(k, f), w)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "globus":
        globus(sys.argv[2])
    elif cmd == "demo":
        demo(sys.argv[2])
    elif cmd == "granica":
        granica(sys.argv[2], sys.argv[3], float(arg("--tochnost", "0.003")))
    elif cmd == "tochka":
        tochka(sys.argv[2])
    elif cmd == "kartinka":
        kartinka(sys.argv[2] if len(sys.argv) > 2 else "", sys.argv[3] if len(sys.argv) > 3 else "", int(arg("--shirina", "1200")))
    else:
        print(__doc__)
