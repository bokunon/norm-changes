# データ洗い替え（ingest の日付範囲実行）

日付範囲を指定して bulkdownload から更新法令を取り直し、NormSource を洗い替えます。  
**改正前全文（rawTextPrev）** の取得で e-Gov API v2 を都度叩くため、1 日あたり数分かかることがあります。

## 前提

- `.env` に `DATABASE_URL` が設定されていること
- 対象日付が e-Gov の「最近の更新法令データ」に存在すること（未来日・データのない日は 0 件になる）

## 使い方

```bash
# 日付範囲を指定（from 〜 to）
npm run refresh:ingest 20250101 20250216

# 1 日だけ
npm run refresh:ingest 20260114 20260114
# または
npm run refresh:ingest 20260114
```

- 改正前全文取得で e-Gov に負荷をかけないよう、**1 件あたり 500ms** 待機してから次の API を叩きます。
- 進捗は標準出力に日付ごとに表示されます。バックグラウンドで回す場合は `nohup` や `tmux` を利用してください。

例（バックグラウンドで実行）:

```bash
nohup npm run refresh:ingest 20250101 20250216 > refresh.log 2>&1 &
```

## 実行後の分析（NormChange）について

洗い替え後、一覧に反映するには **分析 API** の再実行が必要です。

```bash
curl -X POST "http://localhost:3000/api/analyze"
```

（開発サーバーが起動している場合。本番の場合は該当環境の URL に読み替え）
