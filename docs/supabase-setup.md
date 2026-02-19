# Supabase プロジェクト作成〜DB接続 ハンズオン

このドキュメントに沿って、Supabase を新規作成し、このアプリから接続・マイグレーションまで行います。

**Issue #26**: 接続文字列（パスワード含む）をそのまま `DATABASE_URL` / `DIRECT_DATABASE_URL` に設定する形式です。`DB_PASSWORD` 変数は使いません。

---

## 1. Supabase のプロジェクトを作成する

1. **https://supabase.com** にアクセスし、サインイン（GitHub などで OK）。
2. ダッシュボードで **「New project」** をクリック。
3. 以下を入力・選択して **「Create new project」** を押す。
   - **Name**: 任意（例: `norm-change-alerts`）
   - **Database Password**: 必ず **強めのパスワードを設定し、メモする**（後で接続文字列に使います）
   - **Region**: 近いリージョン（例: Northeast Asia (Tokyo)）
4. プロビジョニングが終わるまで 1〜2 分待つ。「Project is ready」が出たら OK。

---

## 2. 接続情報を 2 種類取得する

プロジェクトができたら、**2 種類の接続文字列**を取ります。

### 2-1. 接続文字列を取得する

1. 左メニュー **「Project Settings」**（歯車）→ **「Database」**。
2. 下の方の **「Connection string」** で **「URI」** タブを選ぶ。
3. **「Transaction」**（6543）と **「Session」**（5432）の 2 つを、それぞれ **「Copy」** でコピーする。  
   パスワード `[YOUR-PASSWORD]` の部分を、Supabase で設定した **Database Password** に置き換えた状態でコピーする（またはコピー後に手で置換する）。
4. 必要なら末尾に `?schema=public` を付ける（Supabase の URI に含まれていない場合）。

例（Transaction）: `postgresql://postgres.[PROJECT_REF]:[YOUR-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?schema=public`  
例（Session）: `postgresql://postgres.[PROJECT_REF]:[YOUR-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?schema=public`

---

## 3. このリポジトリの .env を設定する（接続文字列をそのまま貼る）

1. **`.env.example`** をコピーして **`.env`** を作成する。
2. **`.env`** を開き、**`DATABASE_URL`** と **`DIRECT_DATABASE_URL`** に、上で取得した **接続文字列をそのまま**貼り付ける（パスワードはすでに含めた完全な文字列）。

```env
DATABASE_URL="postgresql://postgres.xxxx:あなたのパスワード@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?schema=public"
DIRECT_DATABASE_URL="postgresql://postgres.xxxx:あなたのパスワード@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?schema=public"
```

パスワードに `@` や `#` が含まれる場合は、その部分だけ URL エンコード（`@` → `%40`、`#` → `%23`）してから接続文字列に含める。

保存したら、次のコマンドで接続確認（アプリ経由）:

```bash
npm run dev
# 別ターミナルで
curl http://localhost:3000/api/db-health
```

`{"ok":true,"now":"..."}` が返れば OK。

---

## 4. マイグレーションを適用する

接続が確認できたら、Prisma のマイグレーションを実行します。**DIRECT_DATABASE_URL**（Session mode）が使われるため、数十秒以内に終わります。

```bash
npx prisma migrate deploy
```

成功すると、次のようなメッセージが出ます:

```
X migration(s) applied.
```

ここまで完了していれば、Supabase のテーブル（NormSource, NormChange, Tag など）が作成されています。

---

## 5. 動作確認（任意）

- 一覧ページ: ブラウザで **http://localhost:3000/norm-changes**
- 法令を取り込む: **http://localhost:3000/api/ingest/laws?date=20230201** にアクセス（GET）
- 解析して NormChange を作成: **http://localhost:3000/api/analyze** に POST（curl や Postman で `POST /api/analyze`）
- 再度 **http://localhost:3000/norm-changes** で一覧にデータが出るか確認

---

## トラブルシューティング

| 現象 | 対処 |
|------|------|
| P1013 "scheme is not recognized" | URI の先頭が `postgresql://` または `postgres://` になっているか確認。パスワードの特殊文字を URL エンコード。 |
| "prepared statement s1 already exists" | マイグレーション時に **6543** が使われている。**DIRECT_DATABASE_URL** に **Session mode（5432）** の URI が入っているか確認。 |
| migrate status / deploy がずっと動かない | **DIRECT_DATABASE_URL** を設定し、5432 の URI にし、再度実行。 |
| /api/db-health が 500 | **DATABASE_URL** のパスワード・ホストが正しいか確認。Supabase のプロジェクトが一時停止していないか確認。 |

---

## 参照

- [Supabase: Connect to your database](https://supabase.com/docs/guides/database/connecting-to-postgres)
- このリポジトリの [README 初回セットアップ](../README.md#初回セットアップ)
