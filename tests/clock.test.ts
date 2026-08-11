import { describe, expect, it } from "vitest";
import { executeCommand } from "../src/simulation/commands";
import { INITIAL_SIMULATION_TIME_MS, createInitialState } from "../src/simulation/model";

describe("ゲーム内時間", () => {
  it("1900年1月1日6時に一時停止状態で開始する", () => {
    expect(createInitialState().clock).toEqual({ currentTimeMs: INITIAL_SIMULATION_TIME_MS, paused: true, speedMultiplier: 1 });
  });

  it("tickでゲーム内時刻を進める", () => {
    const state = executeCommand(createInitialState(), { type: "simulation.tick", elapsedSeconds: 90 }).state;
    expect(state.clock.currentTimeMs).toBe(INITIAL_SIMULATION_TIME_MS + 90_000);
  });

  it("一時停止と速度倍率を操作命令で変更する", () => {
    let state = executeCommand(createInitialState(), { type: "simulation.setPaused", paused: false }).state;
    state = executeCommand(state, { type: "simulation.setSpeed", speedMultiplier: 300 }).state;
    expect(state.clock).toMatchObject({ paused: false, speedMultiplier: 300 });
  });

  it("負の時間と未対応速度を拒否する", () => {
    expect(() => executeCommand(createInitialState(), { type: "simulation.tick", elapsedSeconds: -1 })).toThrow("経過時間");
    expect(() => executeCommand(createInitialState(), { type: "simulation.setSpeed", speedMultiplier: 42 as 1 })).toThrow("対応していない時間速度");
  });

  it("マップ消去ではゲーム内時計を維持する", () => {
    let state = executeCommand(createInitialState(), { type: "simulation.tick", elapsedSeconds: 3600 }).state;
    state = executeCommand(state, { type: "map.clear" }).state;
    expect(state.clock.currentTimeMs).toBe(INITIAL_SIMULATION_TIME_MS + 3_600_000);
  });

  it("同じtickで時計と運行列車を進める", () => {
    let state = executeCommand(createInitialState(), { type: "track.create", geometry: "straight", points: [{ x: 0, y: 0 }, { x: 300, y: 0 }] }).state;
    state = executeCommand(state, { type: "station.createRange", name: "A", trackId: "track-1", startPosition: { x: 10, y: 0 }, endPosition: { x: 30, y: 0 } }).state;
    state = executeCommand(state, { type: "station.createRange", name: "B", trackId: "track-1", startPosition: { x: 270, y: 0 }, endPosition: { x: 290, y: 0 } }).state;
    state = executeCommand(state, { type: "route.create", name: "A-B", stationIds: ["station-1", "station-2"] }).state;
    state = executeCommand(state, { type: "train.dispatch", routeId: "route-1", formationId: "formation-1", name: "時計試験", speedKph: 36, dwellSeconds: 5 }).state;
    state = executeCommand(state, { type: "simulation.tick", elapsedSeconds: 35 }).state;
    expect(state.clock.currentTimeMs).toBe(INITIAL_SIMULATION_TIME_MS + 35_000);
    expect(state.operatingTrains[0].state).toBe("completed");
  });
});
