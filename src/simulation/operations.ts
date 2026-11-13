import { sampleTrack } from "./geometry";
import { findYardPath } from "./directedPath";
import type { MapState, OperatingTrain, Point, Route, RouteStop, RouteTraversal, RouteTraversalLeg, RouteTraversalTrack } from "./model";

export function findStationRoute(state: MapState, fromStationId: string, toStationId: string,
  endpoints?: { from?: { trackId?: string; distanceM?: number }; to?: { trackId?: string; distanceM?: number } }
): RouteTraversal[] {
  const from = requireStation(state, fromStationId);
  const to = requireStation(state, toStationId);
  const resolve = (station: typeof from, input?: { trackId?: string; distanceM?: number }) => {
    if (input?.distanceM !== undefined && !input.trackId) throw new Error("停車距離には線路指定が必要です");
    const stops = station.stopPoints.filter((stop) => !input?.trackId || stop.trackId === input.trackId);
    if (!stops.length) throw new Error(`駅「${station.name}」に指定線路の停車地点がありません`);
    return stops.map((stop) => {
      const distanceM = input?.distanceM ?? stopMidpoint(stop);
      if (!Number.isFinite(distanceM) || distanceM < stop.startDistanceM || distanceM > stop.endDistanceM) {
        throw new Error(`駅「${station.name}」の停車距離が範囲外です`);
      }
      return { trackId: stop.trackId, distanceM };
    });
  };
  const fromPoints = resolve(from, endpoints?.from);
  const toPoints = resolve(to, endpoints?.to);
  let best: RouteTraversal[] | undefined;
  let bestDistanceM = Infinity;
  for (const start of fromPoints) for (const target of toPoints) for (const direction of [1, -1]) {
    let spans;
    try { spans = findYardPath(state, { ...start, direction }, target); }
    catch { continue; }
    const distanceM = spans.reduce((sum, span) => sum + Math.abs(span.toM - span.fromM), 0);
    if (distanceM < bestDistanceM) {
      bestDistanceM = distanceM;
      best = spans.map((span) => ({ trackId: span.trackId, fromDistanceM: span.fromM, toDistanceM: span.toM }));
    }
  }
  if (!best) throw new Error(`「${from.name}」から「${to.name}」へ到達できません（分岐の進行方向を確認してください）`);
  return best;
}

export function createOperationRoute(state: MapState, name: string, stationIds: string[]): Route {
  const normalized = name.trim();
  if (normalized.length < 1 || normalized.length > 60) throw new Error("運行経路名は1〜60文字で入力してください");
  if (stationIds.length < 2) throw new Error("運行経路には2駅以上を指定してください");
  for (let index = 1; index < stationIds.length; index += 1) {
    if (stationIds[index] === stationIds[index - 1]) throw new Error("同じ駅を連続して指定することはできません");
  }

  const legs: RouteTraversalLeg[] = stationIds.slice(1).map((toId, index) => {
    const traversals = findStationRoute(state, stationIds[index], toId);
    const tracks: RouteTraversalTrack[] = traversals.map((t) => ({
      trackId: t.trackId,
      direction: t.fromDistanceM <= t.toDistanceM ? ("forward" as const) : ("reversed" as const),
      startDistanceM: Math.min(t.fromDistanceM, t.toDistanceM),
      endDistanceM: Math.max(t.fromDistanceM, t.toDistanceM),
      lengthM: Math.abs(t.toDistanceM - t.fromDistanceM),
    }));
    const totalDistanceM = tracks.reduce((sum, tr) => sum + tr.lengthM, 0);
    return {
      fromStopSequence: index + 1,
      toStopSequence: index + 2,
      tracks,
      junctionIds: [],
      totalDistanceM,
    };
  });

  const lengthM = legs.reduce((sum, leg) => sum + leg.totalDistanceM, 0);
  const routeStops: RouteStop[] = stationIds.map((stId, idx) => {
    const station = state.stations.find((s) => s.id === stId);
    const firstTrackId =
      legs[idx]?.tracks[0]?.trackId || legs[idx - 1]?.tracks.at(-1)?.trackId || station?.stopPoints[0]?.trackId || "";
    const stopPoint = station?.stopPoints.find((sp) => sp.trackId === firstTrackId) || station?.stopPoints[0];
    return {
      id: `rstop-${idx + 1}-${stId}`,
      sequence: idx + 1,
      stationId: stId,
      trackId: firstTrackId,
      stopPointId: stopPoint?.id || "",
      stopPointIndex: 0,
      distanceM: 0,
      commercialType: "stop",
      dwellSeconds: 5,
    };
  });

  return {
    id: `route-${state.nextRouteId}`,
    name: normalized,
    directionName: "下り",
    stops: routeStops,
    legs,
    stationIds,
    totalDistanceM: lengthM,
    lengthM,
    status: "active",
    createdAtGameTimeMs: state.clock.currentTimeMs,
    updatedAtGameTimeMs: state.clock.currentTimeMs,
  };
}

export function createOperatingTrain(
  state: MapState,
  routeId: string,
  formationId: string,
  name: string,
  speedKph = 80,
  dwellSeconds = 5
): OperatingTrain {
  const route = requireRoute(state, routeId);
  if (!formationId.trim()) throw new Error("編成IDを入力してください");
  if (!Number.isFinite(speedKph) || speedKph <= 0) throw new Error("列車速度は0より大きくしてください");
  const firstLegTrack = route.legs[0]?.tracks[0];
  if (!firstLegTrack) throw new Error("走行区間のない運行経路です");
  const startDistM = firstLegTrack.direction === "forward" ? firstLegTrack.startDistanceM : firstLegTrack.endDistanceM;
  return {
    id: `operating-train-${state.nextOperatingTrainId}`,
    name: name.trim() || `列車 ${state.nextOperatingTrainId}`,
    formationId: formationId.trim(),
    routeId,
    speedKph,
    dwellSeconds,
    state: "dwelling",
    legIndex: 0,
    traversalIndex: 0,
    distanceOnTraversalM: 0,
    remainingDwellSeconds: dwellSeconds,
    position: pointAtTrackDistance(state, firstLegTrack.trackId, startDistM),
  };
}

export function advanceOperatingTrains(state: MapState, elapsedSeconds: number): void {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return;
  for (const train of state.operatingTrains) advanceTrain(state, train, elapsedSeconds);
}

function advanceTrain(state: MapState, train: OperatingTrain, elapsedSeconds: number): void {
  if (train.state === "completed") return;
  let remainingSeconds = Math.min(elapsedSeconds, 60);
  if (train.state === "dwelling") {
    const used = Math.min(remainingSeconds, train.remainingDwellSeconds);
    train.remainingDwellSeconds -= used;
    remainingSeconds -= used;
    if (train.remainingDwellSeconds > 0) return;
    train.state = "running";
  }
  const route = requireRoute(state, train.routeId);
  let travelM = (remainingSeconds * train.speedKph) / 3.6;
  while (travelM > 0 && train.state === "running") {
    const leg = route.legs[train.legIndex];
    const trackTraversal = leg?.tracks?.[train.traversalIndex];
    if (!trackTraversal) {
      train.state = "completed";
      return;
    }
    const length = trackTraversal.lengthM;
    const available = length - train.distanceOnTraversalM;
    const used = Math.min(travelM, available);
    train.distanceOnTraversalM += used;
    travelM -= used;
    const currentDistM =
      trackTraversal.direction === "forward"
        ? trackTraversal.startDistanceM + train.distanceOnTraversalM
        : trackTraversal.endDistanceM - train.distanceOnTraversalM;
    train.position = pointAtTrackDistance(state, trackTraversal.trackId, currentDistM);
    if (train.distanceOnTraversalM + 1e-6 < length) break;
    train.traversalIndex += 1;
    train.distanceOnTraversalM = 0;
    if (train.traversalIndex < leg.tracks.length) continue;
    train.legIndex += 1;
    train.traversalIndex = 0;
    if (train.legIndex >= route.legs.length) {
      train.state = "completed";
      break;
    }
    const nextLegStop = route.stops?.[train.legIndex];
    train.state = "dwelling";
    train.remainingDwellSeconds = nextLegStop?.dwellSeconds ?? train.dwellSeconds;
    break;
  }
}

export function pointAtTrackDistance(state: MapState, trackId: string, distanceM: number): Point {
  const track = state.tracks.find((item) => item.id === trackId);
  if (!track) throw new Error(`線路が存在しません: ${trackId}`);
  const path = sampleTrack(track);
  let remaining = Math.max(0, distanceM);
  for (let index = 1; index < path.length; index += 1) {
    const start = path[index - 1];
    const end = path[index];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (remaining <= length) {
      const ratio = length <= 1e-9 ? 0 : remaining / length;
      return { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio };
    }
    remaining -= length;
  }
  return { ...path.at(-1)! };
}

function requireStation(state: MapState, id: string) {
  const station = state.stations.find((item) => item.id === id);
  if (!station) throw new Error(`駅が存在しません: ${id}`);
  return station;
}

function requireRoute(state: MapState, id: string): Route {
  const route = state.routes[id];
  if (!route) throw new Error(`運行経路が存在しません: ${id}`);
  return route;
}

function stopMidpoint(stop: { startDistanceM: number; endDistanceM: number }) {
  return (stop.startDistanceM + stop.endDistanceM) / 2;
}
