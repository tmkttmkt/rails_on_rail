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
Line ──1:N──> ServiceSystem

Route ──> RouteStop[] + PhysicalTraversal[] + RouteLineSection[] + directionName
Operation ──> Route + ServiceCalendar + StopTime[]
VehicleDuty ──> ordered Operation[] + Formation
```

### Line / ServiceSystem

`ServiceSystem` は必ず1つの `Line` に従属する。名称、略称、色、説明、表示順を持つが、停車駅・経路・時刻・編成は所有しない。単なる運行のまとめではなく、路線内の任意の系統アイデンティティである。

### Route（経路）

走行内容の正本であり、方向、停車・通過地点、番線・停止位置、物理走行列を所有する。路線・系統は `RouteLineSection` に区間単位で設定するため、1経路内で直通や再進入を表現できる。反対方向は別経路とする。

### Operation（運行）

1つの経路を、いつ走るかを表す。運行日・曜日・日付条件と、経路上の各地点に対応する着発時刻を所有する。経路を変更すれば参照する運行へ影響するため、確定済み運行がある経路編集は確認または拒否を行う。

### VehicleDuty（運用）

どの編成がどの運行をどの順序で担当するかを表す。時刻や経路を複製せず、運行を参照する。実際の走行状態は運用割り当てから生成される実行インスタンスで管理する。

## 重要な不変条件

- 系統の `lineId` は必須。
- 経路区間は経路全体を重複なく順序通りに覆う。
- 区間の `serviceSystemId` は、その区間の `lineId` を親に持つ。
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
