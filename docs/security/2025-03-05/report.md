# セキュリティスキャンレポート（2025-03-05）

## 実行概要

| 種別 | ツール | 実行日時 | 結果 |
|------|--------|----------|------|
| SAST | Semgrep (p/owasp-top-ten, p/javascript) | 2025-03-05 | 0 findings |
| SCA | npm audit | 2025-03-05 | 13 vulnerabilities (6 moderate, 7 high) |
| DAST | OWASP ZAP (GitHub Actions) | 2025-03-05 | FAIL: 0, WARN: 11, PASS: 56 |

---

## SAST（静的解析）結果

**ツール**: Semgrep  
**ルールセット**: OWASP Top Ten, JavaScript  
**スキャン対象**: 139 ファイル（git 追跡分、node_modules/.next 除外）

- **検出件数**: 0
- **ブロック件数**: 0
- **ルール実行数**: 102

---

## SCA（依存関係スキャン）結果

**ツール**: npm audit  
**検出件数**: 13（moderate: 6, high: 7）

### 直接依存で対応可能なもの（`npm audit fix` で修正可能）

| パッケージ | 重大度 | 概要 | 対応 |
|------------|--------|------|------|
| fast-xml-parser | high | DoS（entity expansion）、stack overflow | `npm audit fix` |
| ajv | moderate | ReDoS（$data オプション使用時） | `npm audit fix` |
| minimatch | high | ReDoS（複数パターン） | `npm audit fix` |
| rollup | high | パストラバーサルによる任意ファイル書き込み | `npm audit fix` |

### Prisma 経由（破壊的変更を伴う可能性）

| パッケージ | 重大度 | 概要 | 備考 |
|------------|--------|------|------|
| prisma / @prisma/dev | high | @hono/node-server, hono, lodash 等の脆弱性を引き継ぐ | `npm audit fix --force` で prisma@6.19.2 にダウングレード（破壊的変更） |
| @hono/node-server | high | 静的パス認証バイパス（エンコードされたスラッシュ） | Prisma の dev 依存 |
| hono | high | XSS, キャッシュデコイション, IP スプーフィング, 任意ファイルアクセス等 | Prisma の dev 依存 |
| lodash | moderate | Prototype Pollution（_.unset, _.omit） | chevrotain → Prisma 経由 |

### 推奨アクション（SCA）

1. **即時対応**: `npm audit fix` を実行し、fast-xml-parser, ajv, minimatch, rollup を修正
2. **Prisma 系**: prisma 7.x のアップデート待ち、または `npm audit fix --force` による prisma 6.x へのダウングレードを検討（破壊的変更の影響を確認してから）

---

## DAST（動的解析）結果

**ツール**: OWASP ZAP Baseline Scan  
**対象 URL**: https://norm-changes.vercel.app  
**実行**: GitHub Actions (`.github/workflows/dast-zap.yml`)

### サマリ

| 種別 | 件数 |
|------|------|
| FAIL | 0 |
| WARN | 11 |
| PASS | 56 |

### WARN（要対応・検討）

| ルール ID | 内容 | 該当 URL 例 |
|-----------|------|-------------|
| 10015 | Re-examine Cache-control Directives | /, /norm-changes |
| 10020 | Missing Anti-clickjacking Header (X-Frame-Options) | /, /norm-changes |
| 10021 | X-Content-Type-Options Header Missing | /, /_next/static/... |
| 10038 | Content Security Policy (CSP) Header Not Set | /, /norm-changes |
| 10044 | Big Redirect Detected (Potential Sensitive Information Leak) | / (307) |
| 10049 | Storable and Cacheable Content | /_next/static/... |
| 10050 | Retrieved from Cache | /, /_next/static/... |
| 10063 | Permissions Policy Header Not Set | /, /_next/static/... |
| 10098 | Cross-Domain Misconfiguration | /, /_next/static/... |
| 10109 | Modern Web Application | /, /norm-changes |
| 90004 | Cross-Origin-Embedder-Policy Header Missing or Invalid | /, /norm-changes |

### 推奨アクション（DAST）

1. **セキュリティヘッダー追加**（Next.js `next.config`）  
   - X-Frame-Options: DENY または SAMEORIGIN  
   - X-Content-Type-Options: nosniff  
   - Content-Security-Policy（段階的に導入）  
   - Permissions-Policy（旧 Feature-Policy）  
   - Cross-Origin-Embedder-Policy（必要に応じて）

2. **キャッシュポリシー見直し**  
   - 静的アセット以外の Cache-Control を確認

3. **DAST の再実行**  
   - `gh workflow run dast-zap.yml` で手動実行（GitHub Actions で Docker 不要）  
   - レポートは Artifacts にアップロードされる

---

## 次のステップ

- [ ] `npm audit fix` を実行して修正可能な脆弱性を解消
- [ ] Prisma 7.x のセキュリティパッチ状況を確認
- [ ] Next.js にセキュリティヘッダー（X-Frame-Options, X-Content-Type-Options 等）を追加
- [ ] 本レポートを元に Issue #80 シリーズの子チケットを更新
