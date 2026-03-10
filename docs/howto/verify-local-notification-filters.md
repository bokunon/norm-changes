# ローカルで通知用フィルタを確認する手順

デプロイ前にローカルで動作確認するときの手順です。

## 1. Prisma クライアントの生成

```bash
npx prisma generate
```

※ すでに実行済みでも、スキーマやマイグレーションを変えたあとはやり直すと安全です。

## 2. マイグレーション（DB に NotificationFilter テーブルがあること）

```bash
npx prisma migrate status
```

`Database schema is up to date!` と出ていれば OK。  
未適用のマイグレーションがある場合は:

```bash
npx prisma migrate deploy
```

## 3. 開発サーバーの起動（または再起動）

**重要**: `prisma generate` のあとで起動している必要があります。

- すでに `npm run dev` を動かしている場合は **一度止めてから** 再起動する。
- 止め方: ターミナルで `Ctrl+C`
- 起動: `npm run dev`

## 4. ブラウザで確認

1. 一覧: http://localhost:3000/norm-changes  
2. 設定（通知用フィルタ）: http://localhost:3000/settings  

設定ページで次を確認してください。

- 「Slack」が「設定済み」または「未設定」で表示される
- 「通知用フィルタ」の一覧が表示される（初回は空で OK）
- フィルタ名を入れて「追加」すると一覧に 1 件増える
- 一覧の「削除」で削除できる

## よくあるトラブル

- **「Prisma クライアントに NotificationFilter がありません」**  
  → `npx prisma generate` を実行したあと、**開発サーバーを再起動**してください。  
  起動中のプロセスは古いクライアントを参照したままです。

- **JSON のパースエラーや 500**  
  → DB に `NotificationFilter` テーブルがあるか確認し、必要なら `npx prisma migrate deploy` を実行してください。
