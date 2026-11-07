---
md_class: status
id: doc-src-simulation
type: reference
updated: 2026-08-11
---

# src/simulation — シミュレーションモジュール

DOM・Canvas・UIフレームワークへ依存しない純粋なゲームロジック層。

留置配置の現在仕様は[編成の留置配置](../features/stabling-placement.md)を参照する。
入力はユーザー操作・AI操作を問わず `MapCommand` として受け取り、不変な状態オブジェクトを返す。

---

## model.ts — 状態と座標変換

### 型

```ts
interface Point { x: number; y: number }

type TrackGeometry = "straight" | "curve"

interface Track {
  id: string;
  geometry: TrackGeometry;
  points: Point[];        // 完成済みの個別線路線形
  resolvedPath: true;
  specification: {
    gaugeId: string;
    railProfileId: string;
    supportSystemId: string;
    roadbedId: string;
  };
}

interface TrackGroup {
  id: string;
  name: string;
  trackIds: string[];
}

interface TrackJunction {
  id: string;
  position: Point;
  ports: {
    trackId: string;
    location: "start" | "end" | "interior";
    distanceM: number;
  }[];
}

interface MapState {
  version: 8;
  clock: {
    currentTimeMs: number;
    paused: boolean;
    speedMultiplier: 1 | 60 | 300 | 1800;
  };
  tracks: Track[];
  trackGroups: TrackGroup[];
  junctions: TrackJunction[];
  stations: Station[];
  routes: OperationRoute[];
  operatingTrains: OperatingTrain[];
  nextTrackId: number;
  nextTrackGroupId: number;
  nextJunctionId: number;
  nextStationId: number;
  nextRouteId: number;
  nextOperatingTrainId: number;
}

interface Camera {
  x: number;              // カメラ中心のワールドX
  y: number;              // カメラ中心のワールドY
  zoom: number;           // 1.0 = 1 px/m。範囲: 0.01〜2000
}

interface Viewport { width: number; height: number }
```

`Camera` はUI状態であり `MapState` には含まれない。保存対象はMapStateのみ。

### 関数

| 関数 | 処理 |
|---|---|
| `createInitialState()` | 空のMapStateを返す |
| `createInitialCamera()` | 原点中心・等倍のCameraを返す |
| `worldToScreen(point, camera, viewport)` | ワールド座標 → 画面座標変換 |
| `screenToWorld(point, camera, viewport)` | 画面座標 → ワールド座標変換 |
| `zoomAt(camera, screenPoint, nextZoom, viewport)` | スクリーン上の一点を固定してズーム。新しいCameraを返す |
| `distanceToSegment(point, start, end)` | 点から線分への最短距離（線路選択判定に使用） |

座標変換の定義：
```
screen = (world - camera) × zoom + viewportCenter
world  = (screen - viewportCenter) ÷ zoom + camera
```

---

## commands.ts — 操作命令

```ts
type MapCommand =
  | { type: "track.create"; geometry: TrackGeometry; points: Point[]; trackCount?: number; startConnectionTrackId?: string; endConnectionTrackId?: string; specification?: TrackSpecification }
  | { type: "track.delete"; trackId: string }
  | { type: "trackGroup.create"; trackIds: string[]; name?: string }
  | { type: "trackGroup.addTrack"; groupId: string; trackId: string }
  | { type: "trackGroup.removeTrack"; groupId: string; trackId: string }
  | { type: "trackGroup.dissolve"; groupId: string }
  | { type: "station.createRange"; name: string; trackId: string; startPosition: Point; endPosition: Point; includeTrackGroup?: boolean }
  | { type: "station.rename"; stationId: string; name: string }
  | { type: "station.extend"; stationId: string; trackId: string; position: Point }
  | { type: "station.merge"; stationIds: string[] }
  | { type: "station.delete"; stationId: string }
  | { type: "route.create"; name: string; stationIds: string[] }
  | { type: "train.dispatch"; routeId: string; formationId: string; name: string; speedKph?: number; dwellSeconds?: number }
  | { type: "simulation.tick"; elapsedSeconds: number }
  | { type: "simulation.setPaused"; paused: boolean }
  | { type: "simulation.setSpeed"; speedMultiplier: 1 | 60 | 300 | 1800 }
  | { type: "map.clear" }

interface CommandResult {
  state: MapState;
  message: string;
}
```

`executeCommand(state, command): CommandResult`

- 入力のstateを変更せず、`structuredClone` で複製してから変更した新stateを返す
- points が2点未満の場合は例外
- 軌道構成IDが存在しない場合、またはレールと支持方式が非互換の場合は例外
- specification省略時は`standards.yaml`の先頭プリセットを使用
- 存在しないtrackIdの削除は例外
- 個別線路を正本とし、二本以上の同時敷設では線路群を作る
- 接続時は位置と参加線路を`TrackJunction`へ保存する
- 始点・終点の束接続は個別線路ごとに幾何的に整列する
- 運行経路は駅間の接続グラフを探索し、列車は時間経過命令で経路上を進む
- 時間経過命令は保存対象のゲーム内時計と運行列車を同時に進める

---

## specs.ts — 規格と互換性チェック（Phase 1 準備）

Phase 1で線路と車両の規格を導入するための型。現在は定義のみで使用箇所はない。

```ts
type TrackGaugeMm = number          // 軌間（mm）

type ElectrificationSpec =
  | { type: "none" }
  | { type: "dc"; voltageV: number }
  | { type: "ac"; voltageV: number; frequencyHz: 50 | 60 }

type TractionSpec =                 // 車両動力源。"none"は含まない
  | { type: "dc"; voltageV: number }
  | { type: "ac"; voltageV: number; frequencyHz: 50 | 60 }
  | { type: "diesel" }
  | { type: "steam" }

type SafetySystemId = string        // 将来のdata/train-protection/ IDと対応

interface LineSpec {
  gauge: TrackGaugeMm
  electrification: ElectrificationSpec
  maxAxleLoadT: number
  maxSpeedKmh: number
  safetySystem: SafetySystemId | null
}

interface VehicleSpec {
  gauge: TrackGaugeMm
  traction: TractionSpec
  axleLoadT: number
  maxSpeedKmh: number
  requiredSafetySystem: SafetySystemId | null
}
```

`checkCompatibility(line, vehicle): CompatibilityResult`

4条件（軌間・電化方式・軸重・保安装置）を検証し、すべての違反理由を返す。

---

## 依存関係

```
data/track YAML → data/trackCatalog.ts
model.ts   ← commands.ts, specs.ts, ui/renderer.ts
trackCatalog.ts ← commands.ts, ui/main.ts
commands.ts ← ui/main.ts
specs.ts   ← (Phase 1以降)
```

simulation/ 内のモジュールは `src/ui/` を import しない。
