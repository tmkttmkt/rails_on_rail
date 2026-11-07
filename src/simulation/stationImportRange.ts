import type { StablingSpan } from "./stabling";
import { closestPointOnSegment, sampleTrack } from "./geometry";
import type { MapState, Point, StationStopPoint, Track } from "./model";

export function projectStationOnTrack(track: Track, target: Point): { distanceM: number; alongM: number; totalM: number; pointAt: (m: number) => Point } {
  const points = sampleTrack(track);
  const distances = [0];
  let distanceM = Infinity, alongM = 0;
  for (let i = 1; i < points.length; i += 1) {
    const startM = distances[i - 1];
    distances.push(startM + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
    const hit = closestPointOnSegment(target, points[i - 1], points[i]);
    if (hit.distance < distanceM) {
      distanceM = hit.distance;
      alongM = startM + Math.hypot(hit.point.x - points[i - 1].x, hit.point.y - points[i - 1].y);
    }
  }
  const pointAt = (m: number): Point => {
    for (let i = 1; i < points.length; i += 1) if (m <= distances[i]) {
      const length = distances[i] - distances[i - 1];
      const ratio = length ? Math.max(0, (m - distances[i - 1]) / length) : 0;
      return { x: points[i - 1].x + (points[i].x - points[i - 1].x) * ratio, y: points[i - 1].y + (points[i].y - points[i - 1].y) * ratio };
    }
    return points[points.length - 1];
  };
  return { distanceM, alongM, totalM: distances[distances.length - 1], pointAt };
}

/** 元の駅座標から既知の誤生成範囲を復元する。遠い線路・支障区間は省略する。 */
export function restoreStationStopPoint(state: MapState, point: StationStopPoint, target: Point): StationStopPoint | undefined {
  const track = state.tracks.find((t) => t.id === point.trackId);
  if (!track) throw new Error("復元対象の線路がない");
  const hit = projectStationOnTrack(track, target);
  if (hit.distanceM > 150) return undefined;
  const span = getStationImportRange(state, track, hit.alongM, hit.totalM, 90);
  if (!span) return undefined;
  return { ...point, startDistanceM: span.startM, endDistanceM: span.endM,
    startPosition: hit.pointAt(span.startM), endPosition: hit.pointAt(span.endM) };
}

/** 旅客駅は留置用の隣接線間隔や曲率で除外せず、実際の接続点間で範囲を切る。 */
export function getStationImportRange(state: MapState, track: Track, alongM: number, totalM: number, halfLengthM: number): StablingSpan | undefined {
  let startM = 0, endM = totalM;
  for (const junction of state.junctions) {
    for (const port of junction.ports) {
      if (port.trackId !== track.id) continue;
      // 継目はホーム区間を分割しない。
      if (junction.ports.length <= 2 && junction.ports.every((p) => p.location !== "interior")) continue;
      if (Math.abs(port.distanceM - alongM) < 0.001) return undefined;
      if (port.distanceM < alongM) startM = Math.max(startM, port.distanceM + 0.001);
      else endM = Math.min(endM, port.distanceM - 0.001);
    }
  }
  return selectStationImportRange([{ startM, endM }], alongM, halfLengthM);
}

/** 駅位置を含む区間だけを使う。離れた最長区間へ駅を移動させない。 */
export function selectStationImportRange(spans: StablingSpan[], alongM: number, halfLengthM: number): StablingSpan | undefined {
  if (!Number.isFinite(alongM) || !Number.isFinite(halfLengthM) || halfLengthM <= 0) return undefined;
  const candidates = spans.filter((span) => span.startM <= alongM && alongM <= span.endM)
    .map((span) => ({ startM: Math.max(span.startM, alongM - halfLengthM), endM: Math.min(span.endM, alongM + halfLengthM) }))
    .filter((span) => span.endM - span.startM >= 2);
  return candidates.sort((a, b) => (b.endM - b.startM) - (a.endM - a.startM))[0];
}
