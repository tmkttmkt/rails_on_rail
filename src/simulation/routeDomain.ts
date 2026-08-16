import { findPhysicalRouteBetweenStops } from "./pathfinding";
import type { MapState } from "./model";
import type {
  CommercialStopType,
  Route,
  RouteLeg,
  RouteLineSection,
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

export interface CreateRouteLineSectionInput {
  fromStopSequence: number;
  toStopSequence: number;
  lineId: string;
  serviceSystemId?: string;
}

export function validateRouteLineSections(
  lineSections: RouteLineSection[],
  stops: RouteStop[],
  lines: Record<string, any>,
  serviceSystems: Record<string, any>
): void {
  if (stops.length < 2) return;
  if (!lineSections || lineSections.length === 0) {
    throw new Error("ERR_INVALID_ROUTE_SECTIONS: 経路には1つ以上の路線区間が必要です");
  }

  // Map stop IDs to sequences
  const stopSeqMap = new Map(stops.map((s) => [s.id, s.sequence]));

  for (const sec of lineSections) {
    if (!sec.id) throw new Error("ERR_INVALID_ROUTE_SECTIONS: 区間IDが不正です");
    const fromSeq = stopSeqMap.get(sec.fromStopId);
    const toSeq = stopSeqMap.get(sec.toStopId);

    if (fromSeq === undefined || toSeq === undefined) {
      throw new Error(`ERR_INVALID_ROUTE_SECTIONS: 区間端点の地点ID (${sec.fromStopId}, ${sec.toStopId}) が経路内に存在しません`);
    }

    if (fromSeq >= toSeq) {
      throw new Error(`ERR_INVALID_ROUTE_SECTIONS: 区間の順序が不正です (${fromSeq} -> ${toSeq})。始点は終点より前に設定してください`);
    }

    if (!lines[sec.lineId]) {
      throw new Error(`ERR_LINE_NOT_FOUND: 区間路線 (${sec.lineId}) が存在しません`);
    }

    if (sec.serviceSystemId) {
      const sys = serviceSystems[sec.serviceSystemId];
      if (!sys) {
        throw new Error(`ERR_SERVICE_SYSTEM_NOT_FOUND: 区間系統 (${sec.serviceSystemId}) が存在しません`);
      }
      if (sys.lineId !== sec.lineId) {
        throw new Error(
          `ERR_SYSTEM_LINE_MISMATCH: 系統「${sys.name}」の親路線 (${sys.lineId}) が区間路線 (${sec.lineId}) と一致しません`
        );
      }
    }
  }

  // Sort sections by fromStop sequence and verify continuity from first stop (1) to last stop (stops.length)
  const sorted = [...lineSections].sort((a, b) => stopSeqMap.get(a.fromStopId)! - stopSeqMap.get(b.fromStopId)!);

  const firstFromSeq = stopSeqMap.get(sorted[0].fromStopId)!;
  if (firstFromSeq !== 1) {
    throw new Error(`ERR_INVALID_ROUTE_SECTIONS: 区間の開始地点は経路の始発駅 (1) である必要があります (現在は ${firstFromSeq})`);
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const curToSeq = stopSeqMap.get(sorted[i].toStopId)!;
    const nextFromSeq = stopSeqMap.get(sorted[i + 1].fromStopId)!;

    if (curToSeq < nextFromSeq) {
      throw new Error(`ERR_INVALID_ROUTE_SECTIONS: 区間 ${i + 1} と ${i + 2} の間に未指定の空白が存在します (${curToSeq} -> ${nextFromSeq})`);
    }
    if (curToSeq > nextFromSeq) {
      throw new Error(`ERR_INVALID_ROUTE_SECTIONS: 区間 ${i + 1} と ${i + 2} の範囲が重複しています (${curToSeq} > ${nextFromSeq})`);
    }
  }

  const lastToSeq = stopSeqMap.get(sorted.at(-1)!.toStopId)!;
  if (lastToSeq !== stops.length) {
    throw new Error(`ERR_INVALID_ROUTE_SECTIONS: 区間の終了地点は経路の終着駅 (${stops.length}) である必要があります (現在は ${lastToSeq})`);
  }
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
    directionName: string;
    stops: CreateRouteStopInput[];
    lineSections?: CreateRouteLineSectionInput[];
  }
): { state: MapState; route: Route } {
  const name = payload.name.trim();
  if (!name) throw new Error("経路名を入力してください");

  const directionName = payload.directionName.trim();
  if (!directionName) throw new Error("方向名を入力してください");

  const id = payload.id || `route-${state.nextRouteId++}`;
  if (state.routes[id]) throw new Error(`経路ID ${id} は既に存在します`);

  const stops = buildRouteStops(state, payload.stops);
  const { legs, totalDistanceM } = computeRouteLegs(state, stops);

  let lineSections: RouteLineSection[] = [];
  if (payload.lineSections && payload.lineSections.length > 0) {
    lineSections = payload.lineSections.map((sec, idx) => {
      const fromStop = stops.find((s) => s.sequence === sec.fromStopSequence);
      const toStop = stops.find((s) => s.sequence === sec.toStopSequence);
      if (!fromStop || !toStop) throw new Error("区間の指定シーケンスが不正です");
      return {
        id: `sec-${idx + 1}-${id}`,
        fromStopId: fromStop.id,
        toStopId: toStop.id,
        lineId: sec.lineId,
        serviceSystemId: sec.serviceSystemId,
      };
    });
  } else {
    // Default to a single line section covering the entire route using first available line
    const defaultLineId = Object.keys(state.lines)[0];
    if (!defaultLineId) throw new Error("ERR_NO_LINES: 路線が存在しません。先に路線を作成してください");
    lineSections = [
      {
        id: `sec-1-${id}`,
        fromStopId: stops[0].id,
        toStopId: stops.at(-1)!.id,
        lineId: defaultLineId,
      },
    ];
  }

  validateRouteLineSections(lineSections, stops, state.lines, state.serviceSystems);

  const now = state.clock.currentTimeMs;
  const route: Route = {
    id,
    name,
    directionName,
    stops,
    legs,
    lineSections,
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
    lineSections?: CreateRouteLineSectionInput[];
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

    if (payload.lineSections) {
      route.lineSections = payload.lineSections.map((sec, idx) => {
        const fromStop = newStops.find((s) => s.sequence === sec.fromStopSequence);
        const toStop = newStops.find((s) => s.sequence === sec.toStopSequence);
        if (!fromStop || !toStop) throw new Error("区間の指定シーケンスが不正です");
        return {
          id: `sec-${idx + 1}-${route.id}`,
          fromStopId: fromStop.id,
          toStopId: toStop.id,
          lineId: sec.lineId,
          serviceSystemId: sec.serviceSystemId,
        };
      });
    } else {
      // Keep or adapt lineSections to new stop IDs
      const defaultLineId = Object.keys(state.lines)[0];
      route.lineSections = [
        {
          id: `sec-1-${route.id}`,
          fromStopId: newStops[0].id,
          toStopId: newStops.at(-1)!.id,
          lineId: defaultLineId,
        },
      ];
    }

    validateRouteLineSections(route.lineSections, newStops, state.lines, state.serviceSystems);

    // Flag all dependent operations as requiring review
    for (const op of Object.values(state.operations || {})) {
      if (op.routeId === route.id) {
        op.requiresReview = true;
        reviewRequiredOperationIds.push(op.id);
      }
    }
  } else if (payload.lineSections) {
    route.lineSections = payload.lineSections.map((sec, idx) => {
      const fromStop = route.stops.find((s) => s.sequence === sec.fromStopSequence);
      const toStop = route.stops.find((s) => s.sequence === sec.toStopSequence);
      if (!fromStop || !toStop) throw new Error("区間の指定シーケンスが不正です");
      return {
        id: `sec-${idx + 1}-${route.id}`,
        fromStopId: fromStop.id,
        toStopId: toStop.id,
        lineId: sec.lineId,
        serviceSystemId: sec.serviceSystemId,
      };
    });
    validateRouteLineSections(route.lineSections, route.stops, state.lines, state.serviceSystems);
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

  // Reverse lineSections sequence mapping
  const totalStops = source.stops.length;
  const stopSeqMap = new Map(source.stops.map((s) => [s.id, s.sequence]));

  const reverseLineSectionsInput: CreateRouteLineSectionInput[] = [...source.lineSections].reverse().map((sec) => {
    const origFromSeq = stopSeqMap.get(sec.fromStopId)!;
    const origToSeq = stopSeqMap.get(sec.toStopId)!;
    return {
      fromStopSequence: totalStops - origToSeq + 1,
      toStopSequence: totalStops - origFromSeq + 1,
      lineId: sec.lineId,
      serviceSystemId: sec.serviceSystemId,
    };
  });

  return createRoute(state, {
    name,
    directionName,
    stops: reverseStopsInput,
    lineSections: reverseLineSectionsInput,
  });
}
