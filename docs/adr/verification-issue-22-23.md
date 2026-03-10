# Issue #22, #23 の確認方法

bulkdownload 経由の ingest と「改正法令公布日」での公示日保存の確認手順です。

---

## 画面で確認する手順（あなたがやること）

**「実際の画面でそれっぽいのが見えればOK」用の最短フローです。**

1. **サーバー起動**
   ```bash
   npm run dev
   ```

2. **取り込み（ingest）**  
   ブラウザで開くか curl で実行。日付は **e-Gov で取れた日**（例: 20260114）で。
   - ブラウザ: `http://localhost:3000/api/ingest/laws?date=20260114`
   - または: `curl -s "http://localhost:3000/api/ingest/laws?date=20260114"`
   - **期待**: `"ok": true` かつ `"total"` が 1 以上（取れた件数）。

3. **分析（analyze）**  
   取り込んだ法令から「法令インパクト」を 1 件ずつ作る。**これをやらないと一覧に何も出ません。**
   - ブラウザでは POST しづらいので、ターミナルで:
   ```bash
   curl -X POST "http://localhost:3000/api/analyze"
   ```
   - **期待**: `"ok": true` かつ `"created"` が 1 以上。

4. **一覧を開く**
   - ブラウザで `http://localhost:3000/norm-changes` を開く。
   - **期待**: カードが並び、法令名・公示日・種別などが表示される。  
     「該当する変更はありません」のままなら、手順 2 の `total` が 0 だったか、手順 3 をまだ実行していない可能性。

**ここまでで画面にカードが出ていれば、#22 / #23 の実装は「それっぽく動いている」とみて問題ありません。**

---

## 0. 単体テスト・取得試験（先に実行推奨）

パース・日付・列マッピングと、**fetch をモックした取得試験**まで含めて単体テストでカバーしています。

```bash
npm run test
```

- **単体**: `csvRowToNormSourceFields` のマッピング（#23 の改正法令公布日／公布日フォールバック、日付パース、法令ID 空で null など）
- **取得試験**: `fetchBulkdownloadList` を、bulkdownload の代わりに ZIP（UTF-8/Shift_JIS の CSV 入り）を返すモックで呼び、解凍〜パース〜行返却まで通す

Watch モードで実行する場合: `npm run test:watch`

---

## 前提

- ブランチ: `feature/issue-22-23-bulkdownload-ingest`
- ローカルで DB が起動していること（Supabase または `docker compose` 等）
- 環境変数（`DATABASE_URL` 等）が設定済みであること

---

## 1. #22: bulkdownload で日付指定取得に切り替え

### 確認内容

- `GET /api/ingest/laws?date=yyyyMMdd` が **bulkdownload**（ZIP 解凍・CSV パース）経由で一覧を取得し、NormSource に upsert していること。

### 手順

1. 開発サーバーを起動する  
   `npm run dev`

2. ブラウザまたは curl で ingest を呼ぶ（日付は **過去の実在する日付** を指定。未来日やデータのない日は 0 bytes や total:0 になる）  
   ```bash
   curl -s "http://localhost:3000/api/ingest/laws?date=20230201"
   ```
   またはブラウザで  
   `http://localhost:3000/api/ingest/laws?date=20230201`  
   （例: 20230201 = 2023年2月1日。e-Gov の「最近の更新法令データ」で配布されている日付から選ぶ）

3. レスポンスを確認する  
   - `ok: true` であること  
   - `date` が指定した yyyyMMdd であること  
   - `total` が 0 以上（その日に更新された法令がある場合）  
   - `created` または `updated` が 0 以上（既存データがある場合は updated が増える）

4. 一覧画面で取り込み結果を確認する  
   - 手順 2 のあとに **`curl -X POST "http://localhost:3000/api/analyze"`** で NormChange を生成してから、  
     `http://localhost:3000/norm-changes` を開く。  
   - 取り込んだ日付の法令がカードで表示されていれば #22 の挙動は問題なし

### エラー時

- `ok: false` かつ `error` にメッセージが出る。  
  - **レスポンスが空** → 指定日が未来日や e-Gov にデータのない日の可能性。**過去の日付**（例: 20230201, 20241117）で試す。  
  - 日付は [e-Gov 一括ダウンロード](https://laws.e-gov.go.jp/bulkdownload/) の「最近の更新法令データ」に表示されている日付から選ぶとよい。

---

## 2. #23: 公示日を「改正法令公布日」で保存

### 確認内容

- NormSource の `publishedAt` が、CSV の **「改正法令公布日」** になっていること（空の場合は「公布日」）。

### 手順

1. 上記 #22 の手順で ingest を実行したあと、DB を直接確認する。

2. 例: Supabase の SQL エディタまたは `psql` で  
   ```sql
   SELECT "externalId", title, "publishedAt", "effectiveAt"
   FROM "NormSource"
   ORDER BY "updatedAt" DESC
   LIMIT 10;
   ```

3. e-Gov の bulkdownload で同じ日付の CSV をダウンロードし、該当する法令IDの「改正法令公布日」「公布日」と照合する。  
   - CSV の「改正法令公布日」が入っている行では、DB の `publishedAt` がその日付（改正法令公布日）と一致すること。  
   - 「改正法令公布日」が空の行では、DB の `publishedAt` が「公布日」と一致すること。

### 簡易確認（DB だけ）

- ingest 実行後、`publishedAt` が **法律の初回公布日より新しい日付** になっているレコードがあれば、改正法令公布日で保存できている可能性が高い（例: 住民基本台帳法は昭和42年公布だが、改正の公示日で保存されていれば令和など新しい日付になる）。

---

## 3. まとめ

| 項目 | 確認方法 |
|------|----------|
| #22 bulkdownload 切り替え | `GET /api/ingest/laws?date=yyyyMMdd` が 200 で `ok: true`、`total`/`created`/`updated` が返り、一覧画面にデータが出る |
| #23 改正法令公布日で保存 | DB の `NormSource.publishedAt` が、bulkdownload CSV の「改正法令公布日」（空なら「公布日」）と一致する |

---

## 注意

- 日付 `yyyyMMdd` は、**過去**で e-Gov の bulkdownload に実際にデータがある日を指定してください。未来日（例: 20260214 を 2025 年時点で指定）やデータのない日は、レスポンスが空（0 bytes）になったり total:0 になります。
- 本番やステージングで確認する場合は、同じ手順で該当環境の URL に読み替えて実行してください。
