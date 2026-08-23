import fs from "node:fs";
import path from "node:path";
import { executeCommand, type MapCommand } from "../src/simulation/commands";
import { createInitialState } from "../src/simulation/model";
import { createSaveFile, parseSaveFile, serializeSaveFile } from "../src/simulation/persistence";

const outputPath = path.resolve(
  process.cwd(),
  process.argv[2] ?? "saves/operation-planning-review.json",
);

let state = createInitialState();
const run = (command: MapCommand): void => {
  state = executeCommand(state, command).state;
};

const specification = {
  gaugeId: "gauge-1067mm",
  railProfileId: "jis-50n",
  supportSystemId: "pc-sleeper-ballast",
  roadbedId: "reinforced-roadbed",
};

const createTrack = (
  startX: number,
  endX: number,
  startConnectionTrackId?: string,
): void => run({
  type: "track.create",
  geometry: "straight",
  points: [{ x: startX, y: 0 }, { x: endX, y: 0 }],
  startConnectionTrackId,
  specification,
  designSpeedKmh: 100,
});

createTrack(0, 600);
createTrack(600, 1200, "track-1");
createTrack(1200, 1800, "track-2");
createTrack(1800, 2400, "track-3");

const createStation = (name: string, trackId: string, startX: number, endX: number): void => run({
  type: "station.createRange",
  name,
  trackId,
  startPosition: { x: startX, y: 0 },
  endPosition: { x: endX, y: 0 },
});

createStation("青葉", "track-1", 80, 180);
createStation("中央", "track-2", 780, 880);
createStation("境川", "track-3", 1380, 1480);
createStation("海浜", "track-4", 2180, 2280);

run({ type: "line.create", payload: { id: "line-aoba", name: "青葉線", code: "AO", color: "#2563eb" } });
run({ type: "line.create", payload: { id: "line-kaihin", name: "海浜線", code: "KH", color: "#ea580c" } });
run({
  type: "serviceSystem.create",
  payload: {
    id: "system-local",
    lineId: "line-aoba",
    name: "青葉線各駅停車",
    shortName: "各停",
    color: "#60a5fa",
    description: "青葉―境川間の各駅停車",
    displayOrder: 1,
  },
});
run({
  type: "serviceSystem.create",
  payload: {
    id: "system-through",
    lineId: "line-kaihin",
    name: "海浜直通",
    shortName: "直通",
    description: "青葉線から海浜線へ直通する系統",
    displayOrder: 2,
  },
});

run({
  type: "route.create",
  payload: {
    id: "route-aoba-kaihin-down",
    name: "青葉・海浜直通 下り",
    directionName: "下り",
    stops: [
      { stationId: "station-1", trackId: "track-1", commercialType: "stop", dwellSeconds: 30 },
      { stationId: "station-2", trackId: "track-2", commercialType: "stop", dwellSeconds: 45 },
      { stationId: "station-3", trackId: "track-3", commercialType: "pass" },
      { stationId: "station-4", trackId: "track-4", commercialType: "stop", dwellSeconds: 30 },
    ],
    lineSections: [
      { fromStopSequence: 1, toStopSequence: 3, lineId: "line-aoba", serviceSystemId: "system-local" },
      { fromStopSequence: 3, toStopSequence: 4, lineId: "line-kaihin", serviceSystemId: "system-through" },
    ],
  },
});
run({
  type: "route.duplicateReverse",
  payload: {
    sourceRouteId: "route-aoba-kaihin-down",
    name: "海浜・青葉直通 上り",
    directionName: "上り",
  },
});

const down = state.routes["route-aoba-kaihin-down"];
const up = Object.values(state.routes).find((route) => route.name === "海浜・青葉直通 上り");
if (!down || !up) throw new Error("経路を生成できませんでした");

run({
  type: "operation.create",
  payload: {
    id: "operation-101",
    operationNumber: "101",
    name: "朝直通101号",
    routeId: down.id,
    calendar: { weekdays: [1, 2, 3, 4, 5] },
    stopTimes: [
      { routeStopId: down.stops[0].id, departureTime: "08:00:00", dayOffset: 0 },
      { routeStopId: down.stops[1].id, arrivalTime: "08:20:00", departureTime: "08:21:00", dayOffset: 0 },
      { routeStopId: down.stops[2].id, arrivalTime: "08:40:00", departureTime: "08:40:00", dayOffset: 0 },
      { routeStopId: down.stops[3].id, arrivalTime: "09:00:00", dayOffset: 0 },
    ],
  },
});
run({
  type: "operation.create",
  payload: {
    id: "operation-102",
    operationNumber: "102",
    name: "朝直通102号",
    routeId: up.id,
    calendar: { weekdays: [1, 2, 3, 4, 5] },
    stopTimes: [
      { routeStopId: up.stops[0].id, departureTime: "09:10:00", dayOffset: 0 },
      { routeStopId: up.stops[1].id, arrivalTime: "09:30:00", departureTime: "09:30:00", dayOffset: 0 },
      { routeStopId: up.stops[2].id, arrivalTime: "09:49:00", departureTime: "09:50:00", dayOffset: 0 },
      { routeStopId: up.stops[3].id, arrivalTime: "10:10:00", dayOffset: 0 },
    ],
  },
});
run({
  type: "operation.create",
  payload: {
    id: "operation-901",
    operationNumber: "901",
    name: "長期試験901号",
    routeId: down.id,
    calendar: { weekdays: [6] },
    stopTimes: [
      { routeStopId: down.stops[0].id, departureTime: "23:30:00", dayOffset: 0 },
      { routeStopId: down.stops[1].id, arrivalTime: "00:20:00", departureTime: "00:25:00", dayOffset: 1 },
      { routeStopId: down.stops[2].id, arrivalTime: "12:00:00", departureTime: "12:00:00", dayOffset: 1 },
      { routeStopId: down.stops[3].id, arrivalTime: "00:30:00", dayOffset: 2 },
    ],
  },
});

run({ type: "fleet.formation-template.acquire", templateId: "test-passenger-3car", name: "青葉01編成" });
run({ type: "fleet.formation-template.acquire", templateId: "test-passenger-3car", name: "確認用不一致編成" });
const primaryFormation = state.fleet.formations.find((formation) => formation.name === "青葉01編成");
const mismatchFormation = state.fleet.formations.find((formation) => formation.name === "確認用不一致編成");
if (!primaryFormation || !mismatchFormation) throw new Error("編成を生成できませんでした");

run({
  type: "fleet.formation.place",
  formationId: primaryFormation.id,
  stationId: "station-1",
  trackId: "track-1",
  distanceM: 130,
  orientation: "forward",
});
run({
  type: "fleet.formation.place",
  formationId: mismatchFormation.id,
  stationId: "station-2",
  trackId: "track-2",
  distanceM: 230,
  orientation: "forward",
});

run({
  type: "vehicleDuty.create",
  payload: {
    id: "duty-a01",
    name: "青葉A01運用",
    defaultFormationId: primaryFormation.id,
    assignments: [
      { sequence: 1, operationId: "operation-101", serviceDayOffset: 0 },
      { sequence: 2, operationId: "operation-102", serviceDayOffset: 0 },
    ],
  },
});
run({
  type: "vehicleDutyExecution.replaceFormation",
  payload: {
    vehicleDutyId: "duty-a01",
    serviceDate: "2026-08-19",
    formationId: primaryFormation.id,
  },
});

const save = createSaveFile("運行計画UIレビューマップ", state);
const serialized = serializeSaveFile(save);
parseSaveFile(serialized);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, serialized);

console.log(JSON.stringify({
  outputPath,
  version: state.version,
  tracks: state.tracks.length,
  stations: state.stations.length,
  lines: Object.keys(state.lines).length,
  serviceSystems: Object.keys(state.serviceSystems).length,
  routes: Object.keys(state.routes).length,
  operations: Object.keys(state.operations).length,
  vehicleDuties: Object.keys(state.vehicleDuties).length,
  formations: state.fleet.formations.length,
}, null, 2));
