import { describe, expect, it } from "vitest";
import { partitionStationStopPoints } from "../src/simulation/stationPartition";
import type { StationStopPoint } from "../src/simulation/model";

const options = { maximumAngleDegrees: 12, maximumLateralDistanceM: 80, minimumOverlapRatio: 0.5 };
function point(id: string, x: number, y: number, endX = x + 500, endY = y): StationStopPoint {
  return { id, trackId: id, startDistanceM: 0, endDistanceM: Math.hypot(endX - x, endY - y), startPosition: { x, y }, endPosition: { x: endX, y: endY }, direction: "both" };
}
describe("構内停車場の線群分割", () => {
  it("並行線はまとめ、離れた線群と長手方向が別の線群を分ける", () => {
    const input = [point("a", 0, 0), point("b", 0, 5), point("c", 0, 200), point("d", 800, 0)];
    const original = structuredClone(input);
    const groups = partitionStationStopPoints(input, options);
    expect(groups.map((group) => group.map((p) => p.id))).toEqual([["a", "b"], ["c"], ["d"]]);
    expect(groups.flat()).toHaveLength(input.length);
    expect(new Set(groups.flat().map((p) => p.id)).size).toBe(input.length);
    expect(input).toEqual(original);
  });
  it("向きが逆の並行線はまとめ、横断線では結合しない", () => {
    const groups = partitionStationStopPoints([point("a", 0, 0), point("b", 500, 5, 0, 5), point("c", 200, -100, 200, 400)], options);
    expect(groups.map((g) => g.length)).toEqual([2, 1]);
  });
  it("空集合と不正設定を扱う", () => {
    expect(partitionStationStopPoints([], options)).toEqual([]);
    expect(() => partitionStationStopPoints([], { ...options, minimumOverlapRatio: 0 })).toThrow(/設定/);
  });
});
