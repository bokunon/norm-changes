# 法令インパクト管理システム - ドキュメント目次

このドキュメント群は、法令・省令・政令・ガイドラインの公示情報を自動監視し、企業にとってのビジネスインパクトを分析・通知するシステムの全体像をまとめたものです。

---

## 📋 ドキュメント構成

### 1. **[01-SYSTEM_OVERVIEW.md](01-SYSTEM_OVERVIEW.md)** - システム全体概要
システムの目的、主要機能、技術スタック、および全体構成図を示します。

**対象者**: 経営層、プロダクトマネージャー、新規参画者

**内容:**
- プロジェクト概要・目的
- 技術スタック（フロントエンド・バックエンド・外部連携）
- システム構成図（全体像）
- コアビジネスロジック（リスク分類、法令種別、タグシステム）
- データフロー（概要）
- 主要処理フロー（Ingest → Analyze → Notification）
- ユーザーペルソナと機能マッピング
- 環境構成（ローカル・開発・本番）

---

### 2. **[02-DETAILED_ARCHITECTURE.md](02-DETAILED_ARCHITECTURE.md)** - 詳細アーキテクチャ
システムのレイヤー構成、コンポーネント分解、処理フローの詳細を示します。

**対象者**: アーキテクト、シニア開発者、システム設計者

**内容:**
- レイヤー構成（プレゼンテーション・ビジネスロジック・データアクセス・永続化）
- コンポーネント分解（フロントエンド・API・ビジネスロジック・データアクセス）
- フロントエンド層の詳細（ページ構成、API Routes）
- ビジネスロジック層の詳細（各モジュールの責務）
- データアクセス層（Prisma ORM・スキーマ概要）
- データフロー詳細（Ingest・Analyze・Notify）
- 統合フロー
- 外部連携（e-Gov API・OpenAI API・Slack Webhook）
- セキュリティ考慮事項
- 拡張ポイント

---

### 3. **[03-IMPLEMENTATION_DESIGN.md](03-IMPLEMENTATION_DESIGN.md)** - 実装設計（モジュール詳細仕様）
各モジュール・コンポーネントの実装レベルの詳細仕様を示します。

**対象者**: 開発者、技術リード

**内容:**
- **Ingest モジュール設計**
  - e-Gov API 連携（エンドポイント、パラメータ、エラー処理）
  - ZIP/XML 処理（抽出・パース・エンコーディング変換）
  - 法令取得・正規化（重複チェック・DB保存）
  - 進捗状態管理（IngestState）

- **Analyze モジュール設計**
  - テキスト解析（キーワード抽出・リスク判定）
  - リスク判定ロジック（キーワードセット・マッチングアルゴリズム）
  - AI レポート生成（OpenAI プロンプト例）
  - 実行制御（全体の流れ）

- **Notification モジュール設計**
  - フィルタマッチング（複数条件の AND 結合）
  - Slack 通知（メッセージビルド・送信）

- **API Routes 仕様** （詳細な実装例）
  - エンドポイント別の入出力、処理フロー

- **データベーストランザクション設計**（データ整合性確保）

- **エラーハンドリング戦略**
  - リトライ政策（各エラータイプ別）
  - ロギング（構造化ログ例）

---

### 4. **[04-DATA_MODEL_ERD_DFD.md](04-DATA_MODEL_ERD_DFD.md)** - データモデル・ERD・DFD
データベーススキーマの詳細と、データフロー図を示します。

**対象者**: データベース設計者、DBA、バックエンドエンジニア

**内容:**
- **エンティティ関連図（ER図）**
  - 全テーブルの関連図（Mermaid形式）
  - 各テーブルの詳細説明（列・型・制約・インデックス）
  - 事前定義タグの例

- **データフロー図（DFD）**
  - Level 0: 全体的なデータフロー
  - Level 1: 各フェーズ別フロー（Ingest・Analyze・Notify）
  - 詳細シーケンス図（単一 NormChange の処理パス）

- **データボリューム・パフォーマンス見積もり**
  - 月額増分、年間想定ボリューム
  - クエリ性能と対応インデックス

- **テーブル関連図（物理設計）**
  - ASCII アート形式の関連図

---

### 5. **[05-API_SPECIFICATION.md](05-API_SPECIFICATION.md)** - API 仕様書
すべての API エンドポイントの詳細仕様を示します。

**対象者**: フロントエンド開発者、API 利用者、テスター

**内容:**
- API 概要（ベースURL・認証・レスポンス形式）
- API エンドポイント一覧表
- **詳細エンドポイント仕様** （15個のエンドポイント）
  - GET/POST /api/norm-changes
  - GET /api/norm-changes/[id]
  - POST /api/ingest/laws（手動実行）
  - POST /api/ingest/cron（自動実行）
  - GET /api/ingest/state
  - GET /api/ingest/cron-logs
  - POST /api/analyze
  - CRUD /api/notification-filters
  - POST /api/slack-config
  - GET /api/openai-usage
  - GET /api/db-health
  - GET /api/debug-openai-env

  （各エンドポイントについて、リクエスト・レスポンス・エラーハンドリングを記載）

- 共通ヘッダー
- エラーコード一覧
- レート制限（検討事項）

---

## 📚  既存ドキュメント

本システムには、以下の既存ドキュメント（実装過程の記録・議論）も保存されています：

### 設計・要件書
- **architecture.md** - アーキテクチャ初期概要（簡略版）
- **current-spec-and-gaps.md** - 現在の仕様と課題
- **spec-issue-12-report-and-ai.md** - AI報告書生成機能の仕様
- **risk-definition-issue-16.md** - リスク分類の定義

### Issue 対応ドキュメント
- **issue-67-implementation-plan.md** - Issue #67 実装計画
- **issue-72-fallback-penalty-detail-quality.md** - ペナルティ詳細抽出の品質向上
- **issue-73-fallback-test-results.md** - テスト結果

### セットアップ・運用
- **supabase-setup.md** - Supabase セットアップ手順
- **vercel-deploy-by-cli.md** - Vercel デプロイ（CLI）
- **vercel-env.md** - Vercel 環境設定
- **refresh-ingest.md** - データ取得スクリプトの使用方法

### その他
- **bulkdownload-flow-confirmation.md** - 一括ダウンロード処理の動作確認
- **spec-plan-promulgated-not-yet-in-force.md** - 公示済未施行の法令処理
- **verification-issue-22-23.md** - 検証テスト結果

---

## 🎯 ドキュメント読み方ガイド

### 初期段階（プロジェクト全体を理解したい方）
1. **01-SYSTEM_OVERVIEW.md** を読む
2. **02-DETAILED_ARCHITECTURE.md** で処理フロー・コンポーネントを確認
3. 必要に応じて各詳細ドキュメントを参照

### 開発開始前（システム設計を確認したい方）
1. **02-DETAILED_ARCHITECTURE.md** で全体構成を確認
2. **04-DATA_MODEL_ERD_DFD.md** でデータモデルを確認
3. **03-IMPLEMENTATION_DESIGN.md** で実装詳細を確認
4. **05-API_SPECIFICATION.md** で API 仕様を確認

### 特定機能の開発（モジュール実装したい方）
1. **03-IMPLEMENTATION_DESIGN.md** で当該モジュールの仕様確認
2. **04-DATA_MODEL_ERD_DFD.md** でデータモデル確認
3. **05-API_SPECIFICATION.md** で関連 API 仕様確認
4. 既存ドキュメントで関連する Issue の議論を確認

### API 統合（フロントエンド実装したい方）
1. **05-API_SPECIFICATION.md** で全エンドポイントを確認
2. **04-DATA_MODEL_ERD_DFD.md** でデータモデルを確認
3. 実装コードで実際のレスポンス形式を確認

---

## 🔄 ドキュメント更新フロー

1. **何か実装内容が変わったら** → 対応する詳細ドキュメント（03-05）を更新
2. **大きな要件変更があったら** → まず 01-02 を更新し、その後詳細に反映
3. **Issue で大きな議論があったら** → 該当ドキュメントに結論を反映

---

## 📖 クイックリファレンス

| 質問 | 参照ドキュメント |
|------|-----------------|
| システムの目的は？ | 01-SYSTEM_OVERVIEW.md §1 |
| データフロー全体は？ | 01-SYSTEM_OVERVIEW.md §5, 04-DATA_MODEL_ERD_DFD.md §2 |
| 何個のコンポーネントがあるか？ | 02-DETAILED_ARCHITECTURE.md §2 |
| Ingest 処理の詳細は？ | 03-IMPLEMENTATION_DESIGN.md §1, 04-DATA_MODEL_ERD_DFD.md §2.2 |
| データベーススキーマは？ | 04-DATA_MODEL_ERD_DFD.md §1 |
| `/api/norm-changes` の仕様は？ | 05-API_SPECIFICATION.md §3.1 |
| リスク判定のアルゴリズムは？ | 03-IMPLEMENTATION_DESIGN.md §2.2 |
| 外部 API 連携は何か？ | 02-DETAILED_ARCHITECTURE.md §5 |
| セキュリティの考慮点は？ | 02-DETAILED_ARCHITECTURE.md §6 |

---

## 📝 今後のドキュメント追加予定

- [ ] テスト設計書（単体・統合・E2E）
- [ ] デプロイ・運用マニュアル
- [ ] トラブルシューティングガイド
- [ ] パフォーマンスチューニングガイド
- [ ] セキュリティハードニングガイド

---

## 📞 ドキュメント作成情報

- **作成日**: 2026-03-03
- **対象バージョン**: v0.1.0
- **作成者**: システム設計チーム
- **最終更新**: 2026-03-03

---

**すべてのドキュメントは Git で管理され、Issue・PR で更新されます。ご質問・ご指摘は GitHub Issues でお願いします。**
