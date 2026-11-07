import { parse } from "yaml";
import stablingYaml from "../../data/track/stabling.yaml?raw";
import { closestPointOnSegment, sampleTrack } from "./geometry";
import type { MapState, Point, Track } from "./model";

const settings = parse(stablingYaml) as { minimumTrackCenterSeparationM: number };
const clearanceM = settings.minimumTrackCenterSeparationM;
if (!Number.isFinite(clearanceM) || clearanceM <= 0) throw new Error("留置の必要線路間隔が不正です");

function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  const distances = [closestPointOnSegment(a, c, d).distance, closestPointOnSegment(b, c, d).distance,
    closestPointOnSegment(c, a, b).distance, closestPointOnSegment(d, a, b).distance];
  if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return 0;
  return Math.min(...distances);
}

export interface StablingSpan { startM: number; endM: number }

/** 分岐の支障区間を引いた線路上の範囲。境界の誤差は安全側へ最大0.25 m。 */
export function getUsableStablingSpans(state: MapState, track: Track, startM: number, endM: number): StablingSpan[] {
  const junctions = state.junctions.filter((j) => j.ports.some((p) => p.trackId === track.id)
    && (j.ports.length > 2 || j.ports.some((p) => p.location === "interior")));
  const otherIds = new Set(junctions.flatMap((j) => j.ports.map((p) => p.trackId)).filter((id) => id !== track.id));
  const blocked: StablingSpan[] = [];
  for (const j of junctions) for (const p of j.ports) if (p.trackId === track.id) {
    blocked.push({ startM: p.distanceM - 0.001, endM: p.distanceM + 0.001 });
  }
  const points = sampleTrack(track);
  for (const other of state.tracks.filter((t) => otherIds.has(t.id))) {
    const otherPoints = sampleTrack(other);
    let distanceM = 0;
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1], b = points[i];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      for (let k = 1; k < otherPoints.length; k += 1) {
        const c = otherPoints[k - 1], d = otherPoints[k];
        const visit = (u: Point, v: Point, from: number, to: number): void => {
          if (to < startM || from > endM || segmentDistance(u, v, c, d) >= clearanceM) return;
          if (to - from <= 0.25 || (closestPointOnSegment(u, c, d).distance < clearanceM && closestPointOnSegment(v, c, d).distance < clearanceM)) {
            blocked.push({ startM: from, endM: to });
            return;
          }
          const mid = { x: (u.x + v.x) / 2, y: (u.y + v.y) / 2 };
          visit(u, mid, from, (from + to) / 2);
          visit(mid, v, (from + to) / 2, to);
        };
        visit(a, b, distanceM, distanceM + length);
      }
      distanceM += length;
    }
  }
  const spans: StablingSpan[] = [];
  let cursor = startM;
  for (const cut of blocked.sort((a, b) => a.startM - b.startM)) {
    if (cut.endM <= cursor || cut.startM >= endM) continue;
    if (cut.startM > cursor) spans.push({ startM: cursor, endM: Math.min(endM, cut.startM) });
    cursor = Math.max(cursor, cut.endM);
    if (cursor >= endM) break;
  }
  if (cursor < endM) spans.push({ startM: cursor, endM });
  return spans;
}

/** 留置だけを検査する。走行時の分岐通過を禁止するものではない。 */
export function assertStablingClearOfJunctions(state: MapState, track: Track, startM: number, endM: number): void {
  const junctions = state.junctions.filter((junction) => junction.ports.some((port) => port.trackId === track.id)
    && (junction.ports.length > 2 || junction.ports.some((port) => port.location === "interior")));
  for (const junction of junctions) {
    if (junction.ports.some((port) => port.trackId === track.id && startM <= port.distanceM && port.distanceM <= endM)) {
      throw new Error(`分岐 ${junction.id} をまたぐ範囲には留置できません`);
    }
  }
  const otherIds = new Set(junctions.flatMap((junction) => junction.ports.map((port) => port.trackId)).filter((id) => id !== track.id));
  if (otherIds.size === 0) return;
  const occupied: [Point, Point][] = [];
  const points = sampleTrack(track);
  let distanceM = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1], b = points[i];
    const lengthM = Math.hypot(b.x - a.x, b.y - a.y);
    const from = Math.max(startM, distanceM), to = Math.min(endM, distanceM + lengthM);
    if (lengthM > 0 && from <= to) {
      const at = (m: number): Point => ({ x: a.x + (b.x - a.x) * (m - distanceM) / lengthM, y: a.y + (b.y - a.y) * (m - distanceM) / lengthM });
      occupied.push([at(from), at(to)]);
    }
    distanceM += lengthM;
  }
  for (const other of state.tracks.filter((candidate) => otherIds.has(candidate.id))) {
    const otherPoints = sampleTrack(other);
    for (const [a, b] of occupied) {
      for (let i = 1; i < otherPoints.length; i += 1) {
        if (segmentDistance(a, b, otherPoints[i - 1], otherPoints[i]) < clearanceM) {
          throw new Error(`分岐付近の留置禁止区間です（線路 ${other.id} との必要間隔 ${clearanceM} m）`);
        }
      }
    }
  }
}
