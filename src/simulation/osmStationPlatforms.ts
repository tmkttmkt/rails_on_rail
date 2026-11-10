import { closestPointOnSegment } from "./geometry";
import type { Point } from "./model";

export interface OsmRailSection { points: Point[]; operator?: string; service?: string }
export interface OsmPlatform { id: string; points: Point[]; operator?: string }
export interface OsmPassengerTrack { id: string; points: Point[]; sections: OsmRailSection[] }
export interface PlatformMatch { trackId: string; platformIds: string[]; startM: number; endM: number }
export const MIN_PASSENGER_IMPORT_LENGTH_M = 20;
const STEP_M = 5;
const EDGE_DISTANCE_M = 8;

function segments(points: Point[]) {
  let along = 0;
  return points.slice(1).map((b, i) => {
    const a = points[i], length = Math.hypot(b.x - a.x, b.y - a.y);
    const segment = { a, b, length, along };
    along += length;
    return segment;
  }).filter((s) => s.length > 0);
}
function project(parts: ReturnType<typeof segments>, point: Point) {
  let best = { distance: Infinity, along: 0, point, dx: 0, dy: 0 };
  for (const s of parts) {
    const hit = closestPointOnSegment(point, s.a, s.b);
    if (hit.distance < best.distance) best = { distance: hit.distance, along: s.along + Math.hypot(hit.point.x - s.a.x, hit.point.y - s.a.y), point: hit.point, dx: (s.b.x - s.a.x) / s.length, dy: (s.b.y - s.a.y) / s.length };
  }
  return best;
}
function compatible(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false; // 事業者不明を一致と推定しない。
  const values = (v: string) => v.split(";").map((s) => s.normalize("NFKC").trim()).filter(Boolean);
  return values(a).some((v) => values(b).includes(v));
}
function inside(point: Point, polygon: Point[]): boolean {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

/** ホーム縁の各局所区間で最寄りの平行線路のみ採用する。駅ノード最寄り線の特例・近傍全線への代用はしない。 */
export function matchStationPlatforms(target: Point, operator: string, tracks: OsmPassengerTrack[], platforms: OsmPlatform[]): { matches: PlatformMatch[]; warnings: string[] } {
  const warnings = new Set<string>();
  if (!operator) return { matches: [], warnings: ["station-operator-missing"] };
  const prepared = tracks.map((t) => ({ ...t, parts: segments(t.points), sections: t.sections.map((s) => ({ ...s, parts: segments(s.points) })) }));
  const samples = new Map<string, { along: number; platformId: string }[]>();
  const expectedLengths = new Map<string, number>();
  let localPlatforms = 0;
  for (const platform of platforms) {
    const boundary = segments(platform.points);
    if (project(boundary, target).distance > 250) continue;
    if (platform.operator && !compatible(operator, platform.operator)) continue;
    localPlatforms++;
    const xs = platform.points.map((p) => p.x), ys = platform.points.map((p) => p.y);
    const extent = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    for (const track of prepared) {
      const distances = platform.points.map((p) => project(track.parts, p).along);
      expectedLengths.set(`${track.id}:${platform.id}`, Math.max(extent, Math.max(...distances) - Math.min(...distances)));
    }
    const first = platform.points[0], last = platform.points.at(-1)!;
    const closed = platform.points.length >= 4 && Math.hypot(first.x - last.x, first.y - last.y) < 0.1;
    for (const edge of boundary) {
      const count = Math.max(1, Math.ceil(edge.length / STEP_M));
      for (let i = 0; i <= count; i++) {
        const point = { x: edge.a.x + (edge.b.x - edge.a.x) * i / count, y: edge.a.y + (edge.b.y - edge.a.y) * i / count };
        const candidates: { id: string; distance: number; along: number; side: number; eligible: boolean }[] = [];
        for (const track of prepared) {
          const hit = project(track.parts, point);
          if (hit.distance > EDGE_DISTANCE_M || Math.abs(hit.dx * (edge.b.x - edge.a.x) / edge.length + hit.dy * (edge.b.y - edge.a.y) / edge.length) < 0.94) continue;
          if (closed && inside(hit.point, platform.points)) continue;
          // 通し線路全体の多数決ではなく、ホーム位置に対応する元wayの属性を見る。
          const section = track.sections.map((s) => ({ ...s, distance: project(s.parts, hit.point).distance })).sort((a, b) => a.distance - b.distance)[0];
          const ownerMatches = section && compatible(operator, section.operator);
          if (!ownerMatches) warnings.add("rail-operator-missing-or-different");
          const eligible = Boolean(ownerMatches && section.service !== "yard" && section.service !== "spur");
          const side = Math.sign((edge.b.x - edge.a.x) * (hit.point.y - point.y) - (edge.b.y - edge.a.y) * (hit.point.x - point.x));
          candidates.push({ id: track.id, distance: hit.distance, along: hit.along, side, eligible });
        }
        // 面ホームは各縁の最寄り1線。線ホームは両側の最寄りを候補にできる。
        for (const side of closed ? [undefined] : [-1, 0, 1]) {
          const sorted = candidates.filter((c) => side === undefined || c.side === side).sort((a, b) => a.distance - b.distance);
          if (!sorted.length) continue;
          if (sorted[1] && sorted[1].distance - sorted[0].distance < 0.5) { warnings.add("ambiguous-platform-edge"); continue; }
          const best = sorted[0];
          if (!best.eligible) continue; // 手前の他社線・構内線を飛び越して奥の線路を採用しない。
          const list = samples.get(best.id) ?? [];
          list.push({ along: best.along, platformId: platform.id }); samples.set(best.id, list);
        }
      }
    }
  }
  const matches: PlatformMatch[] = [];
  for (const [trackId, points] of samples) {
    points.sort((a, b) => a.along - b.along);
    let group: typeof points = [];
    const flush = () => {
      if (!group.length) return;
      const startM = group[0].along, endM = group.at(-1)!.along;
      const platformIds = [...new Set(group.map((p) => p.platformId))];
      const expected = Math.max(...platformIds.map((id) => expectedLengths.get(`${trackId}:${id}`) ?? 0));
      if (endM - startM >= MIN_PASSENGER_IMPORT_LENGTH_M && endM - startM >= expected * 0.6) matches.push({ trackId, platformIds: [...new Set(group.map((p) => p.platformId))], startM, endM });
      else warnings.add("short-or-fragmented-platform-contact");
    };
    for (const point of points) {
      if (group.length && point.along - group.at(-1)!.along > STEP_M * 2 + 0.01) { flush(); group = []; }
      group.push(point);
    }
    flush();
  }
  if (!localPlatforms) warnings.add("platform-geometry-missing");
  if (!matches.length) warnings.add("no-confirmed-platform-track");
  return { matches, warnings: [...warnings] };
}
