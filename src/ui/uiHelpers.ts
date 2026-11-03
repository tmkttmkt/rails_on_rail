import type { MapState } from "../simulation/model";
import { inspectExecutionEligibility, inspectOperationCreation, inspectRouteCreation, inspectVehicleDutyCreation, type InspectionResult } from "../simulation/serviceInspection";
import type { CreateRouteStopInput } from "../simulation/routeDomain";
import type { OperationLineAssignment, OperationStopTime, ServiceCalendar, VehicleDutyAssignment } from "../simulation/serviceModel";

export function getRoutePreflightInspection(
  state: MapState,
  params: {
    stops: CreateRouteStopInput[];
  }
): InspectionResult {
  return inspectRouteCreation(state, params);
}

export function getOperationPreflightInspection(
  state: MapState,
  params: {
    routeId: string;
    calendar: ServiceCalendar;
    stopTimes: OperationStopTime[];
    lineAssignments?: OperationLineAssignment[];
  }
): InspectionResult {
  return inspectOperationCreation(state, params);
}

export function getVehicleDutyPreflightInspection(
  state: MapState,
  params: {
    assignments: VehicleDutyAssignment[];
    defaultFormationId?: string;
  }
): InspectionResult {
  return inspectVehicleDutyCreation(state, params);
}

export function getExecutionPreflightInspection(
  state: MapState,
  params: {
    operationId: string;
    formationId: string;
  }
): InspectionResult {
  return inspectExecutionEligibility(state, params);
}

// Backward-compatibility wrapper for any remaining legacy calls
export function getPreflightInspectionResult(
  state: MapState,
  input: {
    servicePatternId?: string;
    directionId?: string;
    stops: CreateRouteStopInput[];
  }
): { valid: boolean; errors: { code: string; message: string }[]; summary?: { totalDistanceM: number; legCount: number } } {
  const result = inspectRouteCreation(state, { stops: input.stops });
  if (result.valid && result.details?.type === "route") {
    return {
      valid: true,
      errors: [],
      summary: {
        totalDistanceM: result.details.data.totalDistanceM,
        legCount: result.details.data.legCount,
      },
    };
  }
  return {
    valid: false,
    errors: result.errors,
  };
}

export function getExactStopPointOptions(
  state: MapState,
  stationId: string
): Array<{ id: string; trackId: string; stopPointId: string; label: string }> {
  const station = state.stations.find((s) => s.id === stationId);
  if (!station) return [];

  return station.stopPoints.map((sp, idx) => {
    const track = state.tracks.find((t) => t.id === sp.trackId);
    const speed = track?.engineering?.designSpeedKmh ? `${track.engineering.designSpeedKmh}km/h` : "";
    return {
      id: sp.id,
      trackId: sp.trackId,
      stopPointId: sp.id,
      label: `${station.name} 線路 ${sp.trackId} (番線 ${idx + 1}${speed ? ` · ${speed}` : ""})`,
    };
  });
}

export function toggleLineMembership(lineIds: string[], lineId: string, enabled: boolean): string[] {
  const set = new Set(lineIds);
  if (enabled) set.add(lineId);
  else set.delete(lineId);
  return Array.from(set);
}

export function addStopPatternEntry(
  entries: Array<{ stationId: string; commercialType: "stop" | "pass"; dwellSeconds: number }>,
  stationId: string,
  commercialType: "stop" | "pass" = "stop",
  dwellSeconds: number = commercialType === "pass" ? 0 : 30
): Array<{ stationId: string; commercialType: "stop" | "pass"; dwellSeconds: number }> {
  return [...entries, { stationId, commercialType, dwellSeconds: commercialType === "pass" ? 0 : dwellSeconds }];
}

export function reorderStopPatternEntries(
  entries: Array<{ stationId: string; commercialType: "stop" | "pass"; dwellSeconds: number }>,
  index: number,
  direction: "up" | "down"
): Array<{ stationId: string; commercialType: "stop" | "pass"; dwellSeconds: number }> {
  const next = [...entries];
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= next.length) return next;
  const [removed] = next.splice(index, 1);
  next.splice(targetIndex, 0, removed);
  return next;
}

export function updateStopPatternEntry(
  entries: Array<{ stationId: string; commercialType: "stop" | "pass"; dwellSeconds: number }>,
  index: number,
  patch: Partial<{ commercialType: "stop" | "pass"; dwellSeconds: number }>
): Array<{ stationId: string; commercialType: "stop" | "pass"; dwellSeconds: number }> {
  return entries.map((entry, idx) => {
    if (idx !== index) return entry;
    const commercialType = patch.commercialType ?? entry.commercialType;
    let dwellSeconds = patch.dwellSeconds ?? entry.dwellSeconds;
    if (commercialType === "pass") dwellSeconds = 0;
    return { ...entry, ...patch, commercialType, dwellSeconds };
  });
}

export function removeStopPatternEntry(
  entries: Array<{ stationId: string; commercialType: "stop" | "pass"; dwellSeconds: number }>,
  index: number
): Array<{ stationId: string; commercialType: "stop" | "pass"; dwellSeconds: number }> {
  return entries.filter((_, idx) => idx !== index);
}

export function buildRouteStopsInput(
  selectedTracks: Record<string, { trackId?: string; stopPointId?: string; commercialType?: "stop" | "pass"; dwellSeconds?: number }>,
  stopPatternStops: Array<{ stationId: string; commercialType: "stop" | "pass"; defaultDwellSeconds?: number }>
): CreateRouteStopInput[] {
  return stopPatternStops.map((spStop) => {
    const sel = selectedTracks[spStop.stationId] || {};
    return {
      stationId: spStop.stationId,
      trackId: sel.trackId || "",
      stopPointId: sel.stopPointId,
      commercialType: sel.commercialType ?? spStop.commercialType,
      dwellSeconds: sel.dwellSeconds ?? spStop.defaultDwellSeconds ?? 30,
    };
  });
}
