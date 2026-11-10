import { describe, expect, it } from "vitest";
import { executeCommand } from "../src/simulation/commands";
import { createInitialState } from "../src/simulation/model";
import { serializeMapState, parseMapState } from "../src/simulation/persistence";
const create = () => executeCommand(createInitialState(), { type: "station.createUnresolved", name: "寄居", position: { x: 120, y: 8 }, reason: "共用駅の所属未確定" }).state;
describe("ホーム未確定の駅", () => {
  it("線路がなくても名前・位置・未確定理由を保存往復できる", () => {
    const state = create(); expect(parseMapState(serializeMapState(state))).toEqual(state);
    expect(state.stations[0]).toMatchObject({ name: "寄居", stopPoints: [], unresolvedReason: "共用駅の所属未確定" });
  });
  it("理由のない空駅と不正な位置は拒否する", () => {
    const state = create();
    expect(() => executeCommand(state, { type: "station.setKind", stationId: state.stations[0].id, kind: "depot" })).toThrow("ホーム未確定");
    delete state.stations[0].unresolvedReason;
    expect(() => serializeMapState(state)).toThrow("未確定理由");
    expect(() => executeCommand(state, { type: "station.createUnresolved", name: "駅", position: { x: NaN, y: 0 }, reason: "未確認" })).toThrow();
  });
  it("無関係の線路を撤去しても未確定駅を削除しない", () => {
    let state = create(); state = executeCommand(state, { type: "track.create", geometry: "straight", points: [{ x: 0, y: 0 }, { x: 500, y: 0 }] }).state;
    state = executeCommand(state, { type: "track.delete", trackId: "track-1" }).state;
    expect(state.stations).toHaveLength(1); expect(state.stations[0].position).toEqual({ x: 120, y: 8 });
  });
  it("未確定駅には車両を配置できない", () => {
    let state = create(); state = executeCommand(state, { type: "track.create", geometry: "straight", points: [{ x: 0, y: 0 }, { x: 500, y: 0 }] }).state;
    state = executeCommand(state, { type: "fleet.formation-template.acquire", templateId: "test-passenger-3car" }).state;
    expect(() => executeCommand(state, { type: "fleet.formation.place", formationId: state.fleet.formations[0].id, stationId: state.stations[0].id, trackId: "track-1", distanceM: 250 })).toThrow("停車地点を持ちません");
  });
  it("未確定駅どうしの統合で座標を壊さず、確定範囲の統合で未確定を解消する", () => {
    let state = create(); state = executeCommand(state, { type: "station.createUnresolved", name: "寄居別点", position: { x: 125, y: 8 }, reason: "未確定" }).state;
    state = executeCommand(state, { type: "station.merge", stationIds: state.stations.map((s) => s.id) }).state;
    expect(parseMapState(serializeMapState(state))).toEqual(state);
    state = executeCommand(state, { type: "track.create", geometry: "straight", points: [{ x: 0, y: 0 }, { x: 500, y: 0 }] }).state;
    state = executeCommand(state, { type: "station.createRange", name: "確定ホーム", trackId: "track-1", startPosition: { x: 100, y: 0 }, endPosition: { x: 250, y: 0 } }).state;
    state = executeCommand(state, { type: "station.merge", stationIds: state.stations.map((s) => s.id) }).state;
    expect(state.stations[0].unresolvedReason).toBeUndefined(); expect(state.stations[0].stopPoints).toHaveLength(1);
  });
  it("旧v13の駅を保持して現行形式へ読み込む", () => {
    const raw = { ...createInitialState(), version: 13 };
    expect(parseMapState(JSON.stringify(raw)).version).toBe(15);
  });
});
