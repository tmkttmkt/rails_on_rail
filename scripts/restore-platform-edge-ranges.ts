import fs from "node:fs";
import { createHash } from "node:crypto";
import { parseSaveFile, serializeSaveFile, createSaveFile } from "../src/simulation/persistence";
import { analyzeLine, sampleTrack } from "../src/simulation/geometry";
import type { MapState, Station, StationStopPoint } from "../src/simulation/model";

// 旅客ホーム長を、位置復元時の既定値（前後90 m＝合成180 m）からOSMホーム端由来の実測へ戻す。
// 線路集合は公式図と照合済みの現行スナップショットを維持し、長さと端点座標だけを移植する。
// 実測がない範囲は推測で埋めず、現状値のまま残して報告へ出す。

const [, , basePath, edgePath, outputPath] = process.argv;
if (!basePath || !edgePath || !outputPath) throw new Error("使い方: restore-platform-edge-ranges.ts <現行セーブ> <ホーム端セーブ> <出力>");
if (basePath === outputPath || edgePath === outputPath) throw new Error("入力を上書きしない");

const baseSource = fs.readFileSync(basePath, "utf8");
const base = parseSaveFile(baseSource).state;
const edge = parseSaveFile(fs.readFileSync(edgePath, "utf8")).state;

for (const state of [base, edge]) {
  if (state.vehiclePlacements.length || state.operatingTrains.length || state.yard || Object.keys(state.routes).length) throw new Error("運転前の原マップを使う");
  if (state.stationAreas.length || state.stationComplexes.length) throw new Error("領域分割前の原マップを使う");
}

// 幾何が一致しなければ距離をそのまま移せない。
const shape = (state: MapState) => JSON.stringify([state.tracks, state.junctions, state.turnouts]);
if (shape(base) !== shape(edge)) throw new Error("線路・分岐・転てつ器が一致しないため移植できない");

const edgeStations = new Map<string, Map<string, StationStopPoint>>();
for (const station of edge.stations) {
  if (station.kind !== "station") continue;
  if (edgeStations.has(station.name)) throw new Error(`ホーム端セーブに同名の旅客駅がある: ${station.name}`);
  edgeStations.set(station.name, new Map(station.stopPoints.map((p) => [p.trackId, p])));
}

const trackLengthM = new Map(base.tracks.map((t) => [t.id, analyzeLine(sampleTrack(t)).lengthM]));
const restored: { station: string; trackId: string; beforeM: number; afterM: number }[] = [];
const unmeasured: { station: string; trackId: string; lengthM: number; synthetic: boolean }[] = [];
const duplicateNames = new Set<string>();

for (const station of base.stations) {
  if (station.kind !== "station") continue;
  if (base.stations.filter((s) => s.kind === "station" && s.name === station.name).length > 1) duplicateNames.add(station.name);
  const measured = edgeStations.get(station.name);
  station.stopPoints = station.stopPoints.map((point) => {
    const source = measured?.get(point.trackId);
    const beforeM = point.endDistanceM - point.startDistanceM;
    if (!source) {
      unmeasured.push({ station: station.name, trackId: point.trackId, lengthM: Number(beforeM.toFixed(3)), synthetic: Math.abs(beforeM - 180) < 0.01 });
      return point;
    }
    const total = trackLengthM.get(point.trackId);
    if (total === undefined) throw new Error(`線路がない: ${point.trackId}`);
    if (!(source.startDistanceM >= -0.001 && source.endDistanceM <= total + 0.001 && source.endDistanceM > source.startDistanceM)) {
      throw new Error(`実測範囲が線路長に収まらない: ${station.name} ${point.trackId}`);
    }
    restored.push({ station: station.name, trackId: point.trackId, beforeM: Number(beforeM.toFixed(3)), afterM: Number((source.endDistanceM - source.startDistanceM).toFixed(3)) });
    // IDと方向は現行の参照を壊さないため維持する。距離と端点だけを実測へ置き換える。
    return { ...point, startDistanceM: source.startDistanceM, endDistanceM: source.endDistanceM, startPosition: source.startPosition, endPosition: source.endPosition };
  });
}
if (duplicateNames.size) throw new Error(`同名の旅客駅があり移植先を特定できない: ${[...duplicateNames].join(", ")}`);

// 旅客駅以外、線路、分岐、転てつ器、駅の線路集合を変えていないことを確認する。
if (shape(base) !== shape(edge)) throw new Error("移植で幾何が変わった");
const originalBase = parseSaveFile(baseSource).state;
const composition = (state: MapState) => JSON.stringify(state.stations.map((s: Station) => [s.id, s.name, s.kind, s.stopPoints.map((p) => [p.id, p.trackId, p.direction])]));
if (composition(base) !== composition(originalBase)) throw new Error("駅・停車地点の構成が変わった");
const facilities = (state: MapState) => JSON.stringify(state.stations.filter((s) => s.kind !== "station"));
if (facilities(base) !== facilities(originalBase)) throw new Error("構内停車場が変わった");

const serialized = serializeSaveFile(createSaveFile(parseSaveFile(baseSource).metadata.name, base));
parseSaveFile(serialized);
fs.writeFileSync(outputPath, serialized);

const byLength = (rows: typeof restored) => ({
  min: Math.min(...rows.map((r) => r.afterM)), max: Math.max(...rows.map((r) => r.afterM)),
  fits200m: rows.filter((r) => r.afterM >= 200).length,
});
const report = {
  base: basePath, baseSha256: createHash("sha256").update(baseSource).digest("hex"),
  platformEdgeSource: edgePath, output: outputPath,
  outputSha256: createHash("sha256").update(serialized).digest("hex"),
  geometryIdentical: true, stationCompositionUnchanged: true, facilitiesUnchanged: true,
  restoredRanges: restored.length, unmeasuredRanges: unmeasured.length,
  syntheticRemaining: unmeasured.filter((u) => u.synthetic).length,
  restoredLengths: restored.length ? byLength(restored) : null,
  unmeasured, restored,
};
fs.writeFileSync(`${outputPath}.platform-edge.report`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ restoredRanges: report.restoredRanges, unmeasuredRanges: report.unmeasuredRanges, syntheticRemaining: report.syntheticRemaining, restoredLengths: report.restoredLengths, outputSha256: report.outputSha256 }, null, 2));
