#!/usr/bin/env python3
"""警察庁 交通事故統計オープンデータ(本票)から沖縄県分を取り出し、地図用の JSON を作る。

使い方:
  python3 -I scripts/build_data.py <honhyo_YYYY.csv があるフォルダ>

出力:
  docs/data/accidents.json  事故1件=1行の列形式データ
  docs/data/places.json     事故が集中する約100m四方のマス → 町字名(国土地理院の逆ジオコーダで付与)
"""
import csv, json, re, sys, time, glob, os, urllib.parse, subprocess
from collections import Counter, defaultdict

SRC = sys.argv[1] if len(sys.argv) > 1 else "."
OUT = os.path.join(os.path.dirname(__file__), "..", "docs", "data")
PREF = "97"  # 沖縄
GRID = 0.001  # 約100m
NAME_MIN = 4  # この件数以上のマスに町名を付ける
MIN_YEAR = 2021  # 取り込む最初の発生年

MUNI = {"201":"那覇市","205":"宜野湾市","207":"石垣市","208":"浦添市","209":"名護市","210":"糸満市","211":"沖縄市",
 "212":"豊見城市","213":"うるま市","214":"宮古島市","215":"南城市","301":"国頭村","302":"大宜味村","303":"東村",
 "306":"今帰仁村","308":"本部町","311":"恩納村","313":"宜野座村","314":"金武町","315":"伊江村","324":"読谷村",
 "325":"嘉手納町","326":"北谷町","327":"北中城村","328":"中城村","329":"西原町","348":"与那原町","350":"南風原町",
 "353":"渡嘉敷村","354":"座間味村","355":"粟国村","356":"渡名喜村","357":"南大東村","358":"北大東村","359":"伊平屋村",
 "360":"伊是名村","361":"久米島町","362":"八重瀬町","375":"多良間村","381":"竹富町","382":"与那国町","995":"(市町村外)","996":"高速道路など"}

def norm(s): return re.sub(r"[\s　]", "", s)

def dms(v, deg_digits):
    v = v.strip()
    if not v.isdigit() or len(v) < deg_digits + 4: return None
    d = int(v[:deg_digits]); m = int(v[deg_digits:deg_digits+2]); s = int(v[deg_digits+2:]) / 1000
    return d + m / 60 + s / 3600

# 当事者種別 → 0 不明/対象外, 1 乗用車, 2 貨物車, 3 特殊車, 4 二輪車, 5 自転車, 6 歩行者, 7 物件等, 8 相手なし, 9 その他(電動キックボード等)
def kind(c):
    c = int(c) if c.isdigit() else 0
    if 1 <= c <= 7: return 1
    if 11 <= c <= 17: return 2
    if 21 <= c <= 24: return 3
    if 31 <= c <= 36: return 4
    if c in (51, 52): return 5
    if c == 61: return 6
    if c == 75: return 7
    if c == 76: return 8
    if c in (41, 42, 43, 59): return 9
    return 0

# 道路形状 → 1 交差点, 2 交差点付近, 3 カーブ, 4 単路(直線・橋・トンネル), 0 その他
def road(c):
    return {"01":1,"31":1,"07":2,"37":2,"13":3,"11":4,"12":4,"14":4}.get(c, 0)

TYPE = {"01":1, "21":2, "41":3, "61":4}  # 人対車両, 車両相互, 車両単独, 列車

rows = []
files = sorted(glob.glob(os.path.join(SRC, "honhyo_*.csv")))
if not files: sys.exit(f"{SRC} に honhyo_*.csv がありません")
src_years = []
for fn in files:
    src_years.append(re.search(r"(\d{4})", os.path.basename(fn)).group(1))
    with open(fn, encoding="cp932", errors="replace", newline="") as f:
        r = csv.reader(f); h = [norm(x) for x in next(r)]; ix = {k: i for i, k in enumerate(h)}
        g = lambda row, k: row[ix[k]].strip()
        n = 0
        for row in r:
            if row[ix["都道府県コード"]] != PREF: continue
            if int(g(row, "発生日時年")) < MIN_YEAR: continue  # 前年発生分の遅れ計上は1年分そろわないので外す
            lat = dms(g(row, "地点緯度（北緯）"), 2); lng = dms(g(row, "地点経度（東経）"), 3)
            if not lat or not lng or not (24.0 < lat < 27.5 and 122.5 < lng < 131.5): continue
            ka, kb = kind(g(row, "当事者種別（当事者A）")), kind(g(row, "当事者種別（当事者B）"))
            route = g(row, "路線コード")
            rows.append([
                round(lat, 5), round(lng, 5),
                int(g(row, "発生日時年")), int(g(row, "発生日時月")), int(g(row, "発生日時日")), int(g(row, "発生日時時")),
                int(g(row, "曜日(発生年月日)") or 0),
                1 if g(row, "事故内容") == "1" else 0,
                int(g(row, "死者数") or 0), int(g(row, "負傷者数") or 0),
                TYPE.get(g(row, "事故類型"), 0), ka, kb,
                int(g(row, "天候") or 0), road(g(row, "道路形状")),
                int(g(row, "市区町村コード") or 0), int(route[:4]) if route[:4].isdigit() else 0,
                1 if g(row, "昼夜").startswith("2") else 0,
            ])
            n += 1
        print(f"{fn}: {n} 件", file=sys.stderr)

# 同じ事故が2年のファイルに入ることはない前提だが、念のため完全一致は除く
seen = set(); uniq = []
for x in rows:
    k = tuple(x)
    if k in seen: continue
    seen.add(k); uniq.append(x)
rows = sorted(uniq, key=lambda x: (x[2], x[3], x[4], x[5]))

fields = ["lat","lng","y","m","d","h","wd","fatal","dead","injured","type","kindA","kindB","weather","road","muni","route","night"]
os.makedirs(OUT, exist_ok=True)
years = sorted({x[2] for x in rows})
meta = {
    "source": "警察庁 交通事故統計オープンデータ(本票)",
    "sourceUrl": "https://www.npa.go.jp/publications/statistics/koutsuu/opendata/index_opendata.html",
    "files": [f"honhyo_{y}.csv" for y in src_years],
    "built": time.strftime("%Y-%m-%d"),
    "count": len(rows), "years": years,
    "muni": MUNI,
}
with open(os.path.join(OUT, "accidents.json"), "w", encoding="utf-8") as f:
    json.dump({"meta": meta, "fields": fields, "rows": rows}, f, ensure_ascii=False, separators=(",", ":"))

# 集中しているマスに町字名を付ける
cells = Counter((int(x[0] // GRID), int(x[1] // GRID)) for x in rows)
targets = [c for c, n in cells.items() if n >= NAME_MIN]
cache_path = os.path.join(os.path.dirname(__file__), "..", "data", "revgeo_cache.json")  # 町名の問い合わせ結果(次回の更新で使い回す)
cache = json.load(open(cache_path)) if os.path.exists(cache_path) else {}
places = {}
for i, (a, b) in enumerate(sorted(targets, key=lambda c: -cells[c])):
    key = f"{a},{b}"
    lat, lng = (a + 0.5) * GRID, (b + 0.5) * GRID
    if key not in cache:
        url = "https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?" + urllib.parse.urlencode({"lat": f"{lat:.5f}", "lon": f"{lng:.5f}"})
        try:
            out = subprocess.run(["curl", "-sS", "-A", "jiko-map/0.1", url], capture_output=True, text=True, timeout=20).stdout
            res = json.loads(out).get("results") or {}
            cache[key] = res.get("lv01Nm", "")
        except Exception as e:
            print("revgeo error", key, e, file=sys.stderr)  # 失敗は記憶せず、次回また問い合わせる
        time.sleep(0.25)
    if cache.get(key) and cache[key] != "－": places[key] = cache[key]
json.dump(cache, open(cache_path, "w"), ensure_ascii=False)
with open(os.path.join(OUT, "places.json"), "w", encoding="utf-8") as f:
    json.dump({"grid": GRID, "names": places}, f, ensure_ascii=False, separators=(",", ":"))

print(f"accidents: {len(rows)} 件 / years {years} / named cells {len(places)} of {len(targets)}", file=sys.stderr)
