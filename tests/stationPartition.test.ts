import { describe, expect, it } from "vitest";
import { partitionStationStopPoints, partitionStationStopPointsByTrack } from "../src/simulation/stationPartition";
import type { StationStopPoint } from "../src/simulation/model";

const options = { maximumAngleDegrees: 12, maximumLateralDistanceM: 80, minimumOverlapRatio: 0.5 };
function point(id: string, x: number, y: number, endX = x + 500, endY = y): StationStopPoint {
  return { id, trackId: id, startDistanceM: 0, endDistanceM: Math.hypot(endX - x, endY - y), startPosition: { x, y }, endPosition: { x: endX, y: endY }, direction: "both" };
}
function span(id: string, trackId: string, x: number, y: number, endX = x + 500, endY = y): StationStopPoint {
  return { id, trackId, startDistanceM: 0, endDistanceM: Math.hypot(endX - x, endY - y), startPosition: { x, y }, endPosition: { x: endX, y: endY }, direction: "both" };
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

describe("線路単位の線群分割", () => {
  it("分岐で分断された同一線路の区間を同じ線群へまとめる", () => {
    // track-1 は 0〜500 と 900〜1400 に分断されている。長手方向に重ならないため
    // 範囲単位の判定では別の線群になるが、同じ線路なのでまとめる必要がある。
    const input = [span("a1", "track-1", 0, 0), span("b1", "track-2", 0, 5), span("a2", "track-1", 900, 0), span("c1", "track-3", 900, 5)];
    const original = structuredClone(input);
    expect(partitionStationStopPoints(input, options).map((g) => g.map((p) => p.id).sort())).toEqual([["a1", "b1"], ["a2", "c1"]]);
    const groups = partitionStationStopPointsByTrack(input, options);
    expect(groups).toHaveLength(1);
    expect(groups[0].map((p) => p.id).sort()).toEqual(["a1", "a2", "b1", "c1"]);
    // 区間を欠落・重複させず、入力も壊さない。
    expect(groups.flat()).toHaveLength(input.length);
    expect(new Set(groups.flat().map((p) => p.id)).size).toBe(input.length);
    expect(input).toEqual(original);
  });
  it("線路を共有しない線群は結合しない", () => {
    const groups = partitionStationStopPointsByTrack([span("a", "track-1", 0, 0), span("b", "track-2", 0, 5), span("c", "track-3", 0, 400)], options);
    expect(groups.map((g) => g.map((p) => p.trackId).sort())).toEqual([["track-1", "track-2"], ["track-3"]]);
  });
  it("同一線路が3つ以上の線群へ跨る場合も1つへ畳む", () => {
    const input = [span("x1", "track-1", 0, 0), span("y", "track-2", 0, 5), span("x2", "track-1", 900, 0), span("z", "track-3", 900, 5), span("x3", "track-1", 1800, 0), span("w", "track-4", 1800, 5)];
    const groups = partitionStationStopPointsByTrack(input, options);
    expect(groups).toHaveLength(1);
    expect(new Set(groups[0].map((p) => p.trackId))).toEqual(new Set(["track-1", "track-2", "track-3", "track-4"]));
  });
  it("空集合と不正設定を扱う", () => {
    expect(partitionStationStopPointsByTrack([], options)).toEqual([]);
    expect(() => partitionStationStopPointsByTrack([], { ...options, maximumLateralDistanceM: 0 })).toThrow(/設定/);
  });
});
