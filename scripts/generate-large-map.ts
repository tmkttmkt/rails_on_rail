import fs from "node:fs";
import { executeCommand, type MapCommand } from "../src/simulation/commands";
import { createInitialState } from "../src/simulation/model";
import { createSaveFile, serializeSaveFile } from "../src/simulation/persistence";

const outputPath = process.argv[2];
if (!outputPath) throw new Error("出力先を指定してください");

let state = createInitialState();
const run = (command: MapCommand): void => { state = executeCommand(state, command).state; };
const specification = {
  gaugeId: "gauge-1067mm",
  railProfileId: "jis-50n",
  supportSystemId: "pc-sleeper-ballast",
  roadbedId: "reinforced-roadbed",
};
const track = (command: Extract<MapCommand, { type: "track.create" }>): void => run({
  ...command,
  specification,
  designSpeedKmh: command.designSpeedKmh ?? 80,
});

// 複線環状本線
track({ type: "track.create", geometry: "straight", points: [{ x: -900, y: -500 }, { x: 900, y: -500 }], trackCount: 2, trackSpacing: 12 });
track({ type: "track.create", geometry: "curve", points: [{ x: 900, y: -500 }, { x: 1250, y: 0 }, { x: 900, y: 500 }], trackCount: 2, trackSpacing: 12, startConnectionTrackId: "track-1", designSpeedKmh: 70 });
track({ type: "track.create", geometry: "straight", points: [{ x: 900, y: 500 }, { x: -900, y: 500 }], trackCount: 2, trackSpacing: 12, startConnectionTrackId: "track-3" });
track({ type: "track.create", geometry: "curve", points: [{ x: -900, y: 500 }, { x: -1250, y: 0 }, { x: -900, y: -500 }], trackCount: 2, trackSpacing: 12, startConnectionTrackId: "track-5", endConnectionTrackId: "track-1", designSpeedKmh: 70 });

// 南北支線と空港支線
track({ type: "track.create", geometry: "curve", points: [{ x: 0, y: -500 }, { x: -120, y: -760 }, { x: 0, y: -1000 }], trackCount: 2, trackSpacing: 12, startConnectionTrackId: "track-1", designSpeedKmh: 55 });
track({ type: "track.create", geometry: "straight", points: [{ x: 0, y: -1000 }, { x: 0, y: -1700 }], trackCount: 2, trackSpacing: 12, startConnectionTrackId: "track-9", designSpeedKmh: 90 });
track({ type: "track.create", geometry: "curve", points: [{ x: 450, y: 500 }, { x: 700, y: 760 }, { x: 1050, y: 900 }], trackCount: 2, trackSpacing: 12, startConnectionTrackId: "track-5", designSpeedKmh: 60 });
track({ type: "track.create", geometry: "straight", points: [{ x: 1050, y: 900 }, { x: 1650, y: 900 }], trackCount: 2, trackSpacing: 12, startConnectionTrackId: "track-13", designSpeedKmh: 90 });

// 貨物ヤード・留置線
track({ type: "track.create", geometry: "curve", points: [{ x: -350, y: 500 }, { x: -520, y: 700 }, { x: -650, y: 820 }], startConnectionTrackId: "track-5", designSpeedKmh: 35 });
for (let index = 0; index < 5; index += 1) {
  track({ type: "track.create", geometry: "straight", points: [{ x: -650, y: 820 + index * 45 }, { x: -1250, y: 820 + index * 45 }], startConnectionTrackId: index === 0 ? "track-17" : undefined, designSpeedKmh: 25 });
}

const station = (name: string, trackId: string, startPosition: { x: number; y: number }, endPosition: { x: number; y: number }, includeTrackGroup = true): void => {
  run({ type: "station.createRange", name, trackId, startPosition, endPosition, includeTrackGroup });
};
station("中央北", "track-1", { x: -150, y: -500 }, { x: 150, y: -500 });
station("中央南", "track-5", { x: 150, y: 500 }, { x: -150, y: 500 });
station("東環状", "track-3", { x: 1180, y: -180 }, { x: 1180, y: 180 });
station("西環状", "track-7", { x: -1180, y: 180 }, { x: -1180, y: -180 });
station("北新都心", "track-11", { x: 0, y: -1250 }, { x: 0, y: -1450 });
station("空港", "track-15", { x: 1350, y: 900 }, { x: 1580, y: 900 });
station("貨物ターミナル", "track-18", { x: -800, y: 820 }, { x: -1150, y: 820 }, false);

const save = createSaveFile("大規模AI生成マップ", state);
fs.writeFileSync(outputPath, serializeSaveFile(save));
console.log(JSON.stringify({ outputPath, tracks: state.tracks.length, groups: state.trackGroups.length, stations: state.stations.length }));
