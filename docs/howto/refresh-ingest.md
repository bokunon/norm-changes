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
   取得開始日は **2024年4月30日**（20240430）です。`to` は昨日の日付（yyyyMMdd）を指定してください。
   ```bash
   npm run refresh:ingest 20240430 <昨日のyyyyMMdd>
   ```
   例: 今日が 2025年2月20日なら `npm run refresh:ingest 20240430 20250219`

3. 実行完了後、**IngestState が最後の日付まで更新**されるため、翌日以降は Vercel Cron が「続きから」前日分だけ取り込みます。

**Vercel 本番で行う場合**: ローカルで `DATABASE_URL` に本番の接続文字列を設定し、上記 1〜2 を実行します。Cron は **日本時間 7:00**（UTC 22:00）に 1 日 1 回実行されます。

## 大量 backlog の一括処理（GitHub Actions）

378日分などの大量 backlog を処理するには、**Ingest Catch-up (Burst)** を 1 回手動実行する。

### 初回セットアップ

1. GitHub リポジトリ → **Settings** → **Secrets and variables** → **Actions**
2. 以下を追加:
   - `CRON_APP_URL`: 本番のベース URL（例: `https://norm-changes.vercel.app`）
   - `CRON_SECRET`: Vercel の Environment Variables にある `CRON_SECRET` と同じ値

### 378日分を処理する手順

1. **Actions** タブ → **Ingest Catch-up (Burst)** → **Run workflow**
2. 処理が開始される（1日≒15分、1回あたり 1 日分、追いつくまでループ）
3. 6時間で打ち切り→約24日処理。続きは再度 **Run workflow** で実行
4. 追いついたら後は **Vercel cron の 1日1回** だけで運用可

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

# 途中で落ちた場合、続きから再開
npm run refresh:ingest 20250101 20250216 --resume
```

- 改正前全文取得で e-Gov に負荷をかけないよう、**1 件あたり 500ms** 待機してから次の API を叩きます。
- 進捗は標準出力に日付ごとに表示されます。バックグラウンドで回す場合は `nohup` や `tmux` を利用してください。
- **`--resume`**: プログレスファイルを読み、前回の続きから実行します。途中で落ちた場合に同じ引数で `--resume` を付けて再実行してください。

例（バックグラウンドで実行）:

```bash
# プロジェクト直下で実行
nohup npm run refresh:ingest 20250101 20250216 > refresh-ingest.log 2>&1 &
```

## ログの場所・確認方法

| 項目 | 内容 |
|------|------|
| **ログファイル** | プロジェクト直下の `refresh-ingest.log` |
| **フルパス** | プロジェクト直下の `refresh-ingest.log` |
| **リアルタイム表示** | `tail -f refresh-ingest.log` |
| **実行中か確認** | `ps aux` と `grep refresh-ingest` |
| **プログレスファイル** | `scripts/refresh-ingest.progress.json`（`--resume` 用、.gitignore 済み） |

## 実行後の分析（NormChange）について

洗い替え後、一覧に反映するには **分析 API** の再実行が必要です。

```bash
curl -X POST "http://localhost:3000/api/analyze"
```

（開発サーバーが起動している場合。本番の場合は該当環境の URL に読み替え）
