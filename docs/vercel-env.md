# Vercel の Environment Variables 用（コピペ）

**Issue #26**: 接続文字列（パスワード含む）をそのまま `DATABASE_URL` / `DIRECT_DATABASE_URL` に設定する形式に統一しています。

---

## 設定手順

1. Supabase の **Project Settings** → **Database** → **Connection string** で、**Transaction**（6543）と **Session**（5432）の **URI** をそれぞれコピーする。
2. 必要なら `?schema=public` を末尾に付ける（Supabase の URI に含まれていない場合）。
3. Vercel の **Environment Variables** に以下を追加する。

| Name | Value |
|------|--------|
| `DATABASE_URL` | 上でコピーした **Transaction（6543）** の接続文字列 |
| `DIRECT_DATABASE_URL` | 上でコピーした **Session（5432）** の接続文字列 |

**Value にはパスワードを含めた完全な接続文字列をそのまま貼る**（例: `postgresql://postgres.xxxx:あなたのパスワード@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?schema=public`）。

---

## ローカル .env からコピーする場合

すでにローカルの `.env` に接続文字列を設定している場合は、その値をそのまま Vercel の **Value** にコピペしてください。

---

## Slack を使う場合だけ

| Name | Value |
|------|--------|
| `SLACK_WEBHOOK_URL` | `https://hooks.slack.com/services/xxx/yyy/zzz` |

---

**注意**: `.env` は git に含めません。接続文字列にはパスワードが含まれるため、このファイルにも実際の値は記載しません。
