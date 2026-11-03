---
md_class: history
id: design-line-service-route-and-train-run-model
type: design
status: proposed
created: 2026-08-16
epic: epic-phase-minus-one
task: task-structure-lines-service-systems-and-operations
relations:
  - design-line-service-domain-model
  - design-train-run-state-machine-and-command-api
  - design-physical-route-creation-and-pathfinding
  - design-persistence-migration-and-reference-protection
  - design-line-and-operation-ui-ux-design
  - design-ai-command-and-preflight-inspection
  - design-line-and-operation-testing-matrix
  - design-line-operation-parallel-implementation
---

# Design: 路線・系統・経路・運行・運用の統合方針

## 決定

```text
Line ──1:N──> ServiceSystem (分類・集約用コンテナ)

Route ──> RouteStop[] + PhysicalTraversal[] + directionName (物理経路のみ)
Operation ──> Route + ServiceCalendar + StopTime[] + OperationLineAssignment[] (分類所属所有)
VehicleDuty ──> ordered Operation[] + Formation
```

### Line / ServiceSystem

`ServiceSystem` は必ず1つの `Line` に従属する。名称、略称、色、説明、表示順を持つ。路線・系統は運行を分類・グループ化するコンテナであり、正準データとしての所属関係は `Operation` が所有する。

### Route（経路）

物理走行内容の正本であり、方向、停車・通過地点、番線・停止位置、物理走行列を所有する。`RouteLineSection` は持たず、路線や系統が存在しなくても単独で作成・管理できる。反対方向は別経路とする。

### Operation（運行）

1つの経路を、いつ走るか、およびどの路線・系統に所属するかを表す。運行日・曜日・日付条件、経路上の各地点に対応する着発時刻、および路線・系統所属設定（`lineAssignments`）を所有する。未所属の運行も作成・運用できる。

### VehicleDuty（運用）

どの編成がどの運行をどの順序で担当するかを表す。時刻や経路を複製せず、運行を参照する。実際の走行状態は運用割り当てから生成される実行インスタンスで管理する。

## 重要な不変条件

- 系統の `lineId` は必須。
- 運行の所属（`lineAssignments`）において、親路線あたり最大1系統を設定できる（直属も可）。
- 運行の所属に指定された `lineId` および `serviceSystemId` は存在し、親路線関係と一致する。
- 運行の時刻エントリは経路地点IDを参照し、経路順に矛盾しない。
- 同一編成を時間が重なる複数運用へ割り当てない。
- 施設編集は参照中経路を壊さない。

## 詳細設計

- [ドメインモデル](line-service-domain-model.md)
- [状態遷移とコマンド](train-run-state-machine-and-command-api.md)
- [物理経路作成](physical-route-creation-and-pathfinding.md)
- [保存形式と参照保護](persistence-migration-and-reference-protection.md)
- [UI/UX](line-and-operation-ui-ux-design.md)
- [AI・事前確認](ai-command-and-preflight-inspection.md)
- [テスト](line-and-operation-testing-matrix.md)
- [並行実装計画](line-operation-parallel-implementation.md)
