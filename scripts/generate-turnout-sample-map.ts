import fs from "node:fs";
import path from "node:path";
import { executeCommand, type MapCommand } from "../src/simulation/commands";
import { createInitialState } from "../src/simulation/model";
import { inspectTrackRadii } from "../src/simulation/inspection";
import { createSaveFile, parseSaveFile, serializeSaveFile } from "../src/simulation/persistence";
import { trackCatalog } from "../src/data/trackCatalog";

// 転てつ器カタログの全形式を並べ、番数ごとの分岐の開き方を目視比較するマップ。
const outputPath = path.resolve(process.cwd(), process.argv[2] ?? "saves/turnout-sample.json");
let state = createInitialState();
const run = (command: MapCommand): void => { state = executeCommand(state, command).state; };

const specification = {
  gaugeId: "gauge-1067mm",
  railProfileId: "jis-50n",
  supportSystemId: "pc-sleeper-ballast",
  roadbedId: "reinforced-roadbed",
};

const types = trackCatalog.turnoutTypes;
types.forEach((type, index) => {
  const y = index * 260;
  const baseId = `track-${state.nextTrackId}`;
  run({
    type: "track.create", geometry: "straight",
    points: [{ x: 0, y }, { x: 1400, y }],
    specification, designSpeedKmh: 120,
  });
  // 同じ基準線へ左右一対を設置し、開き方を比較できるようにする。
  run({ type: "turnout.create", trackId: baseId, position: { x: 300, y }, typeId: type.id, side: "right", divergingLengthM: 400 });
  run({ type: "turnout.create", trackId: baseId, position: { x: 300, y }, typeId: type.id, side: "left", divergingLengthM: 400 });

  const diverging = state.tracks[state.tracks.length - 2];
  const end = diverging.points[diverging.points.length - 1];
  console.log(`${type.name.padEnd(9)} N=${String(type.frogNumber).padStart(2)} R=${String(type.divergingRadiusM).padStart(3)} m ${String(type.divergingSpeedKmh).padStart(2)} km/h  横距=${(end.y - y).toFixed(1)} m / 縦距=${end.x.toFixed(0)} m`);
});

run({ type: "station.createRange", name: "転てつ器見本", trackId: "track-1", startPosition: { x: 900, y: 0 }, endPosition: { x: 1300, y: 0 }, includeTrackGroup: false });

const topology = inspectTrackRadii(state).topology;
console.log(`転てつ器=${state.turnouts.length} 線路=${state.tracks.length} 接続点=${state.junctions.length}`);
console.log(`接続成分=${topology.connectedComponents.length} 不正接続=${topology.invalidConnections.length} 孤立線路=${topology.isolatedTrackIds.length}`);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, serializeSaveFile(createSaveFile("転てつ器見本", state)), "utf8");
parseSaveFile(fs.readFileSync(outputPath, "utf8"));
console.log(`保存: ${outputPath}`);
