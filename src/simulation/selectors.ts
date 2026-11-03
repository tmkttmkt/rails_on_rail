import type {
  Line,
  MapState,
  Operation,
  OperationExecution,
  OperationExecutionStatus,
  Route,
  ServiceSystem,
  VehicleDuty,
} from "./model";

export function getLines(state: MapState): (Line & { servicePatternIds?: string[] })[] {
  return Object.values(state.lines || {})
    .sort((a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id))
    .map((l) => ({
      ...l,
      servicePatternIds: Object.values(state.serviceSystems || {})
        .filter((s) => s.lineId === l.id)
        .map((s) => s.id)
        .concat(
          Object.values(state.servicePatterns || {})
            .filter((sp: any) => sp.lineIds?.includes(l.id))
            .map((sp: any) => sp.id)
        ),
    }));
}

export function getLineById(state: MapState, lineId: string): Line | undefined {
  return state.lines?.[lineId];
}

export function getServiceSystemsByLine(state: MapState, lineId: string): ServiceSystem[] {
  return Object.values(state.serviceSystems || {})
    .filter((s) => s.lineId === lineId)
    .sort((a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id));
}

export function getServicePatternsByLine(state: MapState, lineId: string): any[] {
  const systems = getServiceSystemsByLine(state, lineId);
  const patterns = Object.values(state.servicePatterns || {}).filter((sp: any) => sp.lineIds?.includes(lineId));
  return [...systems, ...patterns];
}

export function getServiceSystemById(state: MapState, sysId: string): ServiceSystem | undefined {
  return state.serviceSystems?.[sysId];
}

export function getRoutes(state: MapState): (Route & { stationIds?: string[] })[] {
  return Object.values(state.routes || {}).map((r) => ({
    ...r,
    stationIds: r.stops?.map((s) => s.stationId) || (r as any).stationIds || [],
  }));
}

export function getRouteById(state: MapState, routeId: string): (Route & { stationIds?: string[] }) | undefined {
  const r = state.routes?.[routeId];
  if (!r) return undefined;
  return {
    ...r,
    stationIds: r.stops?.map((s) => s.stationId) || (r as any).stationIds || [],
  };
}

export function getOperations(state: MapState): Operation[] {
  return Object.values(state.operations || {});
}

export function getOperationById(state: MapState, operationId: string): Operation | undefined {
  return state.operations?.[operationId];
}

export function getOperationsByRoute(state: MapState, routeId: string): Operation[] {
  return Object.values(state.operations || {}).filter((op) => op.routeId === routeId);
}

export function getOperationsByLine(state: MapState, lineId: string): Operation[] {
  return Object.values(state.operations || {}).filter((op) =>
    op.lineAssignments?.some((a) => a.lineId === lineId)
  );
}

export function getOperationsByServiceSystem(state: MapState, serviceSystemId: string): Operation[] {
  return Object.values(state.operations || {}).filter((op) =>
    op.lineAssignments?.some((a) => a.serviceSystemId === serviceSystemId)
  );
}

export function getUnassignedOperations(state: MapState): Operation[] {
  return Object.values(state.operations || {}).filter((op) =>
    !op.lineAssignments || op.lineAssignments.length === 0
  );
}

export function getVehicleDuties(state: MapState): VehicleDuty[] {
  return Object.values(state.vehicleDuties || {});
}

export function getVehicleDutyById(state: MapState, dutyId: string): VehicleDuty | undefined {
  return state.vehicleDuties?.[dutyId];
}

export function getEligibleRoutesForPlacement(state: MapState, placementId: string): Route[] {
  const placement = state.vehiclePlacements.find((p) => p.id === placementId || p.formationId === placementId);
  if (!placement) return [];

  return Object.values(state.routes || {}).filter((route) => {
    if (!route.stops || route.stops.length === 0) return false;
    const startStop = route.stops[0];
    if (startStop.stationId !== placement.stationId) return false;
    if (startStop.trackId !== placement.trackId) return false;

    const firstLeg = route.legs?.[0];
    if (!firstLeg || !firstLeg.tracks || firstLeg.tracks.length === 0) return false;
    const initialTrackDir = firstLeg.tracks[0].direction;
    return placement.orientation === initialTrackDir;
  });
}

export function getIneligibleRouteReasons(state: MapState, placementId: string, routeId: string): string[] {
  const placement = state.vehiclePlacements.find((p) => p.id === placementId || p.formationId === placementId);
  if (!placement) return ["指定された編成配置が存在しません。"];
  const route = state.routes?.[routeId];
  if (!route) return ["指定された経路が存在しません。"];

  const reasons: string[] = [];
  if (!route.stops || route.stops.length === 0) {
    reasons.push("経路に停車駅が定義されていません。");
    return reasons;
  }
  const startStop = route.stops[0];
  if (startStop.stationId !== placement.stationId) {
    reasons.push(`配置駅と経路始発駅（${startStop.stationId}）が一致しません。`);
  }
  if (startStop.trackId !== placement.trackId) {
    reasons.push(`配置線路（${placement.trackId}）と経路始発線路（${startStop.trackId}）が一致しません。`);
  }
  const firstLeg = route.legs?.[0];
  if (firstLeg && firstLeg.tracks && firstLeg.tracks.length > 0) {
    const initialTrackDir = firstLeg.tracks[0].direction;
    if (placement.orientation !== initialTrackDir) {
      reasons.push(`編成の配置向き（${placement.orientation}）が経路始発進行方向（${initialTrackDir}）と逆向きです。`);
    }
  }
  return reasons;
}

export function getExecutionsByStatus(state: MapState, status: OperationExecutionStatus): OperationExecution[] {
  return Object.values(state.operationExecutions || {}).filter((exec) => exec.status === status);
}

export const selectors = {
  getLines,
  getLineById,
  getServiceSystemsByLine,
  getServicePatternsByLine,
  getServiceSystemById,
  getRoutes,
  getRouteById,
  getOperations,
  getOperationById,
  getOperationsByRoute,
  getOperationsByLine,
  getOperationsByServiceSystem,
  getUnassignedOperations,
  getVehicleDuties,
  getVehicleDutyById,
  getEligibleRoutesForPlacement,
  getIneligibleRouteReasons,
  getExecutionsByStatus,
};
