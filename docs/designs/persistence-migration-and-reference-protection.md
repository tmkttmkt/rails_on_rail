---
md_class: history
id: design-persistence-migration-and-reference-protection
type: design
status: proposed
created: 2026-08-16
epic: epic-phase-minus-one
task: task-structure-lines-service-systems-and-operations
relations: [design-line-service-domain-model, design-map-save-format]
---

# Design: v11保存形式・移行・参照保護

## v11トップレベル

```json
{
  "version": 11,
  "lines": {},
  "serviceSystems": {},
  "routes": {},
  "operations": {},
  "vehicleDuties": {},
  "vehicleDutyExecutions": {},
  "operationExecutions": {}
}
```

## v10からの移行

1. 旧 `Line` は維持する。
2. 旧 `ServicePattern` は単一親路線の `ServiceSystem` へ変換し、略称・色・説明・表示順を可能な範囲で引き継ぐ。複数路線所属だった場合は路線ごとに系統を決定論的に分割する。
3. 旧方向と `OperationRoute` の組を独立した `Route` へ変換する。方向、停車・通過地点、番線、停止位置、legsを引き継ぐ。経路から `lineSections` は持たない。
4. 旧予約・個別列車の経路参照と日時、および所属路線・系統（`lineAssignments`）を `Operation` へ移行する。同じ経路・同じ時刻条件は重複排除できる。
5. 旧編成割り当ては `VehicleDuty.defaultFormationId` へ変換する。前後関係を復元できない場合は1運行1運用とする。当日固有の割り当ては `VehicleDutyExecution` へ移す。
6. 実行中状態は `OperationExecution` へ移す。

## v11既存セーブデータの互換性正規化（`normalizeVersion11`）

初期v11形式で保存された `route.lineSections` が存在する場合、ロード時に自動的に各 `operation.lineAssignments` へ移行・集約し、`route.lineSections` を除去する。この処理により情報欠落なく新モデルへ正規化される。

## 参照保護

- `Route.stops` が参照する駅・線路・停止位置を削除または無効化しない。
- `Route.legs` が参照する線路・ジャンクションを削除、短縮、非接続化しない。
- `Operation` から参照中の経路削除は拒否する。
- `VehicleDuty` から参照中の運行削除は拒否する。
- 予約・走行中の実行が参照する運用、運行、経路、編成の変更・削除は拒否する。
- 路線削除は所属系統または運行所属（`operation.lineAssignments`）参照があれば拒否する。
- 系統削除は運行所属（`operation.lineAssignments`）参照があれば拒否する。

自動再探索や連鎖削除は行わず、参照元を一覧表示する。

## ロード原子性

スキーマ、ID参照、複数日の `dayOffset` / `serviceDayOffset` を含む時刻順、運用順、通常・日別編成参照、施設参照を全件検証してから状態を置換する。失敗時は現在状態を一切変更しない。
