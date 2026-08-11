import fs from "node:fs";
import path from "node:path";
import { executeCommand, type MapCommand } from "../src/simulation/commands";
import { createInitialState } from "../src/simulation/model";
import { createSaveFile, parseSaveFile, serializeSaveFile } from "../src/simulation/persistence";

const specification = {
  gaugeId: "gauge-1067mm",
  railProfileId: "jis-37a",
  supportSystemId: "timber-sleeper-direct-ballast",
  roadbedId: "standard-drained-roadbed",
};

let state = createInitialState();
const run = (command: MapCommand): void => { state = executeCommand(state, command).state; };
const track = (command: Extract<MapCommand, { type: "track.create" }>): void => run({ ...command, specification, designSpeedKmh: command.designSpeedKmh ?? 65 });

// Main line: three independently connected sections make junction and route traversal testable.
track({ type: "track.create", geometry: "straight", points: [{ x: -1200, y: 0 }, { x: -350, y: 0 }], designSpeedKmh: 55 });
track({ type: "track.create", geometry: "curve", points: [{ x: -350, y: 0 }, { x: -160, y: -35 }, { x: 160, y: 35 }, { x: 350, y: 0 }], startConnectionTrackId: "track-1", designSpeedKmh: 45 });
track({ type: "track.create", geometry: "straight", points: [{ x: 350, y: 0 }, { x: 1200, y: 0 }], startConnectionTrackId: "track-2", designSpeedKmh: 65 });

// Passing loops for meets, run-around moves and overtaking tests.
track({ type: "track.create", geometry: "curve", points: [{ x: -1050, y: 0 }, { x: -960, y: -70 }, { x: -760, y: -70 }, { x: -670, y: 0 }], startConnectionTrackId: "track-1", endConnectionTrackId: "track-1", designSpeedKmh: 25 });
track({ type: "track.create", geometry: "curve", points: [{ x: -260, y: -16 }, { x: -190, y: -105 }, { x: 190, y: -35 }, { x: 270, y: 16 }], startConnectionTrackId: "track-2", endConnectionTrackId: "track-2", designSpeedKmh: 30 });
track({ type: "track.create", geometry: "curve", points: [{ x: 680, y: 0 }, { x: 760, y: 70 }, { x: 970, y: 70 }, { x: 1050, y: 0 }], startConnectionTrackId: "track-3", endConnectionTrackId: "track-3", designSpeedKmh: 25 });

// Mountain branch. The current model has no elevation yet; the curves and lower design speed mark the future grade-test section.
track({ type: "track.create", geometry: "curve", points: [{ x: 0, y: 0 }, { x: -40, y: 170 }, { x: 80, y: 330 }, { x: 20, y: 500 }], startConnectionTrackId: "track-2", designSpeedKmh: 30 });
track({ type: "track.create", geometry: "curve", points: [{ x: 20, y: 500 }, { x: -100, y: 650 }, { x: 40, y: 820 }], startConnectionTrackId: "track-7", designSpeedKmh: 20 });
track({ type: "track.create", geometry: "curve", points: [{ x: -35, y: 610 }, { x: 45, y: 575 }, { x: 130, y: 625 }], startConnectionTrackId: "track-8", designSpeedKmh: 15 });

// West steam depot: engine lead, coaling/watering road, shed road and ash-pit road.
track({ type: "track.create", geometry: "straight", points: [{ x: -1120, y: 0 }, { x: -1120, y: 300 }], startConnectionTrackId: "track-1", designSpeedKmh: 15 });
track({ type: "track.create", geometry: "straight", points: [{ x: -1120, y: 130 }, { x: -930, y: 250 }], startConnectionTrackId: "track-10", designSpeedKmh: 10 });
track({ type: "track.create", geometry: "straight", points: [{ x: -1120, y: 190 }, { x: -930, y: 310 }], startConnectionTrackId: "track-10", designSpeedKmh: 10 });
track({ type: "track.create", geometry: "straight", points: [{ x: -1120, y: 250 }, { x: -930, y: 370 }], startConnectionTrackId: "track-10", designSpeedKmh: 10 });

// East freight yard and locomotive release road.
track({ type: "track.create", geometry: "straight", points: [{ x: 760, y: 0 }, { x: 760, y: -260 }], startConnectionTrackId: "track-3", designSpeedKmh: 15 });
track({ type: "track.create", geometry: "straight", points: [{ x: 760, y: -100 }, { x: 980, y: -190 }], startConnectionTrackId: "track-14", designSpeedKmh: 10 });
track({ type: "track.create", geometry: "straight", points: [{ x: 760, y: -165 }, { x: 980, y: -255 }], startConnectionTrackId: "track-14", designSpeedKmh: 10 });

const station = (name: string, trackId: string, startPosition: { x: number; y: number }, endPosition: { x: number; y: number }): void => {
  run({ type: "station.createRange", name, trackId, startPosition, endPosition });
};

station("西港", "track-1", { x: -1170, y: 0 }, { x: -1070, y: 0 });
station("西港機回し線", "track-4", { x: -1010, y: -70 }, { x: -710, y: -70 });
run({ type: "station.merge", stationIds: ["station-1", "station-2"] });

station("高原口", "track-1", { x: -880, y: 0 }, { x: -770, y: 0 });
station("高原口待避", "track-4", { x: -940, y: -70 }, { x: -790, y: -70 });
run({ type: "station.merge", stationIds: ["station-3", "station-4"] });

station("中央", "track-2", { x: -90, y: -12 }, { x: 90, y: 12 });
station("中央待避", "track-5", { x: -120, y: -85 }, { x: 120, y: -55 });
station("中央支線", "track-7", { x: -5, y: 35 }, { x: -18, y: 120 });
run({ type: "station.merge", stationIds: ["station-5", "station-6", "station-7"] });

station("東野", "track-3", { x: 790, y: 0 }, { x: 900, y: 0 });
station("東野待避", "track-6", { x: 800, y: 70 }, { x: 940, y: 70 });
run({ type: "station.merge", stationIds: ["station-8", "station-9"] });

station("東埠頭", "track-3", { x: 1080, y: 0 }, { x: 1180, y: 0 });
station("峠下", "track-7", { x: 25, y: 345 }, { x: 28, y: 445 });
station("山上", "track-8", { x: -65, y: 675 }, { x: 10, y: 770 });
station("山上貨物", "track-9", { x: 15, y: 590 }, { x: 105, y: 615 });

const stationId = (name: string): string => {
  const found = state.stations.find((item) => item.name === name);
  if (!found) throw new Error(`Station not found: ${name}`);
  return found.id;
};

run({ type: "route.create", name: "本線旅客 西港→東埠頭", stationIds: [stationId("西港"), stationId("高原口"), stationId("中央"), stationId("東野"), stationId("東埠頭")] });
run({ type: "route.create", name: "本線旅客 東埠頭→西港", stationIds: [stationId("東埠頭"), stationId("東野"), stationId("中央"), stationId("高原口"), stationId("西港")] });
run({ type: "route.create", name: "山岳支線 中央→山上", stationIds: [stationId("中央"), stationId("峠下"), stationId("山上")] });
run({ type: "route.create", name: "山岳支線 山上→中央", stationIds: [stationId("山上"), stationId("峠下"), stationId("中央")] });
run({ type: "route.create", name: "貨物 山上貨物→東野", stationIds: [stationId("山上貨物"), stationId("山上"), stationId("中央"), stationId("東野")] });

const createdAt = "2026-08-11T00:00:00.000Z";
const save = createSaveFile("蒸気機関車運用試験線", state, createdAt, createdAt);
for (const route of state.routes) {
  let verification = executeCommand(state, { type: "train.dispatch", routeId: route.id, formationId: "steam-test-formation", name: `${route.name} 走破確認`, speedKph: 30, dwellSeconds: 30 }).state;
  for (let step = 0; step < 1_000 && verification.operatingTrains.at(-1)?.state !== "completed"; step += 1) {
    verification = executeCommand(verification, { type: "simulation.tick", elapsedSeconds: 60 }).state;
  }
  const train = verification.operatingTrains.at(-1);
  if (train?.state !== "completed") throw new Error(`Route did not complete: ${route.name}`);
}
const output = path.resolve(process.cwd(), "saves", "steam-locomotive-operations-test.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, serializeSaveFile(save));
parseSaveFile(fs.readFileSync(output, "utf8"));
console.log(`Generated ${output}`);
console.log(`tracks=${state.tracks.length} stations=${state.stations.length} routes=${state.routes.length} verifiedRoutes=${state.routes.length}`);
