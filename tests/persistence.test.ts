import { describe, expect, it } from "vitest";
import { executeCommand } from "../src/simulation/commands";
import { createInitialState } from "../src/simulation/model";
import { createSaveFile, parseMapState, parseSaveFile, serializeMapState, serializeSaveFile, validateSaveName } from "../src/simulation/persistence";

describe("マップの保存と読込", () => {
  it("線路状態をJSONで往復する", () => {
    const state = executeCommand(createInitialState(), {
      type: "track.create",
      geometry: "curve",
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 180, y: 80 }],
      trackCount: 2,
      designSpeedKmh: 70,
    }).state;
    expect(parseMapState(serializeMapState(state))).toEqual(state);
  });

  it("JSONでない入力を拒否する", () => {
    expect(() => parseMapState("not json")).toThrow("正しいJSONではありません");
  });

  it("未知の保存形式を拒否する", () => {
    expect(() => parseMapState(JSON.stringify({ version: 99, tracks: [], nextTrackId: 1 }))).toThrow("対応していないセーブ形式");
  });

  it("有限でない座標を拒否する", () => {
    const state = executeCommand(createInitialState(), {
      type: "track.create",
      geometry: "straight",
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    }).state;
    const value = JSON.parse(serializeMapState(state));
    value.tracks[0].points[1].x = "Infinity";
    expect(() => parseMapState(JSON.stringify(value))).toThrow("座標が正しくありません");
  });

  it("存在しない線路を含む束を拒否する", () => {
    const state = executeCommand(createInitialState(), {
      type: "track.create",
      geometry: "straight",
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    }).state;
    const value = JSON.parse(serializeMapState(state));
    value.trackGroups = [{ id: "track-group-1", name: "不正な束", trackIds: ["track-1", "track-999"] }];
    expect(() => parseMapState(JSON.stringify(value))).toThrow("線路群の線路が存在しません");
  });

  it("名前と日時を含むセーブファイルを往復する", () => {
    const state = createInitialState();
    const save = createSaveFile("北部幹線 1905年", state, "2026-08-09T01:00:00.000Z", "2026-08-09T02:00:00.000Z");
    expect(parseSaveFile(serializeSaveFile(save))).toEqual(save);
  });

  it("旧形式のMapStateを名前付きセーブへ変換する", () => {
    const save = parseSaveFile(serializeMapState(createInitialState()), "旧セーブ");
    expect(save.metadata.name).toBe("旧セーブ");
    expect(save.state).toEqual(createInitialState());
  });

  it("version 1の線路群を独立線路と束へ移行する", () => {
    const legacy = {
      version: 1,
      nextTrackId: 2,
      tracks: [{
        id: "track-1",
        geometry: "straight",
        points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        trackCount: 2,
        trackSpacing: 12,
        specification: {
          gaugeId: "gauge-1067mm",
          railProfileId: "jis-50n",
          supportSystemId: "pc-sleeper-ballast",
          roadbedId: "reinforced-roadbed",
        },
        lanes: [{ id: "track-1-lane-1", index: 0 }, { id: "track-1-lane-2", index: 1 }],
        engineering: { designSpeedKmh: 80, builtMinimumRadiusM: null, cantProfile: [] },
      }],
    };
    const migrated = parseMapState(JSON.stringify(legacy));
    expect(migrated.version).toBe(15);
    expect(migrated.tracks).toHaveLength(2);
    expect(migrated.trackGroups[0].trackIds).toEqual(["track-1", "track-2"]);
  });

  it("version 2の接続を接続点へ移行する", () => {
    let state = executeCommand(createInitialState(), { type: "track.create", geometry: "straight", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }).state;
    state = executeCommand(state, { type: "track.create", geometry: "curve", startConnectionTrackId: "track-1", points: [{ x: 50, y: 0 }, { x: 100, y: 50 }] }).state;
    const legacy = structuredClone(state) as any;
    legacy.version = 2;
    delete legacy.junctions;
    delete legacy.nextJunctionId;
    delete legacy.tracks[1].startConnection.junctionId;
    const migrated = parseMapState(JSON.stringify(legacy));
    expect(migrated.version).toBe(15);
    expect(migrated.junctions[0].ports.map((port) => port.location)).toEqual(["start", "interior"]);
  });

  it("version 3を駅なしのversion 11へ移行する", () => {
    const legacy = structuredClone(createInitialState()) as any;
    legacy.version = 3;
    delete legacy.stations;
    delete legacy.nextStationId;
    const migrated = parseMapState(JSON.stringify(legacy));
    expect(migrated.version).toBe(15);
    expect(migrated.stations).toEqual([]);
    expect(migrated.nextStationId).toBe(1);
  });

  it("version 4の駅へ既定範囲を補ってversion 11へ移行する", () => {
    let state = executeCommand(createInitialState(), { type: "track.create", geometry: "straight", points: [{ x: 0, y: 0 }, { x: 200, y: 0 }] }).state;
    state = executeCommand(state, { type: "station.createRange", name: "旧駅", trackId: "track-1", startPosition: { x: 20, y: 0 }, endPosition: { x: 80, y: 0 } }).state;
    const legacy = structuredClone(state) as any;
    legacy.version = 4;
    legacy.stations[0].stopPoints[0] = { trackId: "track-1", distanceM: 50, position: { x: 50, y: 0 }, direction: "both" };
    const migrated = parseMapState(JSON.stringify(legacy));
    expect(migrated.version).toBe(15);
    expect(migrated.stations[0].stopPoints[0]).toMatchObject({ startDistanceM: 0, endDistanceM: 110 });
  });

  it("version 5の中心・駅長を開始・終了範囲へ移行する", () => {
    let state = executeCommand(createInitialState(), { type: "track.create", geometry: "straight", points: [{ x: 0, y: 0 }, { x: 200, y: 0 }] }).state;
    state = executeCommand(state, { type: "station.createRange", name: "旧駅", trackId: "track-1", startPosition: { x: 60, y: 0 }, endPosition: { x: 140, y: 0 } }).state;
    const legacy = structuredClone(state) as any;
    legacy.version = 5;
    legacy.stations[0].stopPoints[0] = { trackId: "track-1", distanceM: 100, lengthM: 80, position: { x: 100, y: 0 }, direction: "both" };
    const migrated = parseMapState(JSON.stringify(legacy));
    expect(migrated.version).toBe(15);
    expect(migrated.stations[0].stopPoints[0]).toMatchObject({ startDistanceM: 60, endDistanceM: 140 });
  });

  it("version 6へ空の運行状態を補ってversion 11へ移行する", () => {
    const legacy = structuredClone(createInitialState()) as any;
    legacy.version = 6;
    delete legacy.routes;
    delete legacy.operatingTrains;
    delete legacy.nextRouteId;
    delete legacy.nextOperatingTrainId;
    const migrated = parseMapState(JSON.stringify(legacy));
    expect(migrated.version).toBe(15);
    expect(migrated.routes).toEqual({});
    expect(migrated.operatingTrains).toEqual([]);
  });

  it("version 7へ初期時計を補ってversion 11へ移行する", () => {
    const legacy = structuredClone(createInitialState()) as any;
    legacy.version = 7;
    delete legacy.clock;
    const migrated = parseMapState(JSON.stringify(legacy));
    expect(migrated.version).toBe(15);
    expect(migrated.clock).toEqual({ currentTimeMs: Date.UTC(1900, 0, 1, 6), paused: true, speedMultiplier: 1 });
  });

  it("version 8の旧セーブからversion 11へ移行し旧運行列車を削除する", () => {
    let state = executeCommand(createInitialState(), { type: "track.create", geometry: "straight", points: [{ x: 0, y: 0 }, { x: 200, y: 0 }] }).state;
    state = executeCommand(state, { type: "station.createRange", name: "A", trackId: "track-1", startPosition: { x: 10, y: 0 }, endPosition: { x: 30, y: 0 } }).state;
    state = executeCommand(state, { type: "station.createRange", name: "B", trackId: "track-1", startPosition: { x: 170, y: 0 }, endPosition: { x: 190, y: 0 } }).state;
    state = executeCommand(state, { type: "route.create", name: "試験線", stationIds: ["station-1", "station-2"] }).state;
    state = executeCommand(state, { type: "fleet.formation-template.acquire", templateId: "test-single-locomotive", name: "旧列車" }).state;
    const fId = state.fleet.formations.at(-1)!.id;
    state = executeCommand(state, { type: "fleet.formation.place", formationId: fId, stationId: "station-1", trackId: "track-1", distanceM: 20 }).state;
    state = executeCommand(state, { type: "train.dispatch", routeId: "route-1", formationId: fId, name: "旧列車" }).state;
    const legacy = structuredClone(state) as any;
    legacy.version = 8;
    expect(legacy.operatingTrains).toHaveLength(1);

    const migrated = parseMapState(JSON.stringify(legacy));
    expect(migrated.version).toBe(15);
    expect(migrated.operatingTrains).toEqual([]);
    expect(migrated.fleet).toEqual({ operatorClasses: [], vehicleUnits: [], formations: [], trains: [] });
    expect(migrated.vehiclePlacements).toEqual([]);
    expect((migrated as any).dispatchReservations).toBeUndefined();
    expect(Object.keys(migrated.routes)).toHaveLength(1);
    expect(migrated.stations).toHaveLength(2);
  });

  it("不正なゲーム内時計を拒否する", () => {
    const value = structuredClone(createInitialState()) as any;
    value.clock.speedMultiplier = 42;
    expect(() => parseMapState(JSON.stringify(value))).toThrow("ゲーム内時計が正しくありません");
  });

  it("駅と停車地点を保存して復元する", () => {
    let state = executeCommand(createInitialState(), { type: "track.create", geometry: "straight", points: [{ x: 0, y: 0 }, { x: 200, y: 0 }] }).state;
    state = executeCommand(state, { type: "station.createRange", name: "中央", trackId: "track-1", startPosition: { x: 40, y: 4 }, endPosition: { x: 110, y: -2 } }).state;
    expect(parseMapState(serializeMapState(state))).toEqual(state);
  });

  it("運行経路と走行列車を保存して復元する", () => {
    let state = executeCommand(createInitialState(), { type: "track.create", geometry: "straight", points: [{ x: 0, y: 0 }, { x: 200, y: 0 }] }).state;
    state = executeCommand(state, { type: "station.createRange", name: "A", trackId: "track-1", startPosition: { x: 10, y: 0 }, endPosition: { x: 30, y: 0 } }).state;
    state = executeCommand(state, { type: "station.createRange", name: "B", trackId: "track-1", startPosition: { x: 170, y: 0 }, endPosition: { x: 190, y: 0 } }).state;
    state = executeCommand(state, { type: "route.create", name: "試験線", stationIds: ["station-1", "station-2"] }).state;
    state = executeCommand(state, { type: "fleet.formation-template.acquire", templateId: "test-single-locomotive", name: "編成1" }).state;
    const fId = state.fleet.formations.at(-1)!.id;
    state = executeCommand(state, { type: "fleet.formation.place", formationId: fId, stationId: "station-1", trackId: "track-1", distanceM: 20 }).state;
    state = executeCommand(state, { type: "train.dispatch", routeId: "route-1", formationId: fId, name: "試運転" }).state;
    const restored = parseMapState(serializeMapState(state));
    expect(Object.values(restored.routes)[0]).toMatchObject({ name: "試験線" });
    expect(restored.operatingTrains[0]).toMatchObject({ formationId: fId, routeId: "route-1" });
  });

  it("重複所属や参照切れなどの不正な車両関連セーブを拒否する", () => {
    let state = executeCommand(createInitialState(), { type: "track.create", geometry: "straight", points: [{ x: 0, y: 0 }, { x: 200, y: 0 }] }).state;
    state = executeCommand(state, { type: "station.createRange", name: "A", trackId: "track-1", startPosition: { x: 10, y: 0 }, endPosition: { x: 50, y: 0 } }).state;

    // 車両が複数編成に所属する重複を拒否
    const dupVehicleState = structuredClone(state) as any;
    dupVehicleState.fleet.operatorClasses = [{ id: "class-1", operatorId: "op-1", className: "客車", baseVehicleDesignId: "generic-light-two-axle-coach" }];
    dupVehicleState.fleet.vehicleUnits = [{ id: "unit-1", operatorClassId: "class-1", operatorNumber: "101" }];
    dupVehicleState.fleet.formations = [
      { id: "fmt-1", name: "F1", vehicles: [{ vehicleId: "unit-1", orientation: "forward" }], warnings: [] },
      { id: "fmt-2", name: "F2", vehicles: [{ vehicleId: "unit-1", orientation: "forward" }], warnings: [] },
    ];
    dupVehicleState.nextOperatorClassId = 2;
    dupVehicleState.nextVehicleUnitId = 2;
    dupVehicleState.nextFormationId = 3;
    expect(() => parseMapState(JSON.stringify(dupVehicleState))).toThrow("重複所属");

    // 同一線路上での配置重複を拒否
    const dupPlacementState = structuredClone(state) as any;
    dupPlacementState.fleet.operatorClasses = [
      { id: "class-1", operatorId: "op-default", className: "C1", baseVehicleDesignId: "generic-light-two-axle-coach" },
    ];
    dupPlacementState.fleet.vehicleUnits = [
      { id: "v-1", operatorClassId: "class-1", operatorNumber: "1" },
      { id: "v-2", operatorClassId: "class-1", operatorNumber: "2" },
    ];
    dupPlacementState.fleet.formations = [
      { id: "fmt-1", name: "F1", vehicles: [{ vehicleId: "v-1", orientation: "forward" }], warnings: [] },
      { id: "fmt-2", name: "F2", vehicles: [{ vehicleId: "v-2", orientation: "forward" }], warnings: [] },
    ];
    dupPlacementState.nextOperatorClassId = 2;
    dupPlacementState.nextVehicleUnitId = 3;
    dupPlacementState.nextFormationId = 3;
    dupPlacementState.vehiclePlacements = [
      { id: "place-1", formationId: "fmt-1", stationId: "station-1", trackId: "track-1", centerDistanceM: 30, occupiedStartDistanceM: 20, occupiedEndDistanceM: 40, orientation: "forward" },
      { id: "place-2", formationId: "fmt-2", stationId: "station-1", trackId: "track-1", centerDistanceM: 35, occupiedStartDistanceM: 25, occupiedEndDistanceM: 45, orientation: "forward" },
    ];
    expect(() => parseMapState(JSON.stringify(dupPlacementState))).toThrow("配置位置が重複");
  });

  it("既存ID以下の次回IDを拒否する", () => {
    const state = executeCommand(createInitialState(), { type: "track.create", geometry: "straight", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }).state;
    const value = JSON.parse(serializeMapState(state));
    value.nextTrackId = 1;
    expect(() => parseMapState(JSON.stringify(value))).toThrow("既存IDと衝突");
  });

  it("空または長すぎるセーブ名を拒否する", () => {
    expect(() => validateSaveName("  ")).toThrow("1〜80文字");
    expect(() => validateSaveName("a".repeat(81))).toThrow("1〜80文字");
  });
});
