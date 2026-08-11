import { describe, expect, it } from "vitest";
import { executeCommand } from "../src/simulation/commands";
import { createInitialState } from "../src/simulation/model";
import { findStationRoute } from "../src/simulation/operations";

function createThreeStationLine() {
  let state = executeCommand(createInitialState(), { type: "track.create", geometry: "straight", points: [{ x: 0, y: 0 }, { x: 300, y: 0 }] }).state;
  state = executeCommand(state, { type: "station.createRange", name: "A", trackId: "track-1", startPosition: { x: 10, y: 0 }, endPosition: { x: 30, y: 0 } }).state;
  state = executeCommand(state, { type: "station.createRange", name: "B", trackId: "track-1", startPosition: { x: 140, y: 0 }, endPosition: { x: 160, y: 0 } }).state;
  state = executeCommand(state, { type: "station.createRange", name: "C", trackId: "track-1", startPosition: { x: 270, y: 0 }, endPosition: { x: 290, y: 0 } }).state;
  return state;
}

describe("駅間経路と列車運行", () => {
  it("接続点を介して異なる線路の駅へ到達する", () => {
    let state = executeCommand(createInitialState(), { type: "track.create", geometry: "straight", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }).state;
    state = executeCommand(state, { type: "track.create", geometry: "straight", startConnectionTrackId: "track-1", points: [{ x: 100, y: 0 }, { x: 220, y: 0 }] }).state;
    state = executeCommand(state, { type: "station.createRange", name: "A", trackId: "track-1", startPosition: { x: 10, y: 0 }, endPosition: { x: 30, y: 0 } }).state;
    state = executeCommand(state, { type: "station.createRange", name: "B", trackId: "track-2", startPosition: { x: 190, y: 0 }, endPosition: { x: 210, y: 0 } }).state;
    expect(findStationRoute(state, "station-1", "station-2").map((item) => item.trackId)).toEqual(["track-1", "track-2"]);
  });

  it("複数の停車駅を順に結ぶ運行経路を作成する", () => {
    const state = executeCommand(createThreeStationLine(), { type: "route.create", name: "A-C線", stationIds: ["station-1", "station-2", "station-3"] }).state;
    expect(state.routes[0].legs).toHaveLength(2);
    expect(state.routes[0].lengthM).toBeCloseTo(260);
  });

  it("列車が始発と途中駅で停車して終着する", () => {
    let state = executeCommand(createThreeStationLine(), { type: "route.create", name: "A-C線", stationIds: ["station-1", "station-2", "station-3"] }).state;
    state = executeCommand(state, { type: "train.dispatch", routeId: "route-1", formationId: "formation-1", name: "試運転", speedKph: 36, dwellSeconds: 2 }).state;
    expect(state.operatingTrains[0].state).toBe("dwelling");
    state = executeCommand(state, { type: "simulation.tick", elapsedSeconds: 15 }).state;
    expect(state.operatingTrains[0].state).toBe("dwelling");
    expect(state.operatingTrains[0].legIndex).toBe(1);
    state = executeCommand(state, { type: "simulation.tick", elapsedSeconds: 20 }).state;
    expect(state.operatingTrains[0].state).toBe("completed");
    expect(state.operatingTrains[0].position.x).toBeCloseTo(280);
  });

  it("逆向き経路の走行区間は終点距離が始点距離より小さい", () => {
    const routeState = executeCommand(createThreeStationLine(), { type: "route.create", name: "C-A線", stationIds: ["station-3", "station-1"] }).state;
    const traversal = routeState.routes[0].legs[0][0];
    expect(traversal.fromDistanceM).toBeGreaterThan(traversal.toDistanceM);
  });

  it("逆向き経路で列車が正しく始発から終着へ移動する", () => {
    let state = executeCommand(createThreeStationLine(), { type: "route.create", name: "C-A線", stationIds: ["station-3", "station-1"] }).state;
    state = executeCommand(state, { type: "train.dispatch", routeId: "route-1", formationId: "f1", name: "逆行試験", speedKph: 36, dwellSeconds: 2 }).state;
    expect(state.operatingTrains[0].state).toBe("dwelling");
    // 停車2秒 + 260m走行 (10m/s) = 28秒
    state = executeCommand(state, { type: "simulation.tick", elapsedSeconds: 30 }).state;
    expect(state.operatingTrains[0].state).toBe("completed");
    expect(state.operatingTrains[0].position.x).toBeCloseTo(20, 0);
  });

  it("接続されていない駅間を拒否する", () => {
    let state = createThreeStationLine();
    state = executeCommand(state, { type: "track.create", geometry: "straight", points: [{ x: 0, y: 100 }, { x: 100, y: 100 }] }).state;
    state = executeCommand(state, { type: "station.createRange", name: "孤立", trackId: "track-2", startPosition: { x: 20, y: 100 }, endPosition: { x: 40, y: 100 } }).state;
    expect(() => findStationRoute(state, "station-1", "station-4")).toThrow("到達できません");
  });
});
