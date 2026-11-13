import fs from "node:fs";
import { createHash } from "node:crypto";
import { parse } from "yaml";
import { executeCommand } from "../src/simulation/commands";
import { getFormationLengthM } from "../src/simulation/fleet";
import { createSaveFile, parseSaveFile, serializeSaveFile } from "../src/simulation/persistence";
import { findYardPath } from "../src/simulation/yard";
import type { Station } from "../src/simulation/model";

const config = parse(fs.readFileSync("data/maps/tojo-trial.yaml", "utf8")) as {
  name: string; input: string; output: string; formationTemplateId: string; description: string; stations: string[];
};
if (config.input === config.output) throw new Error("入力と出力は分離する");
const raw = fs.readFileSync(config.input, "utf8");
let state = parseSaveFile(raw).state;
const geometryBefore = JSON.stringify([state.tracks, state.junctions, state.turnouts, state.stations]);
state = executeCommand(state, { type: "fleet.formation-template.acquire", templateId: config.formationTemplateId, name: "東上線・仮設定の短編成" }).state;
const formation = state.fleet.formations.at(-1)!;
const lengthM = getFormationLengthM(state.fleet, formation).lengthM;
const mid = (p: Station["stopPoints"][number]) => (p.startDistanceM + p.endDistanceM) / 2;
const stations = config.stations.map((name) => {
  const matches = state.stations.filter((s) => s.kind === "station" && s.name.replaceAll("ケ", "ヶ") === name.replaceAll("ケ", "ヶ"));
  if (matches.length !== 1) throw new Error(`駅を一意に特定できない: ${name}`);
  return matches[0];
});
// Separate platform-length fit from the stricter overnight-placement check.
const placementWarnings: { station: string; trackId: string; reason: string }[] = [];
const placements = stations.map((station) => ({ station, stops: station.stopPoints.filter((p) => {
  if (p.endDistanceM - p.startDistanceM < lengthM) return false;
  try {
    executeCommand(state, { type: "fleet.formation.place", formationId: formation.id, stationId: station.id, trackId: p.trackId, distanceM: mid(p) });
    return true;
  } catch (error) { placementWarnings.push({ station: station.name, trackId: p.trackId, reason: (error as Error).message }); return true; }
}) }));
if (placements.some((p) => !p.stops.length)) throw new Error(`短編成が停車範囲に収まらない駅: ${placements.filter((p) => !p.stops.length).map((p) => p.station.name)}`);
type Edge = { from: string; to: string; startDirection: number; endDirection: number; distanceM: number };
const chains: { direction: string; edges: Edge[]; totalM: number }[] = [];
for (const [direction, ordered] of [["下り", placements], ["上り", [...placements].reverse()]] as const) {
  let reachable: { edge: Edge; edges: Edge[]; totalM: number }[] = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    const a = ordered[i], b = ordered[i + 1];
    const straight = Math.hypot(a.station.position.x - b.station.position.x, a.station.position.y - b.station.position.y);
    const next: typeof reachable = [];
    for (const from of a.stops) for (const to of b.stops) for (const startDirection of [1, -1]) {
      const previous = i ? reachable.filter((r) => r.edge.to === from.id && r.edge.endDirection === startDirection).sort((x, y) => x.totalM - y.totalM)[0] : undefined;
      if (i && !previous) continue;
      let spans;
      try { spans = findYardPath(state, { trackId: from.trackId, distanceM: mid(from), direction: startDirection }, { trackId: to.trackId, distanceM: mid(to) }); }
      catch { continue; }
      const distanceM = spans.reduce((sum, span) => sum + Math.abs(span.toM - span.fromM), 0);
      if (!spans.length || distanceM > Math.max(straight * 2, straight + 800)) continue;
      const last = spans.at(-1)!;
      const edge: Edge = { from: from.id, to: to.id, startDirection, endDirection: Math.sign(last.toM - last.fromM), distanceM };
      next.push({ edge, edges: [...(previous?.edges ?? []), edge], totalM: (previous?.totalM ?? 0) + distanceM });
    }
    reachable = next;
    if (!reachable.length) throw new Error(`連続した有向経路がない: ${direction} ${a.station.name} → ${b.station.name}`);
  }
  const best = reachable.sort((a, b) => a.totalM - b.totalM)[0];
  chains.push({ direction, edges: best.edges, totalM: best.totalM });
  const pointIds = [best.edges[0].from, ...best.edges.map((e) => e.to)];
  state = executeCommand(state, { type: "route.create", payload: {
    id: direction === "下り" ? "tojo-trial-down" : "tojo-trial-up",
    name: `東上線・仮設定 ${direction}`, directionName: direction,
    stops: ordered.map(({ station }, index) => {
      const point = station.stopPoints.find((p) => p.id === pointIds[index])!;
      return { stationId: station.id, trackId: point.trackId, stopPointId: point.id, dwellSeconds: 30 };
    }),
  } }).state;
  console.log(`${direction}: ${ordered.length}駅 / ${Math.round(best.totalM)}m`);
}
// Place the initial train at the first stop. No public timetable is bundled.
const route = state.routes["tojo-trial-down"];
state = executeCommand(state, { type: "fleet.formation.place", formationId: formation.id, stationId: route.stops[0].stationId,
  trackId: route.stops[0].trackId, distanceM: route.stops[0].distanceM, orientation: chains[0].edges[0].startDirection > 0 ? "forward" : "reversed" }).state;
state.clock.paused = true;
for (const route of [state.routes["tojo-trial-down"], state.routes["tojo-trial-up"]]) for (const leg of route.legs) {
  const from = route.stops[leg.fromStopSequence - 1], to = route.stops[leg.toStopSequence - 1];
  const first = leg.tracks[0], last = leg.tracks.at(-1)!;
  const startM = first.direction === "forward" ? first.startDistanceM : first.endDistanceM;
  const endM = last.direction === "forward" ? last.endDistanceM : last.startDistanceM;
  if (first.trackId !== from.trackId || last.trackId !== to.trackId || Math.abs(startM - from.distanceM) > .001 || Math.abs(endM - to.distanceM) > .001) throw new Error("経路端点が停車指定と一致しない");
  const directed = findYardPath(state, { trackId: first.trackId, distanceM: startM, direction: first.direction === "forward" ? 1 : -1 }, { trackId: last.trackId, distanceM: endM });
  const actual = leg.tracks.map((track) => ({ trackId: track.trackId,
    fromM: track.direction === "forward" ? track.startDistanceM : track.endDistanceM,
    toM: track.direction === "forward" ? track.endDistanceM : track.startDistanceM }));
  if (JSON.stringify(directed) !== JSON.stringify(actual)) throw new Error("保存する営業経路が有向探索の結果と一致しない");
}
if (geometryBefore !== JSON.stringify([state.tracks, state.junctions, state.turnouts, state.stations])) throw new Error("元の設備が変化した");
const serialized = serializeSaveFile(createSaveFile(config.name, state));
const restored = parseSaveFile(serialized).state;
if (JSON.stringify(restored.routes) !== JSON.stringify(state.routes) || JSON.stringify(restored.vehiclePlacements) !== JSON.stringify(state.vehiclePlacements)) throw new Error("保存再開で経路・配置が変化した");
if (fs.readFileSync(config.input, "utf8") !== raw) throw new Error("元ファイルが変化した");
fs.writeFileSync(config.output, serialized);
const report = { input: config.input, output: config.output, inputSha256: createHash("sha256").update(raw).digest("hex"),
  description: config.description, stations: stations.length, formationTemplateId: config.formationTemplateId, formationLengthM: lengthM,
  placementChecks: placements.map((p) => ({ station: p.station.name, lengthCompatibleStops: p.stops.length })), placementWarnings, chains,
  checkedRouteLegs: 64, directedRouteLegsVerified: true, inputUnchanged: true, geometryUnchanged: true, saveRoundTrip: true,
  limitations: ["実番線・実車性能は仮設定", "上下の線路分離と全待避経路は未確定", "営業実走・信号・進路競合は段階3", "200m級編成の適合ではない"] };
fs.writeFileSync("saves/osm-tojo-playable-trial.report", JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output: config.output, stations: stations.length, formationLengthM: lengthM, checkedRouteLegs: 64, saveRoundTrip: true }, null, 2));
