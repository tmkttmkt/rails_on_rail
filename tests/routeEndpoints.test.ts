import { describe, expect, it } from "vitest";
import { executeCommand } from "../src/simulation/commands";
import { createInitialState } from "../src/simulation/model";
import { findPhysicalRouteBetweenStops, buildOperationRoute } from "../src/simulation/pathfinding";
import { buildRouteStops } from "../src/simulation/routeDomain";

function parallelPlatforms() {
  let state = createInitialState();
  for (const y of [0, 10]) state = executeCommand(state, {
    type: "track.create", geometry: "straight", points: [{ x: 0, y }, { x: 1000, y }],
  }).state;
  for (const [name, x] of [["A", 100], ["B", 800]] as const) state = executeCommand(state, {
    type: "station.createRange", name, trackId: "track-1", startPosition: { x, y: 0 }, endPosition: { x: x + 100, y: 0 },
  }).state;
  for (const station of state.stations) station.stopPoints.push({ ...station.stopPoints[0], id: `${station.id}-second`, trackId: "track-2" });
  return state;
}

describe("指定した停車線路と距離を使う経路", () => {
  for (const reverseBranch of [false, true]) it(`分岐での暗黙反転を拒否し、正しい向きは通す（分岐線の定義反転=${reverseBranch}）`, () => {
    let state = createInitialState();
    state = executeCommand(state, { type: "track.create", geometry: "straight", points: [{ x: 0, y: 0 }, { x: 1000, y: 0 }] }).state;
    const branchPoints = [{ x: 500, y: 0 }, { x: 1000, y: 20 }];
    state = executeCommand(state, { type: "track.create", geometry: "straight", points: reverseBranch ? [...branchPoints].reverse() : branchPoints,
      ...(reverseBranch ? { endConnectionTrackId: "track-1" } : { startConnectionTrackId: "track-1" }) }).state;
    for (const [name, trackId, x, y] of [["本線右", "track-1", 800, 0], ["分岐線右", "track-2", 800, 12], ["本線左", "track-1", 100, 0]] as const) {
      state = executeCommand(state, { type: "station.createRange", name, trackId,
        startPosition: { x: x - 10, y }, endPosition: { x: x + 10, y } }).state;
    }
    // Both right-hand arms meet at the left-hand toe: they cannot directly turn into each other.
    expect(() => findPhysicalRouteBetweenStops(state, { stationId: "station-1", trackId: "track-1" }, { stationId: "station-2", trackId: "track-2" })).toThrow("進行方向");
    expect(() => findPhysicalRouteBetweenStops(state, { stationId: "station-2", trackId: "track-2" }, { stationId: "station-1", trackId: "track-1" })).toThrow("進行方向");
    const path = findPhysicalRouteBetweenStops(state, { stationId: "station-3", trackId: "track-1" }, { stationId: "station-2", trackId: "track-2" });
    expect(path.tracks.map((t) => t.trackId)).toEqual(["track-1", "track-2"]);
    expect(path.tracks[0].direction).toBe("forward");
    expect(path.tracks[1].direction).toBe(reverseBranch ? "reversed" : "forward");
    expect(findPhysicalRouteBetweenStops(state, { stationId: "station-2", trackId: "track-2" }, { stationId: "station-3", trackId: "track-1" }).tracks.at(-1)!.direction).toBe("reversed");
  });
  it("駅の先頭ホームより指定ホームを優先し、指定距離で始終する", () => {
    const state = parallelPlatforms();
    const path = findPhysicalRouteBetweenStops(state,
      { stationId: "station-1", trackId: "track-2", distanceM: 170 },
      { stationId: "station-2", trackId: "track-2", distanceM: 820 });
    expect(path.tracks).toEqual([{ trackId: "track-2", direction: "forward", startDistanceM: 170, endDistanceM: 820, lengthM: 650 }]);
    expect(path.totalDistanceM).toBe(650);
  });
  it("指定ホーム間が未接続なら別ホームへ逃げない", () => {
    const state = parallelPlatforms();
    expect(() => findPhysicalRouteBetweenStops(state,
      { stationId: "station-1", trackId: "track-1" }, { stationId: "station-2", trackId: "track-2" })).toThrow("到達できません");
  });
  it("逆方向と駅だけの従来指定も維持する", () => {
    const state = parallelPlatforms();
    const path = findPhysicalRouteBetweenStops(state,
      { stationId: "station-2", trackId: "track-2", distanceM: 820 },
      { stationId: "station-1", trackId: "track-2", distanceM: 170 });
    expect(path.tracks[0].direction).toBe("reversed");
    expect(findPhysicalRouteBetweenStops(state, { stationId: "station-1" }, { stationId: "station-2" }).totalDistanceM).toBe(700);
  });
  it("他ホームの停車点IDや範囲外距離を拒否する", () => {
    const state = parallelPlatforms();
    const stops = [{ stationId: "station-1", trackId: "track-2", stopPointId: state.stations[0].stopPoints[0].id },
      { stationId: "station-2", trackId: "track-2" }];
    expect(() => buildRouteStops(state, stops)).toThrow("停車地点がありません");
    expect(() => buildOperationRoute(state, { name: "不一致", stops })).toThrow("停車地点がありません");
    expect(() => findPhysicalRouteBetweenStops(state,
      { stationId: "station-1", trackId: "track-2", distanceM: 500 }, { stationId: "station-2", trackId: "track-2" })).toThrow("範囲外");
  });
});
