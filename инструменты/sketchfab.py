"""3D-модели со Sketchfab: поиск и скачивание (glTF) по API-ключу.

  python3 -I sketchfab.py search "military truck" [--n 10]       — бесплатные для скачивания, по лайкам
  python3 -I sketchfab.py get UID ПАПКА                          — скачать glTF (zip) и распаковать в ПАПКА
Ключ: SKETCHFAB_TOKEN в .env корня репозитория (sketchfab.com/settings/password → API Token).
Лицензия и автор лежат в ПАПКА/license.txt: CC BY — автора указать в подписи к ролику.
"""
import argparse, io, json, pathlib, sys, urllib.parse, urllib.request, zipfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import _env

API = "https://api.sketchfab.com/v3"


def req(url, auth=False):
    h = {"User-Agent": "neuroakyl-montazh"}
    if auth:
        h["Authorization"] = "Token " + _env.key("SKETCHFAB_TOKEN")
    return urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=120)


def search(q, n):
    u = f"{API}/search?type=models&downloadable=true&sort_by=-likeCount&count={n}&q={urllib.parse.quote(q)}"
    for m in json.load(req(u))["results"]:
        lic = (m.get("license") or {}).get("label", "-")
        print(m["uid"], f"{m['faceCount']:>8}", f"{lic[:20]:<20}", f"{m['likeCount']:>5}", "|", m["name"][:50], "|", m["user"]["username"])


def get(uid, dest):
    info = json.load(req(f"{API}/models/{uid}"))
    links = json.load(req(f"{API}/models/{uid}/download", auth=True))
    g = links.get("gltf") or {}
    if not g.get("url"):
        sys.exit(f"нет glTF для {uid}: {list(links)}")
    data = req(g["url"]).read()
    out = pathlib.Path(dest)
    out.mkdir(parents=True, exist_ok=True)
    zipfile.ZipFile(io.BytesIO(data)).extractall(out)
    lic = out / "license.txt"
    if not lic.exists():
        l = info.get("license") or {}
        lic.write_text(f"title: {info['name']}\nauthor: {info['user']['username']}\nsource: {info.get('viewerUrl')}\nlicense: {l.get('label')}\n")
    print(f"{out} · {len(data) // 1024} КБ · {info['name']} — {info['user']['username']} · {(info.get('license') or {}).get('label')}")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("search")
    s.add_argument("q")
    s.add_argument("--n", type=int, default=10)
    g = sub.add_parser("get")
    g.add_argument("uid")
    g.add_argument("dest")
    a = ap.parse_args()
    search(a.q, a.n) if a.cmd == "search" else get(a.uid, a.dest)


if __name__ == "__main__":
    main()
