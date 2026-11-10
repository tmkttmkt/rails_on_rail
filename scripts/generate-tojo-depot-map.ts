import fs from "node:fs";
import { createHash } from "node:crypto";
import { parse } from "yaml";
import { createSaveFile, parseSaveFile, serializeSaveFile } from "../src/simulation/persistence";
import { inspectTrackRadii } from "../src/simulation/inspection";
import { analyzeLine, sampleTrack } from "../src/simulation/geometry";
import { getUsableStablingSpans, assertStablingClearOfJunctions } from "../src/simulation/stabling";
import { findYardPath, yardPoint } from "../src/simulation/yard";
import type { Station, StationKind } from "../src/simulation/model";

interface Facility { name: string; station: string; kind: StationKind; tracks?: number[]; trackRange?: [number, number]; retainWithoutRoute?: boolean }
interface PassengerTrackOverride { station: string; keep: number[]; remove: number[]; reason: string }
const config = parse(fs.readFileSync("data/maps/tojo-depots.yaml", "utf8")) as { formatVersion: number; source: string; sourceSha256: string; output: string; mainTrack: string; anchor: { stationName: string; x: number; y: number }; stations: string[]; passengerTrackOverrides: PassengerTrackOverride[]; facilities: Facility[] };
if (config.formatVersion !== 1 || config.source === config.output) throw new Error("地図設定が不正");
const source = fs.readFileSync(config.source, "utf8"), state = parseSaveFile(source).state;
if (createHash("sha256").update(source).digest("hex") !== config.sourceSha256) throw new Error("旅客線路補正の対象スナップショットが違う");
const anchor = state.stations.find((s) => s.name === config.anchor.stationName);
if (!anchor || Math.hypot(anchor.position.x - config.anchor.x, anchor.position.y - config.anchor.y) > 1) throw new Error("対象OSMスナップショットが違う");
if (state.vehiclePlacements.length || state.operatingTrains.length || state.yard || Object.keys(state.routes).length) throw new Error("運転前の原マップを使う");
const geometry = new Map(state.tracks.map((t) => [t.id, JSON.stringify(t.points)]));
const topology = inspectTrackRadii(state).topology;
const connected = topology.connectedComponents.find((c) => c.includes(config.mainTrack));
if (!connected) throw new Error("東上線本線がない");
const keep = new Set(connected);
state.tracks = state.tracks.filter((t) => keep.has(t.id));
state.junctions = state.junctions.flatMap((j) => {
  const ports = j.ports.filter((p) => keep.has(p.trackId));
  return ports.length > 1 ? [{ ...j, ports }] : [];
});
const junctions = new Set(state.junctions.map((j) => j.id));
state.turnouts = state.turnouts.filter((t) => junctions.has(t.junctionId) && keep.has(t.throughTrackId) && keep.has(t.divergingTrackId));
state.trackGroups = state.trackGroups.flatMap((g) => { const trackIds = g.trackIds.filter((id) => keep.has(id)); return trackIds.length > 1 ? [{ ...g, trackIds }] : []; });
for (const track of state.tracks) {
  track.specification.gaugeId = "gauge-1067mm";
  // レール断面は現地確証がないため元取込設定を保持する。
  if (track.startConnection && !junctions.has(track.startConnection.junctionId!)) track.startConnection = undefined;
  if (track.endConnection && !junctions.has(track.endConnection.junctionId!)) track.endConnection = undefined;
}
state.stations = state.stations.filter((s) => s.kind === "station" && config.stations.includes(s.name)).map((s) => ({ ...s, stopPoints: s.stopPoints.filter((p) => keep.has(p.trackId)) }));
for (const name of config.stations) if (!state.stations.some((s) => s.name === name && s.stopPoints.length)) throw new Error(`旅客駅が欠落: ${name}`);
// 本数で自動選別せず、OSMホーム・事業者タグと公式構内図を照合した線路だけを残す。
const passengerCorrections = [];
const correctedNames = new Set<string>();
for (const correction of config.passengerTrackOverrides) {
  const station = state.stations.find((s) => s.name === correction.station)!;
  if (!station || correctedNames.has(station.name)) throw new Error(`旅客補正駅が不正: ${correction.station}`);
  correctedNames.add(station.name);
  const expected = [...correction.keep, ...correction.remove].map((n) => `track-${n}`);
  if (new Set(expected).size !== expected.length || expected.length !== station.stopPoints.length || station.stopPoints.some((p) => !expected.includes(p.trackId))) throw new Error(`補正前の線路構成が違う: ${station.name}`);
  const retained = new Set(correction.keep.map((n) => `track-${n}`));
  station.stopPoints = station.stopPoints.filter((p) => retained.has(p.trackId));
  passengerCorrections.push({ ...correction, before: expected.length, after: station.stopPoints.length });
}
const references = JSON.parse(fs.readFileSync("data/maps/tojo-platform-reference.json", "utf8")).stations as { name: string; passengerTrackCount: number }[];
if (references.length !== config.stations.length || new Set(references.map((r) => r.name)).size !== references.length) throw new Error("旅客駅の照合基準が不正");
for (const station of state.stations) {
  if (references.find((r) => r.name === station.name)?.passengerTrackCount !== station.stopPoints.length) throw new Error(`公式図と旅客線路数が不一致: ${station.name}`);
}
const assigned = new Set<string>();
const reports: unknown[] = [];
for (const facility of config.facilities) {
  if (facility.retainWithoutRoute && !facility.name.includes("経路未確認")) throw new Error("経路未確認施設は表示名へ明示する");
  const id = `station-${state.nextStationId++}`, stopPoints: Station["stopPoints"] = [];
  const ids = facility.tracks ?? Array.from({ length: facility.trackRange![1] - facility.trackRange![0] + 1 }, (_, i) => facility.trackRange![0] + i);
  const skipped: { trackId: string; reason: string }[] = [];
  for (const n of ids) {
    const trackId = `track-${n}`, track = state.tracks.find((t) => t.id === trackId);
    if (!track || track.kind !== "side") { skipped.push({ trackId, reason: "本線接続成分の側線ではない" }); continue; }
    if (assigned.has(trackId)) throw new Error(`施設所属重複: ${trackId}`);
    let spans = getUsableStablingSpans(state, track, 0, analyzeLine(sampleTrack(track)).lengthM);
    // ホームと留置範囲の二重登録を避ける。
    for (const p of state.stations.filter((s) => s.kind === "station").flatMap((s) => s.stopPoints).filter((p) => p.trackId === trackId)) {
      spans = spans.flatMap((s) => [{ startM: s.startM, endM: Math.min(s.endM, p.startDistanceM - 5) }, { startM: Math.max(s.startM, p.endDistanceM + 5), endM: s.endM }].filter((a) => a.endM > a.startM));
    }
    spans = spans.filter((s) => s.endM - s.startM >= 40);
    if (!spans.length) { skipped.push({ trackId, reason: "ホーム・分岐支障を除くと40 m未満" }); continue; }
    assigned.add(trackId);
    for (const s of spans) {
      assertStablingClearOfJunctions(state, track, s.startM + 0.01, s.endM - 0.01);
      stopPoints.push({ id: `${id}-sp-${stopPoints.length + 1}`, trackId, startDistanceM: s.startM, endDistanceM: s.endM, startPosition: yardPoint(state, trackId, s.startM), endPosition: yardPoint(state, trackId, s.endM), direction: "both" });
    }
  }
  if (!stopPoints.length) { reports.push({ name: facility.name, omitted: true, skipped }); continue; }
  const centers = stopPoints.map((p) => yardPoint(state, p.trackId, (p.startDistanceM + p.endDistanceM) / 2));
  state.stations.push({ id, name: facility.name, kind: facility.kind, stopPoints, position: { x: centers.reduce((a, p) => a + p.x, 0) / centers.length, y: centers.reduce((a, p) => a + p.y, 0) / centers.length } });
  const station = state.stations.find((s) => s.name === facility.station)!;
  let reachable = 0, viaReversal = 0;
  const unavailable: string[] = [];
  for (const p of stopPoints) {
    let found = false;
    for (const from of station.stopPoints) for (const direction of [1, -1]) {
      if (found) continue;
      try { findYardPath(state, { trackId: from.trackId, distanceM: (from.startDistanceM + from.endDistanceM) / 2, direction }, { trackId: p.trackId, distanceM: (p.startDistanceM + p.endDistanceM) / 2 }); found = true; } catch { /* 別のホーム・向きも検査 */ }
    }
    if (!found) {
      // 車庫によってはホームから引上げ線へ進んで反転しないと入れない。
      const shunts = state.tracks.filter((t) => t.kind === "side" && t.points.some((p) => Math.hypot(p.x - station.position.x, p.y - station.position.y) < 1800)).flatMap((t) => getUsableStablingSpans(state, t, 0, analyzeLine(sampleTrack(t)).lengthM).filter((s) => s.endM - s.startM >= 80).map((s) => ({ trackId: t.id, startDistanceM: s.startM, endDistanceM: s.endM })));
      search: for (const shunt of shunts) for (const from of station.stopPoints) for (const direction of [1, -1]) {
        try {
          const first = findYardPath(state, { trackId: from.trackId, distanceM: (from.startDistanceM + from.endDistanceM) / 2, direction }, { trackId: shunt.trackId, distanceM: (shunt.startDistanceM + shunt.endDistanceM) / 2 });
          const last = first.at(-1); if (!last) continue;
          findYardPath(state, { trackId: shunt.trackId, distanceM: last.toM, direction: -Math.sign(last.toM - last.fromM) }, { trackId: p.trackId, distanceM: (p.startDistanceM + p.endDistanceM) / 2 });
          found = true; viaReversal++; break search;
        } catch { /* この引上げ位置からは到達できない */ }
      }
    }
    if (found) reachable++; else unavailable.push(p.id);
  }
  const excludedForRoute = stopPoints.filter((p) => unavailable.includes(p.id)).map((p) => ({ trackId: p.trackId, startM: p.startDistanceM, endM: p.endDistanceM, reason: "近隣ホームから反転1回以内の経路を確認できない" }));
  // 既存施設の幾何は残す場合も、到達確認済みとは扱わない。表示名にも未確認を明示する。
  if (!facility.retainWithoutRoute) for (let i = stopPoints.length - 1; i >= 0; i--) if (unavailable.includes(stopPoints[i].id)) stopPoints.splice(i, 1);
  if (!stopPoints.length) throw new Error(`${facility.name}: 入出庫経路を持つ留置範囲がない`);
  const lengths = stopPoints.map((p) => p.endDistanceM - p.startDistanceM);
  reports.push({ name: facility.name, tracks: new Set(stopPoints.map((p) => p.trackId)).size, ranges: lengths.length, suitable200m: lengths.filter((n) => n >= 200).length, suitable80m: lengths.filter((n) => n >= 80).length, minimumM: Math.round(Math.min(...lengths)), maximumM: Math.round(Math.max(...lengths)), reachable, viaReversal, excludedForRoute: facility.retainWithoutRoute ? [] : excludedForRoute, retainedWithoutRoute: facility.retainWithoutRoute ? excludedForRoute : [], skipped });
}
if (state.tracks.some((t) => JSON.stringify(t.points) !== geometry.get(t.id))) throw new Error("元の線形が変わった");
const finalTopology = inspectTrackRadii(state).topology;
if (finalTopology.invalidConnections.length) throw new Error("不正接続がある");
state.clock.paused = true;
const save = createSaveFile("東武東上線・越生線｜車庫・留置線（OSM）", state);
const serialized = serializeSaveFile(save);
parseSaveFile(serialized);
fs.writeFileSync(config.output, serialized);
const report = { source: config.source, sourceSha256: createHash("sha256").update(source).digest("hex"), output: config.output, tracks: state.tracks.length, passengerStations: config.stations.length, passengerCorrections, components: finalTopology.connectedComponents.map((c) => c.length), facilities: reports };
fs.writeFileSync("saves/osm-tojo-depots.report", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
