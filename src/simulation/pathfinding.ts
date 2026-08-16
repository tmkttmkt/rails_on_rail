import type {
  CommercialStopType,
  MapState,
  Route,
  RouteStop,
  RouteTraversalLeg,
  RouteTraversalTrack,
} from "./model";
import { findStationRoute } from "./operations";

export interface CreateRouteStopInput {
  stationId: string;
  trackId: string;
  stopPointId?: string;
  stopPointIndex?: number;
  dwellSeconds?: number;
  commercialType?: CommercialStopType;
}

export function findPhysicalRouteBetweenStops(
  state: MapState,
  fromStop: { stationId: string; trackId?: string; distanceM?: number },
  toStop: { stationId: string; trackId?: string; distanceM?: number }
): { tracks: RouteTraversalTrack[]; junctionIds: string[]; totalDistanceM: number } {
  const traversals = findStationRoute(state, fromStop.stationId, toStop.stationId);
  const tracks: RouteTraversalTrack[] = traversals.map((t) => {
    const dir: "forward" | "reversed" = t.fromDistanceM <= t.toDistanceM ? "forward" : "reversed";
    const startM = Math.min(t.fromDistanceM, t.toDistanceM);
    const endM = Math.max(t.fromDistanceM, t.toDistanceM);
    const len = endM - startM;
    return {
      trackId: t.trackId,
      direction: dir,
      startDistanceM: startM,
      endDistanceM: endM,
      lengthM: len,
    };
  });
  const totalDistanceM = tracks.reduce((sum, tr) => sum + tr.lengthM, 0);
  return { tracks, junctionIds: [], totalDistanceM };
}

export function buildOperationRoute(
  state: MapState,
  payload: {
    id?: string;
    servicePatternId?: string;
    directionId?: string;
    directionName?: string;
    name: string;
    stops: CreateRouteStopInput[];
  }
): Route {
  if (payload.stops.length < 2) {
    throw new Error("運行経路には2つ以上の停車駅を指定してください");
  }
  const normName = payload.name.trim();
  if (!normName) {
    throw new Error("運行経路名を入力してください");
  }

  const routeStops: RouteStop[] = [];

  // Build RouteStop entries
  for (let index = 0; index < payload.stops.length; index += 1) {
    const stopInput = payload.stops[index];
    const station = state.stations.find((s) => s.id === stopInput.stationId);
    if (!station) {
      throw new Error(`駅が存在しません: ${stopInput.stationId}`);
    }
    const track = state.tracks.find((t) => t.id === stopInput.trackId) || state.tracks.find((t) => t.id === station.stopPoints[0]?.trackId);
    if (!track) {
      throw new Error(`停車線路が存在しません: ${stopInput.trackId}`);
    }

    const stopPointIdx = stopInput.stopPointIndex ?? 0;
    const stopPoint =
      (stopInput.stopPointId ? station.stopPoints.find((sp) => sp.id === stopInput.stopPointId) : undefined) ||
      station.stopPoints.find((sp) => sp.trackId === track.id) ||
      station.stopPoints[stopPointIdx] ||
      station.stopPoints[0];
    if (!stopPoint) {
      throw new Error(`駅 ${station.name} に線路 ${track.id} の停車地点がありません`);
    }

    const distM = (stopPoint.startDistanceM + stopPoint.endDistanceM) / 2;
    const commType: CommercialStopType = stopInput.commercialType ?? "stop";
    const dwell = commType === "pass" ? 0 : (stopInput.dwellSeconds ?? 30);

    routeStops.push({
      id: `rstop-${index + 1}-${station.id}`,
      sequence: index + 1,
      stationId: station.id,
      trackId: track.id,
      stopPointId: stopPoint.id,
      stopPointIndex: stopPointIdx,
      distanceM: distM,
      commercialType: commType,
      dwellSeconds: dwell,
    });
  }

  // Compute RouteTraversalLeg list between consecutive stops
  const legs: RouteTraversalLeg[] = [];
  let totalDistanceM = 0;

  for (let index = 0; index < routeStops.length - 1; index += 1) {
    const from = routeStops[index];
    const to = routeStops[index + 1];

    if (from.stationId === to.stationId) {
      throw new Error("同じ駅を続けて指定することはできません");
    }

    const legResult = findPhysicalRouteBetweenStops(state, from, to);

    legs.push({
      fromStopSequence: from.sequence,
      toStopSequence: to.sequence,
      tracks: legResult.tracks,
      junctionIds: legResult.junctionIds,
      totalDistanceM: legResult.totalDistanceM,
    });

    totalDistanceM += legResult.totalDistanceM;
  }

  const routeId = payload.id || `route-${state.nextRouteId++}`;
  const defaultLineId = Object.keys(state.lines)[0] || "line-default";
  const defaultSystemId = Object.keys(state.serviceSystems)[0] || undefined;
  const lineSections = [
    {
      id: `sec-1-${routeId}`,
      fromStopId: routeStops[0].id,
      toStopId: routeStops.at(-1)!.id,
      lineId: defaultLineId,
      serviceSystemId: defaultSystemId,
    },
  ];

  const now = state.clock.currentTimeMs;
  const route: Route = {
    id: routeId,
    name: normName,
    directionName: payload.directionName || "下り",
    stops: routeStops,
    legs,
    lineSections,
    stationIds: routeStops.map((s) => s.stationId),
    servicePatternId: payload.servicePatternId,
    directionId: payload.directionId,
    totalDistanceM,
    lengthM: totalDistanceM,
    status: "active",
    createdAtGameTimeMs: now,
    updatedAtGameTimeMs: now,
  };

  return route;
}
