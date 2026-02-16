# Supabase 無料 vs 有料：接続まわりで起きたこと・有料ならどう楽か

このプロジェクトで Supabase 接続に手間取った原因と、**有料（Pro / IPv4 アドオン）にしていたら省けた手間**をまとめます。

---

## 何が起きていたか（無料プランで起きたこと）

### 1. マイグレーションで「prepared statement "s1" already exists」

- **原因**: **Transaction mode プーラー**（port 6543）は、接続を「トランザクション単位」で使い回す。Prisma の `migrate` が使う **prepared statement** をサポートしていない。
- **対処**: マイグレーションだけ **Session mode プーラー**（port 5432）を使う必要があり、**DIRECT_DATABASE_URL** に Session 用の URI を別途設定した。

### 2. Direct 接続（db.xxx.supabase.co:5432）が使えない・つながらない

- **原因**: 無料プランでは **Direct 接続は IPv6 のみ**。自宅・オフィスなど **IPv4 しかない環境**からは接続できない（タイムアウトや「つながらない」）。
- **対処**: Direct は諦め、**Session mode プーラー**（IPv4 対応）を **DIRECT_DATABASE_URL** に設定。  
  → 結果として「アプリ用 6543」「マイグレーション用 5432」の **2 種類の接続文字列**を用意する必要があった。

### 3. 「Tenant or user not found」

- **原因**: `.env` の **${DB_PASSWORD}** が Next.js 側で展開されず、接続文字列のパスワードがリテラル `"${DB_PASSWORD}"` のまま DB に送られていた（Supabase 側から見ると「不正なユーザー」）。
- **対処**: **instrumentation** で起動時に dotenv-expand を実行し、パスワードを 1 箇所（DB_PASSWORD）に書いても接続文字列で展開されるようにした。

### 4. 接続文字列の P1013・「scheme is not recognized」

- **原因**: **DIRECT_DATABASE_URL** が未設定や空・不正な形式のとき、Prisma が不正な URL として扱った。
- **対処**: prisma.config で「有効な postgres(ql):// URL のときだけ DIRECT_DATABASE_URL を使う」ようにし、未設定時は DATABASE_URL にフォールバック。

### 5. migrate status / deploy がずっと動かない（10分待っても応答なし）

- **原因**: 6543（Transaction mode）のままマイグレーション系コマンドを実行しており、プーラー側でブロック／待ち状態になっていた。
- **対処**: **DIRECT_DATABASE_URL** に Session mode（5432）を設定して、マイグレーションは 5432 経由で実行。

---

## 有料にしていたら省けたはずの手間

Supabase の料金は次のとおりです。

- **IPv4 アドオン**は **Pro プラン以上でないと利用できない**（単体では買えない）。Pro（$25/月）に入ったうえで IPv4 を有効にすると、約 **$4/月** が加算される。
- したがって「IPv4 だけ $4 で」という選択肢はなく、**実質的には Pro（$25）＋ IPv4（約 $4）＝ 月額 約 $29 程度**から、下記の「楽になる点」が得られる。

### Pro ＋ IPv4 にしていた場合に省けた手間

| 無料で起きたこと | Pro ＋ IPv4 なら |
|------------------|-------------------|
| Direct 接続が IPv6 のみで自宅などからつながらない | **Direct 接続が IPv4 でも利用可能**。同じネットワークから「Direct 用 1 本」でマイグレーションも実行できる。 |
| アプリ用 6543 とマイグレーション用 5432（Session）の **2 種類の URI** を用意・使い分け | **Direct（5432）を 1 本**用意し、マイグレーションはそれで実行。「マイグレーション用に Session mode の URI を探して DIRECT_DATABASE_URL に貼る」手間が不要になる。 |
| Session mode の URI をダッシュボードで探して DIRECT_DATABASE_URL に貼る手順 | **Direct の URI を 1 本**コピーすればよく、Session/Transaction の違いを意識しなくてよい。 |

→ **「Direct が IPv4 で使える」だけで、接続の種類を減らし、マイグレーションまわりで Session を意識する手間がかなり減る。**

### まとめ

- **$4 単品では入れない**: IPv4 アドオンは **Pro 以上**が前提。無料プランのまま IPv4 だけ付けることはできない。
- **Pro（$25）＋ IPv4（約 $4）** にしていたら、「Direct を IPv4 で 1 本用意してマイグレーションに使う」だけで、**Session mode を意識して 2 種類のプーラー URL を理解・設定する手間**はかなり減っていた、という整理。

---

## このプロジェクトで「無料のまま」やった対処の整理

- **DATABASE_URL**: アプリ用。Transaction mode（6543）。
- **DIRECT_DATABASE_URL**: マイグレーション用。**Session mode（5432）** を明示的に設定（IPv4 で使うため Direct ではなく Session を選んだ）。
- **instrumentation**: `${DB_PASSWORD}` を確実に展開。
- **postinstall**: Vercel などで `prisma generate` を実行。

Pro ＋ IPv4 にしていれば、「Direct を IPv4 で 1 本用意してマイグレーションに使う」だけで、**Session mode を意識して 2 種類のプーラー URL を理解・設定する手間**はかなり減っていた、という整理になります。
