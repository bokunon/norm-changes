# データ洗い替え（ingest の日付範囲実行）

日付範囲を指定して bulkdownload から更新法令を取り直し、NormSource を洗い替えます。  
**改正前全文（rawTextPrev）** の取得で e-Gov API v2 を都度叩くため、1 日あたり数分かかることがあります。

## 法令データのみ削除してから全期間取り込み（Option 2）

Tag / User / NotificationFilter は残し、**NormSource（および関連 NormChange, NormChangeTag）と IngestState だけ**消して、公示済みデータを取得可能な全期間で取り直す手順です。

1. **法令データをリセット**
   ```bash
   npm run reset:ingest-data
   ```

2. **取得可能な全期間で ingest を実行**  
   e-Gov bulkdownload の利用可能開始日は **2020年11月24日** です。`to` は昨日の日付（yyyyMMdd）を指定してください。
   ```bash
   npm run refresh:ingest 20201124 <昨日のyyyyMMdd>
   ```
   例: 今日が 2025年2月20日なら `npm run refresh:ingest 20201124 20250219`

3. 実行完了後、**IngestState が最後の日付まで更新**されるため、翌日以降は Vercel Cron が「続きから」前日分だけ取り込みます。

**Vercel 本番で行う場合**: ローカルで `DATABASE_URL` に本番の接続文字列を設定し、上記 1〜2 を実行します。Cron は **日本時間 7:00**（UTC 22:00）に 1 日 1 回実行されます。

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
