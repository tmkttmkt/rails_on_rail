import { findPhysicalRouteBetweenStops } from "./pathfinding";
import type { MapState } from "./model";
import type {
  CommercialStopType,
  Route,
  RouteLeg,
  RouteStop,
} from "./serviceModel";

export interface CreateRouteStopInput {
  stationId: string;
  trackId: string;
  stopPointId?: string;
  stopPointIndex?: number;
  commercialType?: CommercialStopType;
  dwellSeconds?: number;
}

export function buildRouteStops(state: MapState, stopInputs: CreateRouteStopInput[]): RouteStop[] {
  if (stopInputs.length < 2) {
    throw new Error("経路には2駅以上を指定してください");
  }

  return stopInputs.map((input, index) => {
    const station = state.stations.find((s) => s.id === input.stationId);
    if (!station) throw new Error(`駅が存在しません: ${input.stationId}`);

    const track = state.tracks.find((t) => t.id === input.trackId);
    if (!track) throw new Error(`停車線路が存在しません: ${input.trackId}`);

    const stopPointIdx = input.stopPointIndex ?? 0;
    const stopPoint =
      (input.stopPointId ? station.stopPoints.find((sp) => sp.id === input.stopPointId) : undefined) ||
      station.stopPoints.find((sp) => sp.trackId === input.trackId) ||
      station.stopPoints[stopPointIdx] ||
      station.stopPoints[0];

    if (!stopPoint) {
      throw new Error(`駅「${station.name}」に線路 ${input.trackId} の停車地点がありません`);
    }

    const distM = (stopPoint.startDistanceM + stopPoint.endDistanceM) / 2;
    const commType: CommercialStopType = input.commercialType ?? "stop";
    const dwell = commType === "pass" ? 0 : (input.dwellSeconds ?? 30);

    return {
      id: `rstop-${index + 1}-${station.id}`,
      sequence: index + 1,
      stationId: station.id,
      trackId: input.trackId,
      stopPointId: stopPoint.id,
      stopPointIndex: stopPointIdx,
      distanceM: distM,
      commercialType: commType,
      dwellSeconds: dwell,
    };
  });
}

export function computeRouteLegs(state: MapState, stops: RouteStop[]): { legs: RouteLeg[]; totalDistanceM: number } {
  const legs: RouteLeg[] = [];
  let totalDistanceM = 0;

  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i];
    const to = stops[i + 1];

    if (from.stationId === to.stationId) {
      throw new Error("同じ駅を連続して指定することはできません");
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

  return { legs, totalDistanceM };
}

export function createRoute(
  state: MapState,
  payload: {
    id?: string;
    name: string;
    directionName?: string;
    stops: CreateRouteStopInput[];
  }
): { state: MapState; route: Route } {
  const name = payload.name.trim();
  if (!name) throw new Error("経路名を入力してください");

  const directionName = (payload.directionName ?? "下り").trim() || "下り";

  const id = payload.id || `route-${state.nextRouteId++}`;
  if (state.routes[id]) throw new Error(`経路ID ${id} は既に存在します`);

  const stops = buildRouteStops(state, payload.stops);
  const { legs, totalDistanceM } = computeRouteLegs(state, stops);

  const now = state.clock.currentTimeMs;
  const route: Route = {
    id,
    name,
    directionName,
    stops,
    legs,
    stationIds: stops.map((s) => s.stationId),
    totalDistanceM,
    lengthM: totalDistanceM,
    status: "active",
    createdAtGameTimeMs: now,
    updatedAtGameTimeMs: now,
  };

  state.routes[id] = route;
  return { state, route };
}

export function updateRoute(
  state: MapState,
  payload: {
    id: string;
    name?: string;
    directionName?: string;
    stops?: CreateRouteStopInput[];
  }
): { state: MapState; route: Route; reviewRequiredOperationIds: string[] } {
  const route = state.routes[payload.id];
  if (!route) throw new Error(`ERR_ROUTE_NOT_FOUND: 指定された経路 (${payload.id}) が存在しません`);

  const reviewRequiredOperationIds: string[] = [];

  if (payload.name !== undefined) {
    const name = payload.name.trim();
    if (!name) throw new Error("経路名を空にすることはできません");
    route.name = name;
  }
  if (payload.directionName !== undefined) {
    const dir = payload.directionName.trim();
    if (!dir) throw new Error("方向名を空にすることはできません");
    route.directionName = dir;
  }

  if (payload.stops) {
    const newStops = buildRouteStops(state, payload.stops);
    const { legs, totalDistanceM } = computeRouteLegs(state, newStops);

    route.stops = newStops;
    route.legs = legs;
    route.totalDistanceM = totalDistanceM;
    route.lengthM = totalDistanceM;

    // Flag all dependent operations as requiring review
    for (const op of Object.values(state.operations || {})) {
      if (op.routeId === route.id) {
        op.requiresReview = true;
        reviewRequiredOperationIds.push(op.id);
      }
    }
  }

  route.updatedAtGameTimeMs = state.clock.currentTimeMs;
  return { state, route, reviewRequiredOperationIds };
}

export function deleteRoute(state: MapState, routeId: string): { state: MapState } {
  const route = state.routes[routeId];
  if (!route) throw new Error(`ERR_ROUTE_NOT_FOUND: 指定された経路 (${routeId}) が存在しません`);

  // Check if any operations reference this route
  const referencingOperations = Object.values(state.operations || {}).filter((op) => op.routeId === routeId);
  if (referencingOperations.length > 0) {
    const opNames = referencingOperations.map((o) => `「${o.name}」`).join(", ");
    throw new Error(`ERR_REFERENCED_BY_OPERATION: 経路「${route.name}」は運行 ${opNames} から参照されているため削除できません`);
  }

  delete state.routes[routeId];
  return { state };
}

export function duplicateReverseRoute(
  state: MapState,
  payload: {
    sourceRouteId: string;
    name?: string;
    directionName?: string;
  }
): { state: MapState; route: Route } {
  const source = state.routes[payload.sourceRouteId];
  if (!source) throw new Error(`ERR_ROUTE_NOT_FOUND: 複製元の経路 (${payload.sourceRouteId}) が存在しません`);

  const reverseStopsInput: CreateRouteStopInput[] = [...source.stops].reverse().map((st) => ({
    stationId: st.stationId,
    trackId: st.trackId,
    stopPointId: st.stopPointId,
    stopPointIndex: st.stopPointIndex,
    commercialType: st.commercialType,
    dwellSeconds: st.dwellSeconds,
  }));

  const name = payload.name?.trim() || `${source.name} (復路)`;
  const directionName = payload.directionName?.trim() || (source.directionName === "下り" ? "上り" : "下り");

  return createRoute(state, {
    name,
    directionName,
    stops: reverseStopsInput,
  });
}
