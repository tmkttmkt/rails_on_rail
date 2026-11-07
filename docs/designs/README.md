---
md_class: operation
---

# Design

機能や構造をどう実装するか、選択肢、採用理由、インターフェース、影響、検証方法を記録する履歴文書である。関連Taskを明示し、該当するPhase Epicがある場合はそれも記載する。

## 現在の主要Design

### 路線・系統・経路・運行・運用

- [路線・系統・経路・運行・運用の統合方針](line-service-route-and-train-run-model.md)
  - [ドメインモデル](line-service-domain-model.md)
  - [運行・運用の状態遷移と共通コマンド](train-run-state-machine-and-command-api.md)
  - [経路の作成と物理経路探索](physical-route-creation-and-pathfinding.md)
  - [v11保存形式・移行・参照保護](persistence-migration-and-reference-protection.md)
  - [路線・系統・経路・運行・運用のUI/UX](line-and-operation-ui-ux-design.md)
  - [AIコマンドと確定前確認](ai-command-and-preflight-inspection.md)
  - [テストマトリクス](line-and-operation-testing-matrix.md)
  - [並行実装計画](line-operation-parallel-implementation.md)

### 車両・編成・発車予約・駅配置

- [Fleet所有実体のゲーム状態統合](fleet-state-integration.md)
- [テスト車両取得と編成組換え](test-vehicle-acquisition-and-formation-editing.md)
- [駅停車線への編成配置](station-track-vehicle-placement.md)
- [一回限りの時刻指定発車](one-shot-scheduled-dispatch.md)
- [車両管理UI](vehicle-management-ui.md)

### 線路・軌道・トポロジー

- [駅間経路と列車移動](route-and-train-movement.md)
- [駅と線路上の停車地点](station-stop-points.md)
- [独立した線路接続点](track-junction-topology.md)
- [N本からM本への接続対応調整](bundle-connection-alignment.md)
- [円弧チェーンによる曲線敷設](circular-arc-track-building.md)
- [独立線路と変更可能な線路群](independent-tracks-and-groups.md)
- [マップのセーブ形式](map-save-format.md)

### 操車・入換

- [ベカソヴォの入換](bekasovo-yard-operations.md)
