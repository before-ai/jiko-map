# 沖縄 事故多発マップ

警察庁の交通事故オープンデータで、沖縄の事故が多い場所と時間帯を地図で見る静的サイト。
前身は「沖縄 速度取締り重点マップ」(torishimari-map)。県警の取締り指針が古くリアルタイム性もなかったため、2026-10-22 にこちらへ作り替えた。

公開先: https://before-ai.github.io/jiko-map/ (GitHub Pages、main の docs/ を配信。push すると1〜2分で反映)

## できること

- 事故地点を濃淡(ヒートマップ)で表示。ズームすると1件ずつの点になり、日時・相手・天候・道路を見られる。死亡事故は赤。
- 時間帯(いまの時間帯・朝・昼・夕方・夜)、相手(歩行者・自転車・バイク・単独)、死亡事故だけ、雨の日だけ、年で絞り込む。
- 絞り込んだ条件で「事故が多い場所」上位15か所を、約100m四方ごとに数えて出す。
- 時間帯ごとの件数グラフ。いまの時刻を強調。

## 動かす

ビルド不要。Claude の preview「jiko-map」か、次のコマンドで http://localhost:8780 を開く。

```bash
python3 -m http.server 8780 --directory docs
```

## 構成

```
docs/index.html            画面
docs/style.css             見た目(色は :root だけ)
docs/app.js                地図・絞り込み・ランキング
docs/data/accidents.json   事故1件=1行(列形式)。build_data.py が作る
docs/data/places.json      約100m四方のマス → 町字名
scripts/build_data.py      警察庁 CSV → 上の2ファイル
data/revgeo_cache.json     町名の問い合わせ結果(公開はされないが更新時に使う)
```

## データ源と更新

- 出典: 警察庁「交通事故統計情報のオープンデータ」本票(honhyo_YYYY.csv)
  https://www.npa.go.jp/publications/statistics/koutsuu/opendata/index_opendata.html
- 収録: 2021〜2025年に沖縄県で発生した人身事故。物損事故は元データにない。
- 2021年ファイルに入っている2020年発生分(遅れて計上された約100件)は、1年分そろわないので外した。
- 町名は国土地理院の逆ジオコーダ(mreversegeocoder.gsi.go.jp)で、4件以上起きたマスにだけ付けている。
- 更新は年1回。警察庁が新しい年の honhyo を出したら、全国 CSV(1年 約60MB、Shift_JIS)を落として次を実行する。

```bash
python3 -I scripts/build_data.py <honhyo_*.csv を置いたフォルダ>
```

逆ジオコーダの結果は data/revgeo_cache.json に貯まるので、2回目以降は新しいマスだけ問い合わせる。全国 CSV はリポジトリに入れない。

## 載せないもの

- 未公表の取締り情報(飲酒検問の場所など)。
- 当事者の年齢など、個人に近づく情報は表示しない(元データにはあるが使っていない)。
