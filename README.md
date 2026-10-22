# 沖縄 事故多発マップ

警察庁の交通事故オープンデータで、沖縄の事故が多い場所と時間帯を地図で見る

公開先: (まだ。`../site-factory/publish.sh jiko-map` で https://before-ai.github.io/jiko-map/ に出る)

## 動かす

ビルド不要。Claude の preview「jiko-map」か、次のコマンドで http://localhost:8780 を開く。

```bash
python3 -m http.server 8780 --directory docs
```

## 構成

```
docs/index.html      画面
docs/style.css       見た目(色は :root だけ)
docs/app.js          動き。render() が本体
docs/data/*.json     固定データ
```

## データ源と注意

- (出典、更新頻度、載せないと決めたものをここに書く)
