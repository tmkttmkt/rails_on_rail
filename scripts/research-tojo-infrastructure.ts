/** Read-only audit: does not repair or save a game map. */
import fs from "node:fs";
import { createHash } from "node:crypto";
import { parseSaveFile } from "../src/simulation/persistence";
import { findYardPath } from "../src/simulation/yard";
import { findPhysicalRouteBetweenStops } from "../src/simulation/pathfinding";
import type { Station } from "../src/simulation/model";

const input = "saves/osm-tobu-tojo-areas.json";
const raw = fs.readFileSync(input, "utf8");
const state = parseSaveFile(raw).state;
const before = JSON.stringify(state);
const names: string[] = JSON.parse(fs.readFileSync("saves/research-tojo-holiday-summary.json", "utf8")).stations;
const stations = names.map((name) => {
  const found = state.stations.filter((s) => s.kind === "station" && s.name.replaceAll("ケ", "ヶ") === name.replaceAll("ケ", "ヶ"));
  if (found.length !== 1) throw new Error(`Station match not unique: ${name}`);
  return found[0];
});
const mid = (p: Station["stopPoints"][number]) => (p.startDistanceM + p.endDistanceM) / 2;
const stationRows = stations.map((s) => ({
  name: s.name, id: s.id,
  platforms: s.stopPoints.map((p) => ({ id: p.id, trackId: p.trackId, midpointM: mid(p), lengthM: p.endDistanceM - p.startDistanceM, fits200mByLength: p.endDistanceM - p.startDistanceM >= 200, direction: p.direction })),
}));
type Edge = { from: string; to: string; startDirection: number; endDirection: number; distanceM: number; tracks: string[] };
const pairs: { from: string; to: string; direction: string; straightDistanceM: number; candidates: Edge[]; rejectedDetours: number }[] = [];
for (const [direction, ordered] of [["down", stations], ["up", [...stations].reverse()]] as const) {
  for (let i = 0; i < ordered.length - 1; i++) {
    const a = ordered[i], b = ordered[i + 1];
    const straightDistanceM = Math.hypot(b.position.x - a.position.x, b.position.y - a.position.y);
    const candidates: Edge[] = [];
    let rejectedDetours = 0;
    for (const from of a.stopPoints) for (const to of b.stopPoints) for (const startDirection of [1, -1]) {
      try {
        const spans = findYardPath(state, { trackId: from.trackId, distanceM: mid(from), direction: startDirection }, { trackId: to.trackId, distanceM: mid(to) });
        const distanceM = spans.reduce((n, s) => n + Math.abs(s.toM - s.fromM), 0);
        // A research heuristic; excludes loops, not a real operating regulation.
        if (distanceM > Math.max(straightDistanceM * 2, straightDistanceM + 800)) { rejectedDetours++; continue; }
        const last = spans.at(-1);
        if (!last) continue;
        candidates.push({ from: from.id, to: to.id, startDirection, endDirection: Math.sign(last.toM - last.fromM), distanceM, tracks: spans.map((s) => s.trackId) });
      } catch { /* No directed route for this platform and orientation. */ }
    }
    pairs.push({ from: a.name, to: b.name, direction, straightDistanceM, candidates, rejectedDetours });
    if (i % 8 === 0) console.log(`${direction}: ${i + 1}/${ordered.length - 1} pairs`);
  }
}
// Maintain the same platform and travel orientation across adjacent legs.
const chains = ["down", "up"].map((direction) => {
  const legs = pairs.filter((p) => p.direction === direction);
  let reachable = legs[0].candidates.map((e) => ({ ...e, sequence: [e], totalM: e.distanceM }));
  let failedAt: string | undefined;
  for (const leg of legs.slice(1)) {
    const next: typeof reachable = [];
    for (const edge of leg.candidates) {
      const previous = reachable.filter((r) => r.to === edge.from && r.endDirection === edge.startDirection).sort((a, b) => a.totalM - b.totalM)[0];
      if (previous) next.push({ ...edge, sequence: [...previous.sequence, edge], totalM: previous.totalM + edge.distanceM });
    }
    reachable = next;
    if (!reachable.length) { failedAt = `${leg.from} -> ${leg.to}`; break; }
  }
  const shortest = reachable.sort((a, b) => a.totalM - b.totalM)[0];
  return { direction, found: !!shortest, failedAt, shortestDistanceM: shortest?.totalM, sequence: shortest?.sequence };
});
const facilities = state.stations.filter((s) => s.kind !== "station").map((s) => ({
  id: s.id, name: s.name, kind: s.kind,
  ranges: s.stopPoints.map((p) => ({ id: p.id, trackId: p.trackId, startM: p.startDistanceM, endM: p.endDistanceM, lengthM: p.endDistanceM - p.startDistanceM })),
}));
// Demonstrate whether the current public route helper respects track constraints.
const a = stations[0], b = stations[1];
const helperChecks = a.stopPoints.map((p) => {
  const path = findPhysicalRouteBetweenStops(state, { stationId: a.id, trackId: p.trackId, distanceM: mid(p) }, { stationId: b.id, trackId: b.stopPoints[0].trackId, distanceM: mid(b.stopPoints[0]) });
  return { requestedTrackId: p.trackId, actualFirstTrackId: path.tracks[0]?.trackId, honored: path.tracks[0]?.trackId === p.trackId };
});
if (JSON.stringify(state) !== before || fs.readFileSync(input, "utf8") !== raw) throw new Error("Input state changed");
const result = {
  input, sha256: createHash("sha256").update(raw).digest("hex"), date: "2026-11-10",
  limitations: ["Directed geometric candidates only; real track numbers and running directions not verified", "No train length, turnout locking, traffic conflicts or actual running tested", "Detours exceeding max(2*straightDistance, straightDistance+800m) filtered by research heuristic", "Length-only stabling capacity is not a fleet placement or ingress/egress test"],
  stations: stationRows, pairs, chains, facilities, helperChecks, inputUnchanged: true,
};
fs.writeFileSync("saves/research-tojo-infrastructure.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify({ stations: stationRows.length, stopRanges: stationRows.reduce((n, s) => n + s.platforms.length, 0), missingPairs: pairs.filter((p) => !p.candidates.length).map((p) => [p.direction, p.from, p.to]), chains: chains.map(({ sequence: _sequence, ...rest }) => rest), helperChecks, facilities: facilities.length }, null, 2));
