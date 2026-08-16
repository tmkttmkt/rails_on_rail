---
md_class: history
id: design-fleet-state-integration
type: design
created: 2026-08-13
status: accepted
epic: epic-phase-minus-one
task: task-integrate-purchasable-fleet-and-scheduled-dispatch
relations:
  - design-vehicle-data-model
  - design-route-and-train-movement
  - design-map-save-format
---

# Design: Fleet所有実体をゲーム状態と運行へ統合する

## 背景

`src/simulation/fleet.ts`は運行会社形式、車両個体、編成、列車を独立した`FleetState`に保持する。一方、`MapState`は駅、線路、運行経路、`OperatingTrain`を保持する。現在は両者が分離しており、運行列車の`formationId`は文字列にすぎない。

この分離のままUIだけを足すと、所有車両と運行列車に二つの正本が生じ、同じ編成の重複発車、存在しない編成の運行、セーブ漏れが起きる。本Designは所有実体と走行実体の責務を分けたうえで、一つの`MapState`へ統合する。

## 決定

### 所有状態を`MapState.fleet`へ格納する

```ts
interface MapState {
  // existing map and operation fields
  fleet: FleetState;
  vehiclePlacements: VehiclePlacement[];
  dispatchReservations: DispatchReservation[];
  nextOperatorClassId: number;
  nextVehicleUnitId: number;
  nextFormationId: number;
  nextDispatchReservationId: number;
}
```

`FleetState`を平坦に展開せず、車両所有領域として名前空間を保つ。既存`executeFleetCommand`は純粋関数として維持し、ルートのゲーム命令から呼び出す。将来Fleetを別ストアへ分離しても境界が明確になる。

### `Train`と`OperatingTrain`の重複を解消する

現行Fleetの`Train`は複数編成の行先付き集合だが、今回の運行では一編成を一つの`OperatingTrain`として扱う。運行上の分割・併合を対象外としたため、今回Fleet側`Train`は新規UIの正本にしない。

- `Formation`: 所有され、編集・配置・予約される実体
- `OperatingTrain`: 発車後に線路上を走行する一時的実体
- `DispatchReservation`: 配置編成を将来`OperatingTrain`へ変換する一回限りの命令状態

既存Fleet `Train`型と命令は互換テストのため当面残してよいが、ルート状態へ統合せずdeprecatedとして後続整理対象にする。今回、新しい三つ目の列車正本を作らない。

### 編成所属状態は導出する

`Formation.status`のような複製フィールドは持たず、次の参照から導出する。

1. `OperatingTrain`が`formationId`を参照 → `operating`
2. `DispatchReservation`が有効状態で参照 → `reserved`
3. `VehiclePlacement`が参照 → `placed`
4. いずれもなし → `unplaced`

複数に同時所属していた場合は不正状態として保存検証で拒否する。表示用の状態はselector関数で返す。

```ts
type FormationOperationalStatus = "unplaced" | "placed" | "reserved" | "operating";
```

### ゲーム命令をルートへ追加する

Fleetの低水準命令を直接UIへ露出するだけでなく、原子的な取得や配置用のゲーム命令を追加する。

```ts
type MapCommand =
  | { type: "fleet.vehicle.acquire"; designId: string; operatorNumber?: string }
  | { type: "fleet.formation-template.acquire"; templateId: string; name?: string }
  | { type: "fleet.formation.create"; name: string }
  | { type: "fleet.formation.rename"; formationId: string; name: string }
  | { type: "fleet.formation.delete"; formationId: string }
  | { type: "fleet.formation.vehicle.add"; formationId: string; vehicleId: string; orientation: Orientation; placement: Placement }
  | { type: "fleet.formation.vehicle.remove"; formationId: string; vehicleId: string }
  | { type: "fleet.formation.vehicle.move"; formationId: string; vehicleId: string; targetIndex: number }
  | { type: "fleet.formation.vehicle.reverse"; formationId: string; vehicleId: string }
  | { type: "fleet.formation.place"; formationId: string; stationId: string; trackId: string; distanceM: number }
  | { type: "fleet.formation.unplace"; formationId: string }
  | { type: "fleet.dispatch.reserve"; formationId: string; routeId: string; departureTimeMs: number; dwellSeconds: number }
  | { type: "fleet.dispatch.cancel"; reservationId: string };
```

UI、AI、テストはこの命令を共有する。UI専用の状態書換えを作らない。

## 不変条件

- すべての車両個体は存在する運行会社形式を参照する。
- すべての運行会社形式は存在するカタログ設計を参照する。
- 一車両は最大一編成にのみ所属する。
- 一編成は同時に最大一配置、一有効予約、一運行列車にのみ所属する。
- 配置、予約、運行中の編成は空でない。
- `OperatingTrain.formationId`は存在する編成を参照する。
- 発車予約は存在する配置、経路、編成を参照する。
- 完了または取消済み予約は再実行されない。
- 採番値は既存IDの最大番号より大きい。

## 保存形式

### version更新

現行`MapState.version = 8`を次versionへ上げる。移行関数はversion 8へ次を補う。

```ts
fleet: createInitialFleetState()
vehiclePlacements: []
dispatchReservations: []
nextOperatorClassId: 1
nextVehicleUnitId: 1
nextFormationId: 1
nextDispatchReservationId: 1
```

既存`OperatingTrain`には任意文字列の`formationId`があり、実在車両へ安全に対応付けられない。旧セーブ移行時は`operatingTrains`を空にし、仮車両・仮編成を生成しない。線路、駅、経路、時計など他の状態は維持する。画面から旧セーブを読み込む場合は「旧形式の運行列車を削除しました」と通知できるよう、移行警告を返す仕組みを検討する。

### 検証順序

1. 外枠、version、配列構造
2. カタログ参照と固有ID
3. 車両→形式→設計
4. 編成→車両と重複所属
5. 配置→編成・駅・線路・距離
6. 予約→配置・経路・時刻
7. 運行列車→編成・経路
8. 編成状態の排他性

後段の参照検証を前段より先に実行して、不明瞭な例外を出さない。

## 削除操作との整合

- 配置または予約がある編成の削除を拒否する。
- 運行中編成の削除を拒否する。
- 車両を含む編成の削除は拒否し、先に車両を外す。
- 配置を含む駅・線路の削除は拒否し、対象編成IDをエラーへ含める。
- 予約で参照中の経路削除は拒否または予約取消を要求する。
- マップ全消去はFleetも含めて全状態を初期化するが、ゲーム内時計を残す既存仕様との整合を明示する。

## 代替案

### Fleetを`MapState`と別に保存する

却下。保存、undo、AI操作、運行tickで二つの状態を同期する必要があり、現在規模では利点がない。

### Formationへ状態enumを直接保存する

却下。配置や列車との二重記録になり、不一致を生む。状態は所有関係から導出する。

### 既存Fleet `Train`をそのまま運行へ使う

今回は分割・併合を扱わず、一編成一運行実体で十分である。Fleet `Train`の複数編成・行先モデルを同時に統合すると責務が過剰になる。

## 検証

- 状態不変条件を壊す各JSONを読込拒否する。
- 全Fleet命令が入力状態を破壊せず新状態を返す。
- version 8の車両なし状態を移行し、旧運行列車だけが削除されることを確認する。
- 取得から運行終了まで、編成状態が常に一つだけ導出される。

## 将来拡張

- 経済導入時は取得命令の前段へ見積・支払・納期を追加する。
- 複数編成列車を導入する際は`OperatingTrain`がformationId配列またはFleet Trainを参照する移行Designを別途作る。
- 車庫導入時は`VehiclePlacement`の場所種別を駅停車線以外へ拡張する。
