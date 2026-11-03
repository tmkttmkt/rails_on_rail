---
md_class: history
id: design-line-service-domain-model
type: design
status: proposed
created: 2026-08-16
epic: epic-phase-minus-one
task: task-structure-lines-service-systems-and-operations
relations:
  - design-line-service-route-and-train-run-model
  - design-train-run-state-machine-and-command-api
---

# Design: 路線・系統・経路・運行・運用のドメインモデル

## 型

```ts
interface Line {
  id: string;
  name: string;
  code?: string;
  color: string;
  displayOrder: number;
}

interface ServiceSystem {
  id: string;
  lineId: string;
  name: string;
  shortName?: string;
  color?: string;
  description?: string;
  displayOrder: number;
}

interface RouteStop {
  id: string;
  sequence: number;
  stationId: string;
  trackId: string;
  distanceM?: number;
  commercialType: "stop" | "pass";
}

interface RouteLineSection {
  id: string;
  fromStopId: string;
  toStopId: string;
  lineId: string;
  serviceSystemId?: string;
}

interface Route {
  id: string;
  name: string;
  directionName: string;
  stops: RouteStop[];
  legs: RouteLeg[];
  totalDistanceM: number;
  lengthM: number;
  status: "active" | "draft" | "archived";
}

interface OperationLineAssignment {
  lineId: string;
  serviceSystemId?: string;
}

interface ServiceCalendar {
  startDate?: string;
  endDate?: string;
  weekdays: number[];
  includedDates?: string[];
  excludedDates?: string[];
}

interface OperationStopTime {
  routeStopId: string;
  arrivalTime?: string;
  departureTime?: string;
  dayOffset: number; // 0以上。上限を1日に限定せず複数日越しを許可
}

interface Operation {
  id: string;
  name: string;
  operationNumber?: string;
  routeId?: string; // 未設定時は計画下書き。運用割当・発車不可
  calendar: ServiceCalendar;
  stopTimes: OperationStopTime[];
  lineAssignments?: OperationLineAssignment[]; // 路線・系統への所属設定（任意）
  description?: string;
}

interface VehicleDutyAssignment {
  operationId: string;
  sequence: number;
  serviceDayOffset: number; // 運用開始日から何日後の運行か
}

interface VehicleDuty {
  id: string;
  name: string;
  assignments: VehicleDutyAssignment[];
  defaultFormationId?: string; // 未指定でも計画保存可
}

interface VehicleDutyExecution {
  id: string;
  vehicleDutyId: string;
  serviceDate: string;
  formationId?: string; // 当日差し替え。未指定時はdefaultFormationId
  cancelledOperationIds?: string[];
}
```

`RouteLeg` は既存の物理経路表現を利用し、接線方向付きの線路走行列とジャンクション参照を持つ。

## 所有権

| 所有者 | 所有する情報 | 所有しない情報 |
|---|---|---|
| 路線/系統 | 分類・集約メタデータ、親路線従属関係 | 運行所属（Operation側で保持）、停車駅、方向、経路、時刻、編成 |
| 経路 | 地点、方向、物理走行経路 | 路線・系統所属、日時、編成 |
| 運行 | 経路参照、路線・系統所属設定、日付条件、着発時刻 | 物理走行経路の内部構造、編成 |
| 運用 | 運行順序、編成割り当て | 停車駅、経路、時刻の複製 |

## 検証規則

1. `RouteStop.sequence` と `VehicleDutyAssignment.sequence` は重複せず連続する。
2. `Operation.lineAssignments` の `lineId` は `state.lines` に実在し、親路線あたり最大1つの系統設定（`serviceSystem.lineId === lineId`）を持つ。未所属（空配列/未指定）も許可される。
3. `OperationStopTime.routeStopId` は参照経路に存在し、停車地点には必要な着発時刻を設定する。
4. 時刻比較は `dayOffset + HH:mm:ss` の絶対順序で行う。`dayOffset` は0以上の整数で、複数日をまたげる。後続地点が前地点より前にならない。
5. 運用内の運行は `serviceDayOffset` を含む時刻順に並べる。当面、前運行の終着と次運行の始発は同一駅・同一番線であることを必須とし、異番線移動や回送補完は扱わない。
6. 編成割り当てが未指定の運用も計画として保存できるが、発車予約には編成が必要。当日の `VehicleDutyExecution.formationId` で通常編成を上書きできる。

## 導出値

- 系統の表示色: `serviceSystem.color ?? parentLine.color`
- 運行が所属する路線・系統: `operation.lineAssignments` から導出
- 運行の始発条件: 参照経路の先頭地点・先頭legから導出
- 運行の実施日時: カレンダー、複数日対応の `dayOffset`、運用内の `serviceDayOffset` から生成
- 運用実施編成: `execution.formationId ?? duty.defaultFormationId`

## 将来拡張

祝日カレンダー、折返し・入出庫・分割併合は別Taskで追加する。日別の編成差し替えと運休は `VehicleDutyExecution` で定義本体を書き換えずに扱う。
