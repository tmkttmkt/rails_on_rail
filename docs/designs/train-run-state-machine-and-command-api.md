---
md_class: history
id: design-train-run-state-machine-and-command-api
type: design
status: proposed
created: 2026-08-16
epic: epic-phase-minus-one
task: task-structure-lines-service-systems-and-operations
relations: [design-line-service-domain-model, design-ai-command-and-preflight-inspection]
---

# Design: 運行・運用の状態遷移と共通コマンド

## 責務

- `Route`: 停車駅・経路・方向を定義する。
- `Operation`: 日時と参照経路を定義する。
- `VehicleDuty`: 運行順序と任意の通常編成を定義する。
- `VehicleDutyExecution`: 特定日の編成差し替え・運休を保持する。
- `OperationExecution`: 特定日の走行状態を保持する内部実行インスタンス。

## 実行状態

```text
planned -> reserved -> operating -> completed
   |          |           |
   +----------+-----------+-> cancelled / failed
```

`planned` は運行から実施日分が生成された状態、`reserved` は運用と編成が確定した状態である。運行・運用の定義自体には実行状態を持たせない。

## 共通コマンド

```ts
line.create | line.update | line.delete
serviceSystem.create | serviceSystem.update | serviceSystem.delete
route.create | route.update | route.delete
operation.create | operation.update | operation.delete
vehicleDuty.create | vehicleDuty.update | vehicleDuty.delete
vehicleDuty.assignFormation | vehicleDuty.unassignFormation
vehicleDutyExecution.create | vehicleDutyExecution.replaceFormation
execution.reserve | execution.cancel | execution.dispatch
```

主なペイロードは次の通り。

```ts
type ServiceSystemCreate = {
  lineId: string; name: string; shortName?: string; color?: string;
  description?: string; displayOrder: number;
};

type RouteCreate = {
  name: string; directionName: string; stops: RouteStop[];
  legs: RouteLeg[]; lineSections: RouteLineSection[];
};

type OperationCreate = {
  name: string; operationNumber?: string; routeId: string;
  calendar: ServiceCalendar; stopTimes: OperationStopTime[];
};

type VehicleDutyCreate = {
  name: string; assignments: VehicleDutyAssignment[]; defaultFormationId?: string;
};
```

## 発車検証順序

1. 運用、運行、経路、編成が存在する。
2. 編成が未占有かつ駅へ配置済みである。
3. 配置駅・線路・向きが経路の始発条件と一致する。
4. 実施日時が運行カレンダーと時刻に一致する。
5. 同じ運用の前後運行が複数日を含めて時刻順であり、終着駅・番線と次の始発駅・番線が一致する。
6. 経路が参照する線路・ジャンクションが現存し、接線接続されている。

## 主なエラー

| コード | 意味 |
|---|---|
| `ERR_ROUTE_NOT_FOUND` | 経路が存在しない |
| `ERR_OPERATION_NOT_FOUND` | 運行が存在しない |
| `ERR_VEHICLE_DUTY_NOT_FOUND` | 運用が存在しない |
| `ERR_SYSTEM_LINE_MISMATCH` | 経路区間の系統と路線が不一致 |
| `ERR_INVALID_STOP_TIME_ORDER` | 着発時刻または日跨ぎ順が不正 |
| `ERR_DUTY_OPERATION_OVERLAP` | 運用内の運行時刻が重複 |
| `ERR_DUTY_LOCATION_DISCONTINUITY` | 前後運行の終始発地点が不一致 |
| `ERR_FORMATION_ALREADY_ASSIGNED` | 編成が別運用と競合 |
| `ERR_PLACEMENT_MISMATCH` | 配置駅・線路・向きが始発条件と不一致 |
| `ERR_ROUTE_INFRASTRUCTURE_BROKEN` | 経路の施設参照または接続が無効 |

## セレクター

- `getServiceSystemsByLine(lineId)`
- `getRoutesByLine(lineId)` / `getRoutesByServiceSystem(serviceSystemId)`
- `getOperationsByRoute(routeId)` / `getOperationsForDate(date)`
- `getDutiesByFormation(formationId)`
- `getEligibleDutiesForPlacement(placementId, dateTime)`
