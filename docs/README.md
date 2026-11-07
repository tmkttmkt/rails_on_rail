---
md_class: operation
---

# ドキュメント索引

## 最初に読む

1. [AIエージェント向け命令書](../AI.md)
2. [プロジェクト概要](../README.md)
3. [開発ワークフロー](workflow.md)

## 現在の開発

- [Epic一覧](epics/README.md)
- [Phase -1 Epic](epics/phase-minus-one.md)
- [Task一覧](task-index.md)
- [操作とキーボード割当](controls.md)

## 将来構想

- [技術方針](planning/technical-direction.md)
- [開発段階](planning/development-stages.md)

## 長期設計課題

Epicとは独立した、複数Phaseにまたがる設計上の未解決問題。方針が固まるたびに更新する。

- [需要の設計](planning/demand-design.md) — リアリティと計算量のトレードオフ
- [ダイヤの設計](planning/timetable-design.md) — 詳細さと操作の楽さのトレードオフ

## 調査（Research）

- [鉄道規格カテゴリ](research/railway-spec-categories.md) — 軌間・電化・保安装置などの分類と代表値

これらは中長期の構想を示す資料であり、現在作業の直接的な指示はEpicとTaskを正本とする。

## 開発プロトコル

- [Rails on RailのAOTP運用](aotp.md)
- [開発ワークフロー](workflow.md)
- [Taskの作成方法](tasks/README.md)
- [AI向け 外部操作ガイド](ai-operations.md)

## ソースコード仕様（docs/src/）

- [simulation モジュール](src/simulation.md) — 状態・座標変換・操作命令・規格型の仕様
- [ui モジュール](src/ui.md) — Canvas描画とUI状態管理の仕様

## 実装済み機能

- [編成の留置配置](features/stabling-placement.md) — 編成全体の範囲包含と分岐支障の検査

- [ゲーム内時間](features/simulation-clock.md) — 保存される日時、一時停止、時間速度

## データ定義

- [データ定義の入口](../data/README.md)
- [鉄路データ](../data/track/README.md)

## 文書領域

- `epics/` — 開発フェーズの目的、範囲、受入条件
- `tasks/` — Epicを実現する作業単位と検証結果
- `designs/` — 実装方法と設計判断
- `research/` — 調査で確認した事実と出典
- `features/` — 現在実装されている仕様
- `impl-notes/` — 設計との差異と実装時の注意
- `src/` — ソースコードモジュールの仕様と依存関係
- ルート`data/` — YAMLによるゲームデータの正本

この索引には、現在の状態を理解するための正本だけを掲載する。個別作業の詳細はTaskから必要な文書へ辿る。
