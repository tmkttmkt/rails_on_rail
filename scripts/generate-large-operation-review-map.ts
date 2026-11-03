import fs from "node:fs";
import path from "node:path";
import { executeCommand, type MapCommand } from "../src/simulation/commands";
import { createInitialState } from "../src/simulation/model";
import { createSaveFile, parseSaveFile, serializeSaveFile } from "../src/simulation/persistence";

const outputPath = path.resolve(process.cwd(), process.argv[2] ?? "saves/large-operation-planning-review.json");
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

// 12区間・全長6 kmの接続済み幹線。路線分類に依存せず全運行が利用できる。
for (let index = 0; index < 12; index += 1) {
  const startX = -3000 + index * 500;
  track({
    type: "track.create",
    geometry: "straight",
    points: [{ x: startX, y: 0 }, { x: startX + 500, y: 0 }],
    startConnectionTrackId: index === 0 ? undefined : `track-${index}`,
    designSpeedKmh: index < 2 || index > 9 ? 80 : 120,
  });
}

// 大規模表示・将来の入出庫確認用留置線10本（運行経路には未使用）。
for (let index = 0; index < 10; index += 1) {
  track({
    type: "track.create",
    geometry: "straight",
    points: [{ x: -1800, y: 450 + index * 55 }, { x: -800, y: 450 + index * 55 }],
    designSpeedKmh: 25,
  });
}

const station = (name: string, trackId: string, startPosition: { x: number; y: number }, endPosition: { x: number; y: number }, includeTrackGroup = true): void => run({
  type: "station.createRange", name, trackId, startPosition, endPosition, includeTrackGroup,
});
station("中央北", "track-5", { x: -920, y: 0 }, { x: -580, y: 0 }, false);
station("中央南", "track-6", { x: -420, y: 0 }, { x: -80, y: 0 }, false);
station("東環状", "track-8", { x: 580, y: 0 }, { x: 920, y: 0 }, false);
station("西環状", "track-3", { x: -1920, y: 0 }, { x: -1580, y: 0 }, false);
station("北新都心", "track-1", { x: -2920, y: 0 }, { x: -2580, y: 0 }, false);
station("空港", "track-10", { x: 1580, y: 0 }, { x: 1920, y: 0 }, false);
station("貨物ターミナル", "track-12", { x: 2580, y: 0 }, { x: 2920, y: 0 }, false);

const lines = [
  ["line-loop", "中央環状線", "CL", "#2563eb"],
  ["line-north", "北部線", "NB", "#16a34a"],
  ["line-airport", "空港線", "AP", "#ea580c"],
  ["line-freight", "臨港貨物線", "FR", "#64748b"],
] as const;
for (const [id, name, code, color] of lines) run({ type: "line.create", payload: { id, name, code, color } });

const systems = [
  ["sys-loop-local", "line-loop", "環状各停", "各停", "#60a5fa", 1],
  ["sys-loop-rapid", "line-loop", "環状快速", "快速", "#1d4ed8", 2],
  ["sys-north-local", "line-north", "北部各停", "各停", "#4ade80", 1],
  ["sys-north-through", "line-north", "環状直通", "直通", "#15803d", 2],
  ["sys-airport-rapid", "line-airport", "空港快速", "空快", "#fb923c", 1],
  ["sys-freight", "line-freight", "臨港貨物", "貨物", "#94a3b8", 1],
] as const;
for (const [id, lineId, name, shortName, color, displayOrder] of systems) run({
  type: "serviceSystem.create",
  payload: { id, lineId, name, shortName, color, description: `${name}の確認用系統`, displayOrder },
});

type StopInput = { stationId: string; trackId: string; commercialType: "stop" | "pass"; dwellSeconds?: number };
const createRoute = (id: string, name: string, directionName: string, stops: StopInput[]): void => run({
  type: "route.create", payload: { id, name, directionName, stops },
});
const stop = (stationId: string, trackId: string, commercialType: "stop" | "pass" = "stop", dwellSeconds = 30): StopInput => ({ stationId, trackId, commercialType, dwellSeconds });

createRoute("route-loop-east", "中央環状 東行", "外回り", [stop("station-1", "track-5"), stop("station-2", "track-6"), stop("station-3", "track-8")]);
createRoute("route-loop-west", "中央環状 西行", "内回り", [stop("station-3", "track-8"), stop("station-2", "track-6"), stop("station-1", "track-5")]);
createRoute("route-north-in", "北新都心・中央北", "上り", [stop("station-5", "track-1"), stop("station-4", "track-3"), stop("station-1", "track-5")]);
createRoute("route-north-out", "中央北・北新都心", "下り", [stop("station-1", "track-5"), stop("station-4", "track-3"), stop("station-5", "track-1")]);
createRoute("route-airport-out", "中央南・空港", "空港方面", [stop("station-2", "track-6"), stop("station-3", "track-8", "pass", 0), stop("station-6", "track-10")]);
createRoute("route-airport-in", "空港・中央南", "都心方面", [stop("station-6", "track-10"), stop("station-3", "track-8", "pass", 0), stop("station-2", "track-6")]);
createRoute("route-freight-out", "中央南・貨物ターミナル", "臨港方面", [stop("station-2", "track-6", "pass", 0), stop("station-6", "track-10", "pass", 0), stop("station-7", "track-12")]);
createRoute("route-freight-in", "貨物ターミナル・中央南", "都心方面", [stop("station-7", "track-12"), stop("station-6", "track-10", "pass", 0), stop("station-2", "track-6", "pass", 0)]);

const createOperation = (
  id: string,
  number: string,
  name: string,
  routeId: string,
  times: Array<{ arrivalTime?: string; departureTime?: string; dayOffset?: number }>,
  lineAssignments?: Array<{ lineId: string; serviceSystemId?: string }>,
  weekdays: number[] = [1, 2, 3, 4, 5],
): void => {
  const route = state.routes[routeId];
  if (!route || route.stops.length !== times.length) throw new Error(`運行 ${id} の経路・時刻数が不一致です`);
  run({ type: "operation.create", payload: {
    id, operationNumber: number, name, routeId, calendar: { weekdays }, lineAssignments,
    stopTimes: route.stops.map((routeStop, index) => ({ routeStopId: routeStop.id, dayOffset: times[index].dayOffset ?? 0, ...times[index] })),
  } });
};

createOperation("op-loop-101", "101", "環状東回り101", "route-loop-east", [
  { departureTime: "06:00:00" }, { arrivalTime: "06:18:00", departureTime: "06:19:00" }, { arrivalTime: "06:38:00" },
], [{ lineId: "line-loop", serviceSystemId: "sys-loop-local" }]);
createOperation("op-loop-102", "102", "環状西回り102", "route-loop-west", [
  { departureTime: "06:45:00" }, { arrivalTime: "07:03:00", departureTime: "07:04:00" }, { arrivalTime: "07:22:00" },
], [{ lineId: "line-loop", serviceSystemId: "sys-loop-local" }]);
createOperation("op-north-201", "201", "北部直通201", "route-north-in", [
  { departureTime: "07:10:00" }, { arrivalTime: "07:30:00", departureTime: "07:31:00" }, { arrivalTime: "07:52:00" },
], [{ lineId: "line-north", serviceSystemId: "sys-north-through" }, { lineId: "line-loop", serviceSystemId: "sys-loop-rapid" }]);
createOperation("op-north-202", "202", "北部各停202", "route-north-out", [
  { departureTime: "08:00:00" }, { arrivalTime: "08:20:00", departureTime: "08:21:00" }, { arrivalTime: "08:42:00" },
], [{ lineId: "line-north", serviceSystemId: "sys-north-local" }]);
createOperation("op-airport-301", "301", "空港快速301", "route-airport-out", [
  { departureTime: "09:00:00" }, { arrivalTime: "09:12:00", departureTime: "09:12:00" }, { arrivalTime: "09:24:00" },
], [{ lineId: "line-airport", serviceSystemId: "sys-airport-rapid" }, { lineId: "line-loop" }]);
createOperation("op-airport-302", "302", "空港快速302", "route-airport-in", [
  { departureTime: "09:35:00" }, { arrivalTime: "09:47:00", departureTime: "09:47:00" }, { arrivalTime: "09:59:00" },
], [{ lineId: "line-airport", serviceSystemId: "sys-airport-rapid" }, { lineId: "line-loop" }]);
createOperation("op-freight-501", "501", "臨港貨物501", "route-freight-out", [
  { departureTime: "22:40:00" }, { arrivalTime: "23:00:00", departureTime: "23:00:00" }, { arrivalTime: "23:15:00" },
], [{ lineId: "line-freight", serviceSystemId: "sys-freight" }], [1, 3, 5]);
createOperation("op-freight-502", "502", "臨港貨物502", "route-freight-in", [
  { departureTime: "23:30:00" }, { arrivalTime: "23:45:00", departureTime: "23:45:00" }, { arrivalTime: "00:05:00", dayOffset: 1 },
], [{ lineId: "line-freight", serviceSystemId: "sys-freight" }], [1, 3, 5]);
createOperation("op-unassigned-901", "901", "未所属耐久試験901", "route-loop-east", [
  { departureTime: "23:50:00" }, { arrivalTime: "12:00:00", departureTime: "12:10:00", dayOffset: 1 }, { arrivalTime: "01:30:00", dayOffset: 2 },
], undefined, [6]);

for (const name of ["環状01編成", "北部02編成", "空港03編成", "予備99編成"]) {
  run({ type: "fleet.formation-template.acquire", templateId: "test-passenger-3car", name });
}
const formation = (name: string) => state.fleet.formations.find((item) => item.name === name);
const loopFormation = formation("環状01編成");
const northFormation = formation("北部02編成");
const airportFormation = formation("空港03編成");
const spareFormation = formation("予備99編成");
if (!loopFormation || !northFormation || !airportFormation || !spareFormation) throw new Error("編成生成に失敗しました");

run({ type: "fleet.formation.place", formationId: loopFormation.id, stationId: "station-1", trackId: "track-5", distanceM: 250, orientation: "forward" });
run({ type: "fleet.formation.place", formationId: northFormation.id, stationId: "station-5", trackId: "track-1", distanceM: 250, orientation: "forward" });
run({ type: "fleet.formation.place", formationId: airportFormation.id, stationId: "station-2", trackId: "track-6", distanceM: 250, orientation: "forward" });
run({ type: "fleet.formation.place", formationId: spareFormation.id, stationId: "station-4", trackId: "track-3", distanceM: 250, orientation: "reversed" });

run({ type: "vehicleDuty.create", payload: {
  id: "duty-loop-a01", name: "環状A01運用", defaultFormationId: loopFormation.id,
  assignments: [
    { sequence: 1, operationId: "op-loop-101", serviceDayOffset: 0 },
    { sequence: 2, operationId: "op-loop-102", serviceDayOffset: 0 },
  ],
} });
run({ type: "vehicleDuty.create", payload: {
  id: "duty-airport-a03", name: "空港A03運用", defaultFormationId: airportFormation.id,
  assignments: [
    { sequence: 1, operationId: "op-airport-301", serviceDayOffset: 0 },
    { sequence: 2, operationId: "op-airport-302", serviceDayOffset: 0 },
  ],
} });
run({ type: "vehicleDuty.create", payload: {
  id: "duty-test-901", name: "複数日試験901運用",
  assignments: [{ sequence: 1, operationId: "op-unassigned-901", serviceDayOffset: 0 }],
} });
run({ type: "vehicleDutyExecution.replaceFormation", payload: {
  vehicleDutyId: "duty-loop-a01", serviceDate: "2026-08-23", formationId: spareFormation.id,
} });

state.clock.currentTimeMs = Date.UTC(2026, 7, 23, 5, 45, 0);
const save = createSaveFile("大規模運行計画レビューマップ", state);
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
  unassignedOperations: Object.values(state.operations).filter((operation) => !operation.lineAssignments?.length).length,
  vehicleDuties: Object.keys(state.vehicleDuties).length,
  formations: state.fleet.formations.length,
}, null, 2));
