# Vercel を「プッシュ＝CLI デプロイ」で動かす（GitHub Actions）

GitHub 連携の自動デプロイでは「プッシュした人」が Vercel チームのメンバーでないと失敗することがあります。  
このリポジトリでは **main への push 時に GitHub Actions が Vercel CLI でデプロイ**するようにしてあるので、**誰がプッシュしても** Vercel にログインしているあなたのアカウント（トークン）でデプロイされます。

## 初回だけ：GitHub にシークレットを登録

次の 3 つを GitHub の **Settings → Secrets and variables → Actions** で登録してください。

| Name | 取得方法 |
|------|----------|
| `VERCEL_TOKEN` | [Vercel: Account → Tokens](https://vercel.com/account/tokens) で「Create」してトークンをコピー |
| `VERCEL_ORG_ID` | 下記「ID の調べ方」参照 |
| `VERCEL_PROJECT_ID` | 下記「ID の調べ方」参照 |

### ID の調べ方

**方法 A（おすすめ）**  
プロジェクトルートで一度だけ実行：

```bash
npx vercel link
```

対話で「Set up and deploy?」→ 対象の Vercel プロジェクトを選ぶ。  
完了すると `.vercel/project.json` ができるので、中身を開く：

```bash
cat .vercel/project.json
```

`orgId` を **VERCEL_ORG_ID**、`projectId` を **VERCEL_PROJECT_ID** として GitHub の Actions シークレットに登録する。  
（`.vercel` は .gitignore に入っているのでコミットされません。）

**方法 B**  
Vercel ダッシュボードで対象プロジェクトを開く → **Settings → General**。  
「Project ID」が VERCEL_PROJECT_ID。  
Org ID は **Team / Account の Settings** の URL や API から確認できる。

## 動き方

- **main に push** → 自動で `.github/workflows/deploy-vercel.yml` が動く  
- **Vercel CLI** で `vercel pull` → `vercel build` → `vercel deploy --prebuilt --prod` を実行  
- デプロイは **VERCEL_TOKEN** のアカウント（＝Vercel に登録しているあなた）として行われる

「プッシュした Git ユーザ」と「Vercel のチームメンバー」が一致していなくても、このワークフローならデプロイできます。

## 補足

- プレビュー（main 以外のブランチ）も自動デプロイしたい場合は、ワークフローに `branches: [main]` 以外のトリガーを追加し、`--prod` を外したデプロイステップを追加すればよいです。
- GitHub 連携の「Vercel が push を検知してデプロイ」は、このリポジトリでは使わず、**CLI デプロイだけ**にしても問題ありません。Vercel のプロジェクト設定で「Git 連携」を外しても、上記ワークフローはそのまま動きます。
