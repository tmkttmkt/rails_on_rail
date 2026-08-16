import type { MapState } from "./model";

export function assertStationCanBeDeleted(state: MapState, stationId: string): void {
  const station = state.stations.find((s) => s.id === stationId);
  const stationName = station?.name || stationId;

  // Check Routes
  for (const route of Object.values(state.routes || {})) {
    if (route.stops?.some((stop) => stop.stationId === stationId)) {
      throw new Error(
        `ERR_REFERENCED_BY_ROUTE: 駅「${stationName}」は経路「${route.name}」から参照されているため削除できません。先に経路を削除してください。`
      );
    }
  }
}

export function assertTrackCanBeDeletedOrShortened(state: MapState, trackId: string, _newLengthM?: number): void {
  // Check Routes stops and legs
  for (const route of Object.values(state.routes || {})) {
    if (route.stops?.some((stop) => stop.trackId === trackId)) {
      throw new Error(`ERR_TRACK_REFERENCED: 線路 ${trackId} は経路「${route.name}」の停車線路に含まれているため削除・短縮できません。`);
    }
    for (const leg of route.legs || []) {
      if (leg.tracks?.some((tr) => tr.trackId === trackId)) {
        throw new Error(`ERR_TRACK_REFERENCED: 線路 ${trackId} は経路「${route.name}」の走行区間に含まれているため削除・短縮できません。`);
      }
    }
  }

  // Check OperatingTrains
  for (const train of state.operatingTrains || []) {
    if (train.state !== "completed") {
      const route = state.routes?.[train.routeId];
      if (route) {
        const currentLeg = route.legs?.[train.legIndex];
        const currentTrack = currentLeg?.tracks?.[train.traversalIndex];
        if (currentTrack && currentTrack.trackId === trackId) {
          throw new Error(`ERR_TRACK_REFERENCED: 線路 ${trackId} は運行中列車「${train.name}」が走行中のため削除・短縮できません。`);
        }
      }
    }
  }
}

export function assertJunctionCanBeDeleted(state: MapState, junctionId: string): void {
  for (const route of Object.values(state.routes || {})) {
    for (const leg of route.legs || []) {
      if (leg.junctionIds?.includes(junctionId)) {
        throw new Error(`ERR_JUNCTION_REFERENCED: 接続点 ${junctionId} は経路「${route.name}」の走行区間から参照されているため削除できません。`);
      }
    }
  }
}

export function assertLineCanBeDeleted(state: MapState, lineId: string): void {
  const line = state.lines?.[lineId];
  if (!line) return;

  // Active execution / train run protection
  for (const exec of Object.values(state.operationExecutions || {})) {
    if (exec.status === "reserved" || exec.status === "operating") {
      const op = state.operations[exec.operationId];
      const route = op ? state.routes[op.routeId] : undefined;
      if (route?.lineSections?.some((sec) => sec.lineId === lineId)) {
        throw new Error(`ERR_REFERENCED_BY_ACTIVE_RUN: 路線「${line.name}」は予約中・運行中の列車実行「${exec.id}」から参照されているため削除できません。`);
      }
    }
  }
  for (const run of Object.values(state.trainRuns || {})) {
    if (run.status === "reserved" || run.status === "operating") {
      const sp = state.servicePatterns?.[run.servicePatternId];
      if (sp?.lineIds?.includes(lineId) || run.lineId === lineId) {
        throw new Error(`ERR_REFERENCED_BY_ACTIVE_RUN: 路線「${line.name}」は予約中・運行中の列車運行「${run.id}」から参照されているため削除できません。`);
      }
      const route = state.routes[run.routeId] || state.operationRoutes?.[run.routeId];
      if (
        route?.lineSections?.some((sec: any) => sec.lineId === lineId) ||
        (route?.servicePatternId && state.servicePatterns?.[route.servicePatternId]?.lineIds?.includes(lineId))
      ) {
        throw new Error(`ERR_REFERENCED_BY_ACTIVE_RUN: 路線「${line.name}」は予約中・運行中の列車運行「${run.id}」から参照されているため削除できません。`);
      }
    }
  }

  const childSystems = Object.values(state.serviceSystems || {}).filter((s) => s.lineId === lineId);
  if (childSystems.length > 0) {
    throw new Error(`ERR_LINE_HAS_CHILD_SYSTEMS: 路線「${line.name}」には所属系統が存在するため削除できません。`);
  }

  for (const route of Object.values(state.routes || {})) {
    if (route.lineSections?.some((sec) => sec.lineId === lineId)) {
      throw new Error(`ERR_REFERENCED_BY_ROUTE: 路線「${line.name}」は経路「${route.name}」の区間に参照されているため削除できません。`);
    }
  }
}

export function assertServicePatternCanBeDeleted(state: MapState, serviceSystemId: string): void {
  const sys = state.serviceSystems?.[serviceSystemId];

  // Active execution / train run protection
  for (const exec of Object.values(state.operationExecutions || {})) {
    if (exec.status === "reserved" || exec.status === "operating") {
      const op = state.operations[exec.operationId];
      const route = op ? state.routes[op.routeId] : undefined;
      if (route?.lineSections?.some((sec) => sec.serviceSystemId === serviceSystemId)) {
        throw new Error(`ERR_REFERENCED_BY_ACTIVE_RUN: 系統「${sys?.name || serviceSystemId}」は予約中・運行中の列車実行「${exec.id}」から参照されているため削除できません。`);
      }
    }
  }
  for (const run of Object.values(state.trainRuns || {})) {
    if (run.status === "reserved" || run.status === "operating") {
      if (run.servicePatternId === serviceSystemId) {
        throw new Error(`ERR_REFERENCED_BY_ACTIVE_RUN: 運行系統「${serviceSystemId}」は予約中・運行中の列車運行「${run.id}」から参照されているため削除できません。`);
      }
    }
  }

  if (sys) {
    for (const route of Object.values(state.routes || {})) {
      if (route.lineSections?.some((sec) => sec.serviceSystemId === serviceSystemId)) {
        throw new Error(`ERR_REFERENCED_BY_ROUTE: 系統「${sys.name}」は経路「${route.name}」の区間に参照されているため削除できません。`);
      }
    }
  }
}
