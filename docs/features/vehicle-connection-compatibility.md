---
md_class: status
feature: vehicle-connection-compatibility
updated: 2026-08-09
epic: epic-phase-minus-one
task: task-vehicle-data-and-connection-compatibility
---

# 車両カタログと接続互換性

`data/vehicles/`のYAMLから、製造会社、連結器、貫通ブレーキ、機関車、動力車、客車、貨車を読み込む。車両設計IDは4種類の車両カタログを横断して一意でなければならない。

`VehicleCatalog.checkConnection`は2両の接続端と運用方針を受け取り、次を返す。

- 総合的な編成適合
- 機械連結可否
- 貫通ブレーキ互換性
- 共通する貫通ブレーキ方式ID
- 連結器またはブレーキの違反理由

現在は編成状態と編成編集UIを実装していない。

## 実装

- `src/data/vehicleCatalog.ts`
- `tests/vehicleCatalog.test.ts`
- `data/vehicles/`
