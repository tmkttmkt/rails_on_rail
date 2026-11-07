import fs from "node:fs";
import path from "node:path";
import { parseSaveFile, serializeSaveFile } from "../src/simulation/persistence";

const inputs = process.argv.slice(2);
for (const filename of inputs.length ? inputs : ["saves/osm-bekasovo.json", "saves/osm-bekasovo-split.json"]) {
  const file = path.resolve(filename);
  const original = fs.readFileSync(file, "utf8");
  const save = parseSaveFile(original);
  const state = save.state;
  const station = state.stations.find((s) => s.name === "Бекасово I");
  if (!station) throw new Error(`${filename}: 対象駅がない`);
  if (station.stopPoints.length === 7) { console.log(`${filename}: 修復済み（変更なし）`); continue; }
  if (station.stopPoints.length !== 9) throw new Error(`${filename}: 想定外の停車地点数`);
  const normal = station.stopPoints.filter((p) => p.endDistanceM - p.startDistanceM > 170);
  if (normal.length !== 7) throw new Error(`${filename}: 基準となる7停車地点がない`);
  const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const center = { x: median(normal.map((p) => (p.startPosition.x + p.endPosition.x) / 2)),
    y: median(normal.map((p) => (p.startPosition.y + p.endPosition.y) / 2)) };
  const invalid = station.stopPoints.filter((p) => Math.abs(p.endDistanceM - p.startDistanceM - 2) < 0.01
    && Math.hypot((p.startPosition.x + p.endPosition.x) / 2 - center.x, (p.startPosition.y + p.endPosition.y) / 2 - center.y) > 500);
  if (invalid.length !== 2 || invalid.some((p) => normal.includes(p))) throw new Error(`${filename}: 既知の不正範囲に一致しない`);
  if (state.vehiclePlacements.some((p) => p.stationId === station.id)
    || Object.values(state.routes).some((route) => route.stops.some((stop) => stop.stationId === station.id))) {
    throw new Error(`${filename}: 配置・経路から参照される駅は自動修復できない`);
  }
  station.stopPoints = station.stopPoints.filter((p) => !invalid.includes(p));
  station.position = {
    x: normal.reduce((sum, p) => sum + (p.startPosition.x + p.endPosition.x) / 2, 0) / normal.length,
    y: normal.reduce((sum, p) => sum + (p.startPosition.y + p.endPosition.y) / 2, 0) / normal.length,
  };
  save.metadata.updatedAt = new Date().toISOString();
  const serialized = serializeSaveFile(save);
  parseSaveFile(serialized);
  fs.writeFileSync(`${file}.before-bekasovo-i.bak`, original, { flag: "wx" });
  fs.writeFileSync(file, serialized);
  console.log(`${filename}: ${invalid.map((p) => p.trackId).join(", ")} の遠隔範囲を削除、9→7停車地点。バックアップ作成済み`);
}
