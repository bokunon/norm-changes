# セキュリティスキャンレポート

SAST / SCA / DAST の各種セキュリティテスト結果を格納しています。

## フォルダ構成

```
docs/security/
├── README.md           # 本ファイル（索引）
├── 2025-03-05/         # 2025年3月5日実施分
│   ├── report.md       # 統合レポート（サマリ＋3種の詳細）
│   └── zap.yaml        # DAST 用 ZAP オートメーションプラン
└── ...
```

## 直近のスキャン

| 実施日 | SAST | SCA | DAST |
|--------|------|-----|------|
| [2025-03-05](./2025-03-05/report.md) | 0 findings | 13 vulns | FAIL:0, WARN:11 |

## 再実行方法

- **SAST**: `gh workflow run sast-semgrep.yml`
- **SCA**: `gh workflow run sca-npm-audit.yml`
- **DAST**: `gh workflow run dast-zap.yml`
