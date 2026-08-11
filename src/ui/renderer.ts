import { worldToScreen, type Camera, type MapState, type Point, type Viewport } from "../simulation/model";
import { closestPointOnSegment, createParallelLines, sampleTrack } from "../simulation/geometry";
import type { TrackGeometry } from "../simulation/model";
import { trackCatalog } from "../data/trackCatalog";
import { alignPathEndsToConnection, alignPathsToConnection, centeredConnectionCandidateIndex, findTrackGroup } from "../simulation/commands";

export interface RenderState {
  draftPoints: Point[];
  pointerWorld: Point | null;
  selectedTrackIds: string[];
  selectedStationIds: string[];
  draftGeometry: TrackGeometry;
  snapPoint: Point | null;
  draftStartTangent: Point | null;
  draftEndTangent: Point | null;
  draftTrackCount: number;
  draftTrackSpacing: number;
  draftGaugeMm: number;
  draftStartConnectionTrackId: string | null;
  draftEndConnectionTrackId: string | null;
  draftConnectionAlignmentIndex: number;
  stationRangeStart: { trackId: string; position: Point } | null;
  stationScope: "single" | "bundle";
}

export function drawMap(
  context: CanvasRenderingContext2D,
  state: MapState,
  camera: Camera,
  renderState: RenderState,
): void {
  const viewport = { width: context.canvas.width, height: context.canvas.height };
  context.clearRect(0, 0, viewport.width, viewport.height);
  context.fillStyle = "#d9dde0";
  context.fillRect(0, 0, viewport.width, viewport.height);

  // カメラ回転を Canvas 変換行列で適用
  context.save();
  const cx = viewport.width / 2;
  const cy = viewport.height / 2;
  context.translate(cx, cy);
  context.rotate(-camera.rotation);
  context.translate(-cx, -cy);

  drawGrid(context, camera, viewport);

  for (const track of state.tracks) {
    const gaugeM = trackCatalog.getGauge(track.specification.gaugeId).gaugeMm / 1000;
    drawTrack(context, sampleTrack(track), camera, viewport, gaugeM, renderState.selectedTrackIds.includes(track.id), false);
  }
  for (const route of state.routes) {
    for (const traversal of route.legs.flat()) {
      const track = state.tracks.find((item) => item.id === traversal.trackId);
      if (!track) continue;
      const points = slicePathByDistance(sampleTrack(track), Math.min(traversal.fromDistanceM, traversal.toDistanceM), Math.max(traversal.fromDistanceM, traversal.toDistanceM));
      if (points.length >= 2) strokePolyline(context, points, camera, viewport, "rgba(48,104,158,.55)", 2, [5, 4]);
    }
  }
  for (const station of state.stations) {
    const selected = renderState.selectedStationIds.includes(station.id);
    for (const stopPoint of station.stopPoints) {
      const track = state.tracks.find((item) => item.id === stopPoint.trackId);
      if (!track) continue;
      const stationRange = slicePathByDistance(sampleTrack(track), stopPoint.startDistanceM, stopPoint.endDistanceM);
      if (stationRange.length >= 2) {
        strokePolyline(context, stationRange, camera, viewport, selected ? "#a8322a" : "#d5a642", 7);
        strokePolyline(context, stationRange, camera, viewport, "#f4f0df", 3);
      }
    }
    drawStation(context, station.position, station.name, camera, viewport, selected);
  }
  for (const train of state.operatingTrains) drawOperatingTrain(context, train.position, train.name, train.state, camera, viewport);

  if (renderState.stationRangeStart && renderState.pointerWorld) {
    const track = state.tracks.find((item) => item.id === renderState.stationRangeStart?.trackId);
    if (track) {
      const trackIds = renderState.stationScope === "bundle" ? findTrackGroup(state, track.id)?.trackIds ?? [track.id] : [track.id];
      for (const trackId of trackIds) {
        const target = state.tracks.find((item) => item.id === trackId);
        if (!target) continue;
        const path = sampleTrack(target);
        const startDistance = distanceAlongPathAtPoint(path, renderState.stationRangeStart.position);
        const endDistance = distanceAlongPathAtPoint(path, renderState.pointerWorld);
        const previewRange = slicePathByDistance(path, Math.min(startDistance, endDistance), Math.max(startDistance, endDistance));
        if (previewRange.length >= 2) strokePolyline(context, previewRange, camera, viewport, "#2b8a4b", 8, [8, 4]);
      }
    }
  }

  const draft = [...renderState.draftPoints];
  if (renderState.pointerWorld && draft.length > 0) draft.push(renderState.pointerWorld);
  if (draft.length > 1) {
    const preview = sampleTrack({
      geometry: renderState.draftGeometry,
      points: draft,
      ...(renderState.draftStartTangent ? { startTangent: renderState.draftStartTangent } : {}),
      ...(renderState.draftEndTangent ? { endTangent: renderState.draftEndTangent } : {}),
    });
    const previewLines = createParallelLines(preview, renderState.draftTrackCount, renderState.draftTrackSpacing);
    if (renderState.draftStartConnectionTrackId) {
      alignPathsToConnection(state, previewLines, renderState.draftStartConnectionTrackId, renderState.draftConnectionAlignmentIndex, preview[0]);
    }
    if (renderState.draftEndConnectionTrackId) {
      const targetCount = findTrackGroup(state, renderState.draftEndConnectionTrackId)?.trackIds.length ?? 1;
      alignPathEndsToConnection(state, previewLines, renderState.draftEndConnectionTrackId, centeredConnectionCandidateIndex(previewLines.length, targetCount), preview.at(-1)!);
    }
    for (const line of previewLines) {
      drawTrack(context, line, camera, viewport, renderState.draftGaugeMm / 1000, false, true);
    }
  }

  for (const point of renderState.draftPoints) {
    const screen = worldToScreen(point, camera, viewport);
    context.beginPath();
    context.arc(screen.x, screen.y, 5, 0, Math.PI * 2);
    context.fillStyle = "#2475ae";
    context.fill();
    context.strokeStyle = "#f3f6f7";
    context.lineWidth = 2;
    context.stroke();
  }

  if (renderState.snapPoint) {
    const screen = worldToScreen(renderState.snapPoint, camera, viewport);
    context.beginPath();
    context.arc(screen.x, screen.y, 11, 0, Math.PI * 2);
    context.strokeStyle = "#2b8a4b";
    context.lineWidth = 2;
    context.stroke();
    context.beginPath();
    context.arc(screen.x, screen.y, 3, 0, Math.PI * 2);
    context.fillStyle = "#2b8a4b";
    context.fill();
  }

  const origin = worldToScreen({ x: 0, y: 0 }, camera, viewport);
  context.strokeStyle = "rgba(67, 82, 91, .55)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(origin.x - 8, origin.y);
  context.lineTo(origin.x + 8, origin.y);
  context.moveTo(origin.x, origin.y - 8);
  context.lineTo(origin.x, origin.y + 8);
  context.stroke();

  context.restore();
}

function drawOperatingTrain(context: CanvasRenderingContext2D, point: Point, name: string, state: "running" | "dwelling" | "completed", camera: Camera, viewport: Viewport): void {
  const screen = worldToScreen(point, camera, viewport);
  context.beginPath();
  context.arc(screen.x, screen.y, 6, 0, Math.PI * 2);
  context.fillStyle = state === "completed" ? "#6c7377" : state === "dwelling" ? "#c47b24" : "#246eb0";
  context.fill();
  context.strokeStyle = "#f4f5f5";
  context.lineWidth = 2;
  context.stroke();
  context.fillStyle = "#172027";
  context.font = "bold 9px Tahoma, 'Yu Gothic UI', sans-serif";
  context.fillText(name, screen.x + 9, screen.y + 3);
}

function drawStation(context: CanvasRenderingContext2D, point: Point, name: string, camera: Camera, viewport: Viewport, selected: boolean): void {
  const screen = worldToScreen(point, camera, viewport);
  context.beginPath();
  context.rect(screen.x - 5, screen.y - 5, 10, 10);
  context.fillStyle = selected ? "#a8322a" : "#f4f5f5";
  context.fill();
  context.strokeStyle = selected ? "#7e1f1a" : "#20272b";
  context.lineWidth = selected ? 2 : 1.5;
  context.stroke();
  context.font = "bold 11px Tahoma, 'Yu Gothic UI', sans-serif";
  context.textBaseline = "bottom";
  context.lineWidth = 3;
  context.strokeStyle = "rgba(244,245,245,.95)";
  context.strokeText(name, screen.x + 8, screen.y - 3);
  context.fillStyle = selected ? "#8a251f" : "#20272b";
  context.fillText(name, screen.x + 8, screen.y - 3);
}

function slicePathByDistance(points: Point[], requestedStart: number, requestedEnd: number): Point[] {
  if (points.length < 2) return [];
  const distances = [0];
  for (let index = 1; index < points.length; index += 1) {
    distances.push(distances[index - 1] + Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y));
  }
  const total = distances.at(-1) ?? 0;
  const start = Math.max(0, Math.min(total, requestedStart));
  const end = Math.max(start, Math.min(total, requestedEnd));
  const result = [pointAtPathDistance(points, distances, start)];
  for (let index = 1; index < points.length - 1; index += 1) if (distances[index] > start && distances[index] < end) result.push({ ...points[index] });
  result.push(pointAtPathDistance(points, distances, end));
  return result;
}

function pointAtPathDistance(points: Point[], distances: number[], distance: number): Point {
  for (let index = 0; index < points.length - 1; index += 1) {
    if (distance > distances[index + 1]) continue;
    const segmentLength = distances[index + 1] - distances[index];
    const ratio = segmentLength <= 0 ? 0 : (distance - distances[index]) / segmentLength;
    return { x: points[index].x + (points[index + 1].x - points[index].x) * ratio, y: points[index].y + (points[index + 1].y - points[index].y) * ratio };
  }
  return { ...points.at(-1)! };
}

function distanceAlongPathAtPoint(points: Point[], point: Point): number {
  let traversed = 0;
  let best = { distanceM: 0, gap: Infinity };
  for (let index = 0; index < points.length - 1; index += 1) {
    const candidate = closestPointOnSegment(point, points[index], points[index + 1]);
    const partial = Math.hypot(candidate.point.x - points[index].x, candidate.point.y - points[index].y);
    if (candidate.distance < best.gap) best = { distanceM: traversed + partial, gap: candidate.distance };
    traversed += Math.hypot(points[index + 1].x - points[index].x, points[index + 1].y - points[index].y);
  }
  return best.distanceM;
}

function drawGrid(context: CanvasRenderingContext2D, camera: Camera, viewport: Viewport): void {
  const targetPixels = 72;
  const powers = [10, 20, 50, 100, 200, 500, 1000, 2000];
  const step = powers.find((candidate) => candidate * camera.zoom >= targetPixels) ?? 5000;
  const topLeftX = camera.x - viewport.width / 2 / camera.zoom;
  const topLeftY = camera.y - viewport.height / 2 / camera.zoom;
  const bottomRightX = camera.x + viewport.width / 2 / camera.zoom;
  const bottomRightY = camera.y + viewport.height / 2 / camera.zoom;

  context.font = "10px ui-monospace, monospace";
  context.fillStyle = "rgba(58, 68, 74, .48)";
  context.strokeStyle = "rgba(72, 85, 93, .14)";
  context.lineWidth = 1;

  for (let x = Math.floor(topLeftX / step) * step; x <= bottomRightX; x += step) {
    const screen = worldToScreen({ x, y: 0 }, camera, viewport);
    context.beginPath();
    context.moveTo(Math.round(screen.x) + 0.5, 0);
    context.lineTo(Math.round(screen.x) + 0.5, viewport.height);
    context.stroke();
    context.fillText(String(x), screen.x + 5, 15);
  }
  for (let y = Math.floor(topLeftY / step) * step; y <= bottomRightY; y += step) {
    const screen = worldToScreen({ x: 0, y }, camera, viewport);
    context.beginPath();
    context.moveTo(0, Math.round(screen.y) + 0.5);
    context.lineTo(viewport.width, Math.round(screen.y) + 0.5);
    context.stroke();
    context.fillText(String(y), 5, screen.y - 5);
  }
}

function drawTrack(
  context: CanvasRenderingContext2D,
  points: Point[],
  camera: Camera,
  viewport: Viewport,
  gaugeM: number,
  selected: boolean,
  draft: boolean,
): void {
  if (points.length < 2) return;
  context.lineJoin = "round";
  context.lineCap = "round";

  if (camera.zoom < 0.65) {
    strokePolyline(context, points, camera, viewport, selected ? "#a8322a" : draft ? "#2475ae" : "#3f484e", selected ? 5 : 3, draft ? [7, 5] : []);
    return;
  }

  const bedWidth = Math.max(6, gaugeM * camera.zoom + 5);
  if (selected) strokePolyline(context, points, camera, viewport, "#a8322a", bedWidth + 5);
  strokePolyline(context, points, camera, viewport, draft ? "rgba(72, 148, 194, .38)" : "#8b8f91", bedWidth, draft ? [10, 6] : []);

  if (!draft && camera.zoom >= 1.35) drawSleepers(context, points, camera, viewport, gaugeM);

  const rails = createParallelLines(points, 2, Math.max(gaugeM, 0.6));
  const railColor = selected ? "#7e1f1a" : draft ? "#176796" : "#242b2f";
  const railWidth = Math.max(1.2, camera.zoom * 0.38);
  for (const rail of rails) strokePolyline(context, rail, camera, viewport, railColor, railWidth, draft ? [9, 5] : []);
}

function strokePolyline(
  context: CanvasRenderingContext2D,
  points: Point[],
  camera: Camera,
  viewport: Viewport,
  color: string,
  width: number,
  dash: number[] = [],
): void {
  context.beginPath();
  points.forEach((point, index) => {
    const screen = worldToScreen(point, camera, viewport);
    if (index === 0) context.moveTo(screen.x, screen.y);
    else context.lineTo(screen.x, screen.y);
  });
  context.strokeStyle = color;
  context.lineWidth = width;
  context.setLineDash(dash);
  context.stroke();
  context.setLineDash([]);
}

function drawSleepers(context: CanvasRenderingContext2D, points: Point[], camera: Camera, viewport: Viewport, gaugeM: number): void {
  const spacingM = Math.max(2, 8 / camera.zoom);
  const halfLengthPx = Math.max(4, (gaugeM * camera.zoom + 5) / 2);
  context.beginPath();
  for (const sample of samplePolylineByDistance(points, spacingM)) {
    const screen = worldToScreen(sample.point, camera, viewport);
    const normal = { x: -sample.tangent.y, y: sample.tangent.x };
    context.moveTo(screen.x - normal.x * halfLengthPx, screen.y - normal.y * halfLengthPx);
    context.lineTo(screen.x + normal.x * halfLengthPx, screen.y + normal.y * halfLengthPx);
  }
  context.strokeStyle = "#655d57";
  context.lineWidth = Math.max(1, camera.zoom * 0.45);
  context.stroke();
}

function samplePolylineByDistance(points: Point[], spacingM: number): { point: Point; tangent: Point }[] {
  const samples: { point: Point; tangent: Point }[] = [];
  let nextDistance = 0;
  let traversed = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-9) continue;
    while (nextDistance <= traversed + length) {
      const ratio = (nextDistance - traversed) / length;
      samples.push({ point: { x: start.x + dx * ratio, y: start.y + dy * ratio }, tangent: { x: dx / length, y: dy / length } });
      nextDistance += spacingM;
    }
    traversed += length;
  }
  return samples;
}
