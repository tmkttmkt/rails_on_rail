import type { StationStopPoint } from "./model";

export interface StationPartitionOptions {
  maximumAngleDegrees: number;
  maximumLateralDistanceM: number;
  minimumOverlapRatio: number;
}

/** 用途は推定せず、並行し長手方向が重なる停車範囲を線群へ分ける。 */
export function partitionStationStopPoints(points: StationStopPoint[], options: StationPartitionOptions): StationStopPoint[][] {
  const { maximumAngleDegrees, maximumLateralDistanceM, minimumOverlapRatio } = options;
  if (!Number.isFinite(maximumAngleDegrees) || maximumAngleDegrees < 0 || maximumAngleDegrees >= 90
    || !Number.isFinite(maximumLateralDistanceM) || maximumLateralDistanceM <= 0
    || !Number.isFinite(minimumOverlapRatio) || minimumOverlapRatio <= 0 || minimumOverlapRatio > 1) throw new Error("停車場分割の設定が不正です");
  const parent = points.map((_, i) => i);
  const root = (i: number): number => { while (parent[i] !== i) i = parent[i]; return i; };
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i].startPosition, b = points[i].endPosition;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length === 0) continue;
    const ux = (b.x - a.x) / length, uy = (b.y - a.y) / length;
    for (let j = 0; j < i; j += 1) {
      const c = points[j].startPosition, d = points[j].endPosition;
      const otherLength = Math.hypot(d.x - c.x, d.y - c.y);
      if (otherLength === 0) continue;
      const cosine = Math.abs(((d.x - c.x) * ux + (d.y - c.y) * uy) / otherLength);
      if (cosine < Math.cos(maximumAngleDegrees * Math.PI / 180)) continue;
      const from = (c.x - a.x) * ux + (c.y - a.y) * uy;
      const to = (d.x - a.x) * ux + (d.y - a.y) * uy;
      const overlap = Math.min(length, Math.max(from, to)) - Math.max(0, Math.min(from, to));
      const lateral = Math.abs((c.x + d.x - a.x - b.x) / 2 * uy - (c.y + d.y - a.y - b.y) / 2 * ux);
      if (lateral <= maximumLateralDistanceM && overlap >= Math.min(length, otherLength) * minimumOverlapRatio) parent[root(i)] = root(j);
    }
  }
  const groups = new Map<number, StationStopPoint[]>();
  points.forEach((point, i) => { const key = root(i); if (!groups.has(key)) groups.set(key, []); groups.get(key)!.push(point); });
  return [...groups.values()];
}
