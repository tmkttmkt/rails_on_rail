import { describe, expect, it } from "vitest";
import { getStationImportRange, restoreStationStopPoint, selectStationImportRange } from "../src/simulation/stationImportRange";
import { createInitialState } from "../src/simulation/model";
import { executeCommand } from "../src/simulation/commands";

describe("駅位置に対応する取り込み範囲", () => {
  it("遠隔2 m範囲を元駅の投影位置から復元し、停車地点IDと線路IDを維持する", () => {
    const state = executeCommand(createInitialState(), { type: "track.create", geometry: "straight", points: [{ x: 0, y: 0 }, { x: 10000, y: 0 }] }).state;
    const bad = { id: "sp-1", trackId: "track-1", startDistanceM: 9000, endDistanceM: 9002,
      startPosition: { x: 9000, y: 0 }, endPosition: { x: 9002, y: 0 }, direction: "both" as const };
    expect(restoreStationStopPoint(state, bad, { x: 1000, y: 4 })).toEqual({ ...bad,
      startDistanceM: 910, endDistanceM: 1090, startPosition: { x: 910, y: 0 }, endPosition: { x: 1090, y: 0 } });
    expect(restoreStationStopPoint(state, bad, { x: 1000, y: 200 })).toBeUndefined();
    expect(bad.startDistanceM).toBe(9000);
  });

  it("駅近くの分岐で区切り、遠隔の接続点へ駅を丸めない", () => {
    const state = executeCommand(createInitialState(), { type: "track.create", geometry: "straight", points: [{ x: 0, y: 0 }, { x: 10000, y: 0 }] }).state;
    state.junctions.push({ id: "junction-test", position: { x: 1040, y: 0 }, ports: [
      { trackId: "track-1", distanceM: 1040, location: "interior" }, { trackId: "other", distanceM: 0, location: "start" }] });
    const span = getStationImportRange(state, state.tracks[0], 1000, 10000, 90)!;
    expect(span.startM).toBe(910);
    expect(span.endM).toBeCloseTo(1039.999);
    expect(getStationImportRange(state, state.tracks[0], 1040, 10000, 90)).toBeUndefined();
  });
  it("長い遠隔区間ではなく駅位置を含む区間を使う", () => {
    expect(selectStationImportRange([{ startM: 0, endM: 10000 }, { startM: 12000, endM: 12400 }], 12200, 90))
      .toEqual({ startM: 12110, endM: 12290 });
  });
  it("駅位置が禁止区間なら遠隔区間へ丸めず省略する", () => {
    expect(selectStationImportRange([{ startM: 9132, endM: 15000 }], 1800, 90)).toBeUndefined();
  });
  it("駅近傍との積集合を取り、範囲を広げない", () => {
    expect(selectStationImportRange([{ startM: 170, endM: 250 }], 200, 90)).toEqual({ startM: 170, endM: 250 });
    expect(selectStationImportRange([{ startM: 199.5, endM: 200.5 }], 200, 90)).toBeUndefined();
  });
});
