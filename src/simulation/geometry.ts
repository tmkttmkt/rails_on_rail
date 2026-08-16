import type { MapState, Point, Track, TrackJunctionPortLocation } from "./model";

const CURVE_STEPS_PER_SEGMENT = 20;

export const TANGENT_ANGLE_TOLERANCE_RAD = (5 * Math.PI) / 180; // 5 degrees tolerance for tangent continuity

export function calculateTangentAngleDifferenceRad(tangent1: Point, tangent2: Point): number {
  const u1 = normalize(tangent1);
  const u2 = normalize(tangent2);
  const dot = Math.abs(u1.x * u2.x + u1.y * u2.y);
  const clampedDot = Math.min(1, Math.max(0, dot));
  return Math.acos(clampedDot);
}

export function isTangentContinuous(tangent1: Point, tangent2: Point, toleranceRad = TANGENT_ANGLE_TOLERANCE_RAD): boolean {
  return calculateTangentAngleDifferenceRad(tangent1, tangent2) <= toleranceRad;
}

export function getTrackTangentAtPosition(
  track: Pick<Track, "geometry" | "points" | "startTangent" | "endTangent"> & Partial<Pick<Track, "resolvedPath">>,
  position: Point
): Point {
  const sampled = sampleTrack(track);
  if (sampled.length < 2) return { x: 1, y: 0 };
  let bestDist = Infinity;
  let bestTangent = { x: 1, y: 0 };
  for (let index = 0; index < sampled.length - 1; index += 1) {
    const candidate = closestPointOnSegment(position, sampled[index], sampled[index + 1]);
    if (candidate.distance < bestDist) {
      bestDist = candidate.distance;
      const dx = sampled[index + 1].x - sampled[index].x;
      const dy = sampled[index + 1].y - sampled[index].y;
      bestTangent = normalize({ x: dx, y: dy });
    }
  }
  return bestTangent;
}

export function getTrackPortTangent(
  track: Pick<Track, "geometry" | "points" | "startTangent" | "endTangent"> & Partial<Pick<Track, "resolvedPath">>,
  location: TrackJunctionPortLocation,
  distanceM?: number
): Point {
  const sampled = sampleTrack(track);
  if (sampled.length < 2) return { x: 1, y: 0 };
  if (location === "start" || (distanceM !== undefined && distanceM <= 0.001)) {
    return normalize({ x: sampled[1].x - sampled[0].x, y: sampled[1].y - sampled[0].y });
  }
  if (location === "end") {
    return normalize({ x: sampled.at(-1)!.x - sampled.at(-2)!.x, y: sampled.at(-1)!.y - sampled.at(-2)!.y });
  }
  if (distanceM !== undefined) {
    let traversed = 0;
    for (let index = 0; index < sampled.length - 1; index += 1) {
      const segLen = Math.hypot(sampled[index + 1].x - sampled[index].x, sampled[index + 1].y - sampled[index].y);
      if (traversed + segLen >= distanceM || index === sampled.length - 2) {
        return normalize({ x: sampled[index + 1].x - sampled[index].x, y: sampled[index + 1].y - sampled[index].y });
      }
      traversed += segLen;
    }
  }
  return normalize({ x: sampled.at(-1)!.x - sampled.at(-2)!.x, y: sampled.at(-1)!.y - sampled.at(-2)!.y });
}

export function sampleTrack(track: Pick<Track, "geometry" | "points" | "startTangent" | "endTangent"> & Partial<Pick<Track, "resolvedPath">>): Point[] {
  if (track.resolvedPath || track.geometry === "straight") return track.points.map((point) => ({ ...point }));
  return sampleArcChain(track.points, CURVE_STEPS_PER_SEGMENT, track.startTangent, track.endTangent);
}

export function createParallelLines(centerLine: Point[], count: number, spacing: number): Point[][] {
  if (centerLine.length < 2) return [centerLine.map((point) => ({ ...point }))];
  const lines: Point[][] = Array.from({ length: count }, () => []);

  centerLine.forEach((point, index) => {
    const previous = centerLine[Math.max(0, index - 1)];
    const next = centerLine[Math.min(centerLine.length - 1, index + 1)];
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const length = Math.hypot(dx, dy) || 1;
    const normal = { x: -dy / length, y: dx / length };

    lines.forEach((line, lineIndex) => {
      const offset = (lineIndex - (count - 1) / 2) * spacing;
      line.push({ x: point.x + normal.x * offset, y: point.y + normal.y * offset });
    });
  });

  return lines;
}

export interface AlignmentSample {
  point: Point;
  distanceM: number;
  radiusM: number | null;
}

export interface LineAlignmentAnalysis {
  lengthM: number;
  minimumRadiusM: number | null;
  samples: AlignmentSample[];
}

export interface TrackAlignmentAnalysis {
  lines: LineAlignmentAnalysis[];
  minimumRadiusM: number | null;
}

export function analyzeLine(points: Point[]): LineAlignmentAnalysis {
  const distances = [0];
  for (let index = 1; index < points.length; index += 1) {
    distances.push(distances[index - 1] + Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y));
  }
  const samples = points.map((point, index): AlignmentSample => ({
    point: { ...point },
    distanceM: distances[index] ?? 0,
    radiusM: localRadius(points, index),
  }));
  const finiteRadii = samples.flatMap((sample) => sample.radiusM === null ? [] : [sample.radiusM]);
  return {
    lengthM: distances.at(-1) ?? 0,
    minimumRadiusM: finiteRadii.length > 0 ? Math.min(...finiteRadii) : null,
    samples,
  };
}

export function analyzeTrackLines(lines: Point[][]): TrackAlignmentAnalysis {
  const analyses = lines.map(analyzeLine);
  const radii = analyses.flatMap((line) => line.minimumRadiusM === null ? [] : [line.minimumRadiusM]);
  return { lines: analyses, minimumRadiusM: radii.length > 0 ? Math.min(...radii) : null };
}

export function recommendedCantMm(gaugeMm: number, designSpeedKmh: number, radiusM: number | null, maximumCantMm = 160): number {
  if (radiusM === null || radiusM <= 0 || designSpeedKmh <= 0) return 0;
  const equilibriumCant = gaugeMm * designSpeedKmh ** 2 / (127 * radiusM);
  return Math.round(Math.min(maximumCantMm, Math.max(0, equilibriumCant)));
}

function localRadius(points: Point[], index: number): number | null {
  if (points.length < 3) return null;
  const middle = Math.max(1, Math.min(points.length - 2, index));
  const a = points[middle - 1];
  const b = points[middle];
  const c = points[middle + 1];
  const ab = Math.hypot(b.x - a.x, b.y - a.y);
  const bc = Math.hypot(c.x - b.x, c.y - b.y);
  const ca = Math.hypot(a.x - c.x, a.y - c.y);
  if (ab < 1e-6 || bc < 1e-6 || ca < 1e-6) return null;
  const twiceArea = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  if (twiceArea < 1e-6 * Math.max(ab, bc, ca)) return null;
  return ab * bc * ca / (2 * twiceArea);
}

export function sampleArcChain(points: Point[], stepsPerSegment: number, startTangent?: Point, endTangent?: Point): Point[] {
  if (points.length < 2) return points.map((point) => ({ ...point }));
  const sampled: Point[] = [];
  let tangent = startTangent
    ? orientToward(startTangent, points[0], points[1])
    : normalize({ x: points[1].x - points[0].x, y: points[1].y - points[0].y });

  for (let segment = 0; segment < points.length - 1; segment += 1) {
    const start = points[segment];
    const end = points[segment + 1];
    const isFirstDirectionSegment = segment === 0 && !startTangent;
    const isEndConnection = segment === points.length - 2 && endTangent;
    const segmentResult = isEndConnection
      ? sampleDirectionConnector(start, end, tangent, orientToward(endTangent, start, end), stepsPerSegment)
      : isFirstDirectionSegment
        ? sampleStraightSegment(start, end, stepsPerSegment)
        : sampleArcSegment(start, end, tangent, stepsPerSegment);
    sampled.push(...segmentResult.points.slice(0, -1));
    tangent = segmentResult.endTangent;
  }

  sampled.push({ ...points[points.length - 1] });
  return sampled;
}

interface SampledSegment {
  points: Point[];
  endTangent: Point;
}

function sampleArcSegment(start: Point, end: Point, startTangent: Point, steps: number): SampledSegment {
  const tangent = normalize(startTangent);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const chordSquared = dx * dx + dy * dy;
  const cross = tangent.x * dy - tangent.y * dx;
  if (chordSquared < 1e-12 || Math.abs(cross) < 1e-6 * Math.sqrt(chordSquared)) return sampleStraightSegment(start, end, steps);

  const signedRadius = chordSquared / (2 * cross);
  const center = { x: start.x - tangent.y * signedRadius, y: start.y + tangent.x * signedRadius };
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
  const delta = directedAngle(endAngle - startAngle, Math.sign(signedRadius));
  const points = Array.from({ length: steps + 1 }, (_, step) => {
    const angle = startAngle + delta * step / steps;
    return { x: center.x + Math.abs(signedRadius) * Math.cos(angle), y: center.y + Math.abs(signedRadius) * Math.sin(angle) };
  });
  points[0] = { ...start };
  points[points.length - 1] = { ...end };
  const radial = normalize({ x: end.x - center.x, y: end.y - center.y });
  const direction = Math.sign(delta) || 1;
  return { points, endTangent: { x: -radial.y * direction, y: radial.x * direction } };
}

function sampleStraightSegment(start: Point, end: Point, steps: number): SampledSegment {
  const points = Array.from({ length: steps + 1 }, (_, step) => ({
    x: start.x + (end.x - start.x) * step / steps,
    y: start.y + (end.y - start.y) * step / steps,
  }));
  return { points, endTangent: normalize({ x: end.x - start.x, y: end.y - start.y }) };
}

function sampleDirectionConnector(start: Point, end: Point, startTangent: Point, endTangent: Point, steps: number): SampledSegment {
  const first = normalize(startTangent);
  const last = orientToward(endTangent, start, end);
  const chord = { x: end.x - start.x, y: end.y - start.y };
  const chordSquared = chord.x ** 2 + chord.y ** 2;
  if (chordSquared < 1e-12) {
    throw new Error("同じ位置にある両端を円弧で接続できません。接続位置を変更してください");
  }

  // Equal-distance biarc: choose one join point whose two circular arcs share
  // the same tangent while preserving both existing-track endpoint tangents.
  const tangentDot = first.x * last.x + first.y * last.y;
  const a = 2 * (1 - tangentDot);
  const b = 2 * (chord.x * (first.x + last.x) + chord.y * (first.y + last.y));
  const distance = Math.abs(a) < 1e-10
    ? Math.abs(b) < 1e-10 ? Number.NaN : chordSquared / b
    : (-b + Math.sqrt(Math.max(0, b * b + 4 * a * chordSquared))) / (2 * a);
  if (!Number.isFinite(distance) || distance <= 1e-9) {
    throw new Error("両端の方向を円弧で接続できません。制御点または接続位置を変更してください");
  }

  const join = {
    x: (start.x + end.x + distance * (first.x - last.x)) / 2,
    y: (start.y + end.y + distance * (first.y - last.y)) / 2,
  };
  const firstSteps = Math.max(2, Math.floor(steps / 2));
  const secondSteps = Math.max(2, steps - firstSteps);
  const firstArc = sampleArcSegment(start, join, first, firstSteps);
  const secondArc = sampleArcSegment(join, end, firstArc.endTangent, secondSteps);
  return {
    points: [...firstArc.points.slice(0, -1), ...secondArc.points],
    endTangent: secondArc.endTangent,
  };
}

function directedAngle(angle: number, direction: number): number {
  let result = angle;
  if (direction > 0) while (result <= 0) result += Math.PI * 2;
  else while (result >= 0) result -= Math.PI * 2;
  return result;
}

function normalize(vector: Point): Point {
  const length = Math.hypot(vector.x, vector.y);
  return length < 1e-12 ? { x: 1, y: 0 } : { x: vector.x / length, y: vector.y / length };
}

export interface NearestTrackPoint {
  trackId: string;
  point: Point;
  centerPoint: Point;
  distance: number;
  tangent: Point;
}

export function findNearestTrackPoint(state: MapState, point: Point, maxDistance: number): NearestTrackPoint | null {
  let nearest: NearestTrackPoint | null = null;
  for (const track of state.tracks) {
    const sampled = sampleTrack(track);
    for (let index = 0; index < sampled.length - 1; index += 1) {
      const candidate = closestPointOnSegmentWithRatio(point, sampled[index], sampled[index + 1]);
      if (candidate.distance <= maxDistance && (!nearest || candidate.distance < nearest.distance)) {
        const dx = sampled[index + 1].x - sampled[index].x;
        const dy = sampled[index + 1].y - sampled[index].y;
        const length = Math.hypot(dx, dy) || 1;
        nearest = {
          trackId: track.id,
          point: candidate.point,
          centerPoint: candidate.point,
          distance: candidate.distance,
          tangent: { x: dx / length, y: dy / length },
        };
      }
    }
  }
  return nearest;
}

export function findNearestTrackEndpoint(state: MapState, point: Point, maxDistance: number): NearestTrackPoint | null {
  let nearest: NearestTrackPoint | null = null;
  for (const track of state.tracks) {
    const sampled = sampleTrack(track);
    if (sampled.length < 2) continue;
    const endpoints = [
      { point: sampled[0], next: sampled[1] },
      { point: sampled.at(-1)!, next: sampled.at(-2)! },
    ];
    for (const endpoint of endpoints) {
      const distance = Math.hypot(point.x - endpoint.point.x, point.y - endpoint.point.y);
      if (distance > maxDistance || (nearest && distance >= nearest.distance)) continue;
      const dx = endpoint.next.x - endpoint.point.x;
      const dy = endpoint.next.y - endpoint.point.y;
      const length = Math.hypot(dx, dy) || 1;
      nearest = {
        trackId: track.id,
        point: endpoint.point,
        centerPoint: endpoint.point,
        distance,
        tangent: { x: dx / length, y: dy / length },
      };
    }
  }
  return nearest;
}

export function findAllNearbyTrackEndpoints(state: MapState, point: Point, maxDistance: number): NearestTrackPoint[] {
  const results: NearestTrackPoint[] = [];
  for (const track of state.tracks) {
    const sampled = sampleTrack(track);
    if (sampled.length < 2) continue;
    const candidates = [
      { point: sampled[0], next: sampled[1] },
      { point: sampled.at(-1)!, next: sampled.at(-2)! },
    ];
    for (const candidate of candidates) {
      const distance = Math.hypot(point.x - candidate.point.x, point.y - candidate.point.y);
      if (distance > maxDistance) continue;
      const dx = candidate.next.x - candidate.point.x;
      const dy = candidate.next.y - candidate.point.y;
      const length = Math.hypot(dx, dy) || 1;
      results.push({ trackId: track.id, point: candidate.point, centerPoint: candidate.point, distance, tangent: { x: dx / length, y: dy / length } });
    }
  }
  return results.sort((a, b) => a.distance - b.distance);
}

export function findNearestStraightStartPoint(state: MapState, point: Point, maxDistance: number): NearestTrackPoint | null {
  const curved = findNearestTrackPoint({ ...state, tracks: state.tracks.filter((track) => track.geometry === "curve") }, point, maxDistance);
  const straightEndpoint = findNearestTrackEndpoint({ ...state, tracks: state.tracks.filter((track) => track.geometry === "straight") }, point, maxDistance);
  if (!curved) return straightEndpoint;
  if (!straightEndpoint) return curved;
  return curved.distance <= straightEndpoint.distance ? curved : straightEndpoint;
}

export function projectPointToAxis(point: Point, origin: Point, direction: Point): Point {
  const length = Math.hypot(direction.x, direction.y);
  if (length === 0) return { ...origin };
  const unit = { x: direction.x / length, y: direction.y / length };
  const distance = (point.x - origin.x) * unit.x + (point.y - origin.y) * unit.y;
  return { x: origin.x + unit.x * distance, y: origin.y + unit.y * distance };
}

function orientToward(tangent: Point, start: Point, next: Point): Point {
  const length = Math.hypot(tangent.x, tangent.y) || 1;
  const unit = { x: tangent.x / length, y: tangent.y / length };
  const dot = unit.x * (next.x - start.x) + unit.y * (next.y - start.y);
  return dot < 0 ? { x: -unit.x, y: -unit.y } : unit;
}

export function closestPointOnSegment(point: Point, start: Point, end: Point): { point: Point; distance: number } {
  const result = closestPointOnSegmentWithRatio(point, start, end);
  return { point: result.point, distance: result.distance };
}

export function polylineOverlapLength(first: Point[], second: Point[], toleranceM = 0.00001): number {
  let overlap = 0;
  for (let firstIndex = 0; firstIndex < first.length - 1; firstIndex += 1) {
    for (let secondIndex = 0; secondIndex < second.length - 1; secondIndex += 1) {
      overlap += collinearSegmentOverlapLength(first[firstIndex], first[firstIndex + 1], second[secondIndex], second[secondIndex + 1], toleranceM);
    }
  }
  return overlap;
}

function collinearSegmentOverlapLength(aStart: Point, aEnd: Point, bStart: Point, bEnd: Point, toleranceM: number): number {
  const ax = aEnd.x - aStart.x;
  const ay = aEnd.y - aStart.y;
  const bx = bEnd.x - bStart.x;
  const by = bEnd.y - bStart.y;
  const aLength = Math.hypot(ax, ay);
  const bLength = Math.hypot(bx, by);
  if (aLength < 1e-9 || bLength < 1e-9) return 0;
  if (Math.abs(ax * by - ay * bx) > toleranceM * aLength * bLength) return 0;
  const startDistanceFromLine = Math.abs(ax * (bStart.y - aStart.y) - ay * (bStart.x - aStart.x)) / aLength;
  const endDistanceFromLine = Math.abs(ax * (bEnd.y - aStart.y) - ay * (bEnd.x - aStart.x)) / aLength;
  if (startDistanceFromLine > toleranceM || endDistanceFromLine > toleranceM) return 0;
  const unit = { x: ax / aLength, y: ay / aLength };
  const b0 = (bStart.x - aStart.x) * unit.x + (bStart.y - aStart.y) * unit.y;
  const b1 = (bEnd.x - aStart.x) * unit.x + (bEnd.y - aStart.y) * unit.y;
  return Math.max(0, Math.min(aLength, Math.max(b0, b1)) - Math.max(0, Math.min(b0, b1)));
}

function closestPointOnSegmentWithRatio(point: Point, start: Point, end: Point): { point: Point; distance: number; ratio: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const denominator = dx * dx + dy * dy;
  const t = denominator === 0
    ? 0
    : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / denominator));
  const closest = { x: start.x + t * dx, y: start.y + t * dy };
  return { point: closest, distance: Math.hypot(point.x - closest.x, point.y - closest.y), ratio: t };
}
