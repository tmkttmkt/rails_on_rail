import fs from "node:fs";
import path from "node:path";
import { parseSaveFile, serializeSaveFile } from "../src/simulation/persistence";
import { projectStationOnTrack, restoreStationStopPoint } from "../src/simulation/stationImportRange";
import type { Point } from "../src/simulation/model";

const [savePath, tracksPath, stationsPath, flag] = process.argv.slice(2);
if (!savePath || !tracksPath || !stationsPath) throw new Error("使い方: repair-imported-stations.ts <セーブ> <元線路OSM> <元駅OSM> [--write]");
const file = path.resolve(savePath);
const original = fs.readFileSync(file, "utf8");
const save = parseSaveFile(original);
const state = save.state;
interface OsmElement { type: string; id: number; lat?: number; lon?: number; tags?: { name?: string } }
const rails = JSON.parse(fs.readFileSync(tracksPath, "utf8")).elements as OsmElement[];
const nodes = [...new Map(rails.filter((e) => e.type === "node").map((e) => [e.id, e])).values()];
if (!nodes.length || nodes.some((e) => !Number.isFinite(e.lat) || !Number.isFinite(e.lon))) throw new Error("元線路座標が不正");
const lat0 = nodes.reduce((s, n) => s + n.lat!, 0) / nodes.length;
const lon0 = nodes.reduce((s, n) => s + n.lon!, 0) / nodes.length;
const project = (n: OsmElement): Point => ({ x: (n.lon! - lon0) * 111320 * Math.cos(lat0 * Math.PI / 180), y: -(n.lat! - lat0) * 111320 });
const stationNodes = (JSON.parse(fs.readFileSync(stationsPath, "utf8")).elements as OsmElement[])
  .filter((n) => n.type === "node" && Number.isFinite(n.lat) && Number.isFinite(n.lon) && n.tags?.name);
let changed = 0, restored = 0, removed = 0;
for (const station of state.stations) {
  if (station.kind !== "station") continue;
  const pointsToRepair = [...station.stopPoints];
  // 前回は元OSMの所在が不明だったため削除した2範囲も、原座標が得られた今回は復元する。
  const previousBackup = `${file}.before-bekasovo-i.bak`;
  if (station.name === "Бекасово I" && station.stopPoints.length === 7 && fs.existsSync(previousBackup)) {
    const previous = parseSaveFile(fs.readFileSync(previousBackup, "utf8")).state.stations.find((s) => s.id === station.id);
    if (previous?.stopPoints.length === 9) {
      pointsToRepair.push(...previous.stopPoints.filter((p) => !station.stopPoints.some((current) => current.trackId === p.trackId)
        && Math.abs(p.endDistanceM - p.startDistanceM - 2) < 0.02));
    }
  }
  const bad = pointsToRepair.filter((p) => Math.abs(p.endDistanceM - p.startDistanceM - 2) < 0.02);
  if (!bad.length) continue;
  if (state.vehiclePlacements.some((p) => p.stationId === station.id)
    || Object.values(state.routes).some((r) => r.stops.some((p) => p.stationId === station.id))) throw new Error(`${station.name}: 配置・経路参照あり`);
  const candidates = stationNodes.filter((n) => n.tags!.name === station.name).map((node) => {
    const point = project(node);
    return { point, distance: Math.min(...state.tracks.map((t) => projectStationOnTrack(t, point).distanceM)) };
  }).sort((a, b) => a.distance - b.distance);
  if (!candidates.length || candidates[0].distance > 150 || (candidates.length > 1 && candidates[1].distance - candidates[0].distance < 1
    && Math.hypot(candidates[1].point.x - candidates[0].point.x, candidates[1].point.y - candidates[0].point.y) > 300)) {
    throw new Error(`${station.name}: 元座標がないか同名駅が曖昧`);
  }
  const target = candidates[0].point;
  const replacements = pointsToRepair.flatMap((p) => {
    if (!bad.includes(p)) return [p];
    const replacement = restoreStationStopPoint(state, p, target);
    if (replacement) { restored++; return [replacement]; }
    removed++; return [];
  });
  if (!replacements.length) throw new Error(`${station.name}: 全範囲の復元に失敗`);
  // 元座標と既存正常範囲の整合性で投影・同名駅の選択を検証する。
  for (const p of station.stopPoints.filter((p) => !bad.includes(p))) {
    const t = state.tracks.find((t) => t.id === p.trackId)!;
    const hit = projectStationOnTrack(t, target);
    if (hit.distanceM > 150 || hit.alongM < p.startDistanceM - 200 || hit.alongM > p.endDistanceM + 200) throw new Error(`${station.name}: 正常範囲と元座標が不整合`);
  }
  console.log(`${station.name}: ${bad.length}誤範囲 → ${replacements.length}停車地点（元${station.stopPoints.length}）`);
  station.stopPoints = replacements;
  station.position = {
    x: replacements.reduce((s, p) => s + (p.startPosition.x + p.endPosition.x) / 2, 0) / replacements.length,
    y: replacements.reduce((s, p) => s + (p.startPosition.y + p.endPosition.y) / 2, 0) / replacements.length,
  };
  changed++;
}
console.log(JSON.stringify({ changed, restored, removed, write: flag === "--write" }));
if (changed && flag === "--write") {
  save.metadata.updatedAt = new Date().toISOString();
  const serialized = serializeSaveFile(save);
  parseSaveFile(serialized);
  fs.writeFileSync(`${file}.before-station-repair.bak`, original, { flag: "wx" });
  fs.writeFileSync(file, serialized);
}
