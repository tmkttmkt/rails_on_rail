import fs from "node:fs";
import path from "node:path";
import { parseSaveFile, serializeSaveFile } from "../src/simulation/persistence";
import { partitionStationStopPoints } from "../src/simulation/stationPartition";

const input = path.resolve(process.argv[2] ?? "saves/osm-bekasovo.json");
const output = path.resolve(process.argv[3] ?? "saves/osm-bekasovo-split.json");
if (input === output || fs.existsSync(output)) throw new Error("元データや既存の分割版を上書きしない。別の出力名を指定すること");
const save = parseSaveFile(fs.readFileSync(input, "utf8"));
const state = save.state;
// 暫定マップ編集値。実施設の境界・用途を保証するものではない。
const options = { maximumAngleDegrees: 12, maximumLateralDistanceM: 80, minimumOverlapRatio: 0.5 };
const target = state.stations.find((station) => station.kind !== "station" && station.stopPoints.length > 100);
if (!target) throw new Error("分割対象の巨大な構内停車場がない");
// この編集スクリプトは未運用マップ専用。既存運用の参照を黙って壊さない。
if (state.vehiclePlacements.length || Object.keys(state.routes).length || Object.keys(state.operations).length || state.operatingTrains.length) {
  throw new Error("配置・運行・経路があるマップは自動分割できない");
}
const groups = partitionStationStopPoints(target.stopPoints, options)
  .sort((a, b) => Math.min(...a.map((p) => p.startPosition.y)) - Math.min(...b.map((p) => p.startPosition.y)));
const stations = groups.map((stopPoints, index) => {
  const id = index === 0 ? target.id : `station-${state.nextStationId++}`;
  return { ...target, id, name: `ベカソヴォ構内・線群${String(index + 1).padStart(2, "0")}`,
    position: { x: stopPoints.reduce((s, p) => s + (p.startPosition.x + p.endPosition.x) / 2, 0) / stopPoints.length,
      y: stopPoints.reduce((s, p) => s + (p.startPosition.y + p.endPosition.y) / 2, 0) / stopPoints.length },
    stopPoints: stopPoints.map((p, i) => ({ ...p, id: `${id}-sp-${i + 1}` })) };
});
state.stations = state.stations.flatMap((station) => station.id === target.id ? stations : [station]);
save.metadata.name = "ベカソヴォ (OSM・停車場分割版)";
save.metadata.updatedAt = new Date().toISOString();
const serialized = serializeSaveFile(save);
parseSaveFile(serialized);
fs.writeFileSync(output, serialized, { flag: "wx" });
console.log(`${target.stopPoints.length}線路を${stations.length}停車場へ分割: ${stations.map((s) => s.stopPoints.length).join(", ")}`);
console.log(output);
