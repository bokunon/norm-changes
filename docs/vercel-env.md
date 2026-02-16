# Vercel の Environment Variables 用（コピペ）

## 方法A: ローカル .env から展開してコピー（いちばん楽）

プロジェクトルートで実行すると、`.env` の `DB_PASSWORD` を展開した値が出力されます。  
**1行目を DATABASE_URL、2行目を DIRECT_DATABASE_URL の Value にコピペ**してください。

```bash
node -e "require('dotenv-expand').expand(require('dotenv').config()); console.log(process.env.DATABASE_URL); console.log(process.env.DIRECT_DATABASE_URL);"
```

Vercel では **Name** に `DATABASE_URL` / `DIRECT_DATABASE_URL`、**Value** に上で出た行をそれぞれ貼るだけです。

---

## 方法B: このファイルのプレースホルダーを置換してコピー

1. **YOUR_PASSWORD_HERE** を実際の Supabase Database Password に置き換える（2箇所とも）
2. 下の「Key」と「Value」を Vercel の Environment Variables にそのままコピペする

---

## 1. DATABASE_URL

**Key**
```
DATABASE_URL
```

**Value**（上で置換したあとコピー）
```
postgresql://postgres.wzkjnmowrlfgvkuzyiio:YOUR_PASSWORD_HERE@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?schema=public
```

---

## 2. DIRECT_DATABASE_URL

**Key**
```
DIRECT_DATABASE_URL
```

**Value**（上で置換したあとコピー）
```
postgresql://postgres.wzkjnmowrlfgvkuzyiio:YOUR_PASSWORD_HERE@aws-1-ap-south-1.pooler.supabase.com:5432/postgres?schema=public
```

---

## 3. Slack を使う場合だけ

**Key**
```
SLACK_WEBHOOK_URL
```

**Value**
```
https://hooks.slack.com/services/xxx/yyy/zzz
```

---

**手順まとめ**: このファイルを開く → YOUR_PASSWORD_HERE を実際のパスワードに一括置換 → 各 Key を Vercel の「Name」に、対応する Value を「Value」にコピペ。
