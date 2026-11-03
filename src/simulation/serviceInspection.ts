import type { MapState } from "./model";
import {
  computeRouteLegs,
  buildRouteStops,
  type CreateRouteStopInput,
} from "./routeDomain";
import {
  validateOperationLineAssignments,
  validateOperationStopTimes,
  validateServiceCalendar,
} from "./operationSchedule";
import { validateDutyContinuity } from "./vehicleDuty";
import { analyzeLine, sampleTrack } from "./geometry";
import {
  formatTimeWithDayOffset,
  type OperationLineAssignment,
  type OperationStopTime,
  type ServiceCalendar,
  type VehicleDutyAssignment,
} from "./serviceModel";

export interface InspectionIssue {
  code: string;
  message: string;
  field?: string;
}

export interface InspectionEffect {
  type: string;
  description: string;
}

export interface RouteInspectionDetails {
  totalDistanceM: number;
  legCount: number;
  minimumRadiusM: number | null;
  stopsCount: number;
  tangentValid: boolean;
}

export interface OperationInspectionDetails {
  routeId: string;
  routeName: string;
  stopCount: number;
  multiDayMaxOffset: number;
  initialDepartureTime: string;
  finalArrivalTime: string;
}

export interface VehicleDutyInspectionDetails {
  assignmentCount: number;
  totalDays: number;
  hasDefaultFormation: boolean;
  continuousLocation: boolean;
}

export interface ExecutionInspectionDetails {
  formationPlaced: boolean;
  stationMatched: boolean;
  trackMatched: boolean;
  orientationMatched: boolean;
  notReserved: boolean;
}

export interface InspectionResult {
  valid: boolean;
  errors: InspectionIssue[];
  warnings: InspectionIssue[];
  effects: InspectionEffect[];
  stateRevision?: string;
  details?:
    | { type: "route"; data: RouteInspectionDetails }
    | { type: "operation"; data: OperationInspectionDetails }
    | { type: "vehicleDuty"; data: VehicleDutyInspectionDetails }
    | { type: "execution"; data: ExecutionInspectionDetails };
}

export function inspectRouteCreation(
  state: MapState,
  params: {
    stops: CreateRouteStopInput[];
  }
): InspectionResult {
  const errors: InspectionIssue[] = [];
  const warnings: InspectionIssue[] = [];
  const effects: InspectionEffect[] = [];

  if (!params.stops || params.stops.length < 2) {
    errors.push({ code: "ERR_INVALID_STOPS", message: "経路には2駅以上を指定してください" });
    return { valid: false, errors, warnings, effects };
  }

  try {
    const stops = buildRouteStops(state, params.stops);
    const { legs, totalDistanceM } = computeRouteLegs(state, stops);

    // Calculate minimum curve radius along all traversed tracks
    const allRadii: number[] = [];
    for (const leg of legs) {
      for (const t of leg.tracks) {
        const track = state.tracks.find((tr) => tr.id === t.trackId);
        if (track) {
          const r = analyzeLine(sampleTrack(track)).minimumRadiusM;
          if (r !== null) allRadii.push(r);
        }
      }
    }

    const minRadiusM = allRadii.length > 0 ? Math.min(...allRadii) : null;

    effects.push({
      type: "route.created",
      description: `全長 ${Math.round(totalDistanceM)} m、${stops.length} 駅の接線適合経路を生成します`,
    });

    return {
      valid: true,
      errors,
      warnings,
      effects,
      details: {
        type: "route",
        data: {
          totalDistanceM,
          legCount: legs.length,
          minimumRadiusM: minRadiusM,
          stopsCount: stops.length,
          tangentValid: true,
        },
      },
    };
  } catch (err: any) {
    errors.push({
      code: err.message?.startsWith("ERR_") ? err.message.split(":")[0].trim() : "ERR_ROUTE_FAILED",
      message: err instanceof Error ? err.message : "経路の事前確認に失敗しました",
    });
    return { valid: false, errors, warnings, effects };
  }
}

export function inspectOperationCreation(
  state: MapState,
  params: {
    routeId: string;
    calendar: ServiceCalendar;
    stopTimes: OperationStopTime[];
    lineAssignments?: OperationLineAssignment[];
  }
): InspectionResult {
  const errors: InspectionIssue[] = [];
  const warnings: InspectionIssue[] = [];
  const effects: InspectionEffect[] = [];

  const route = state.routes[params.routeId];
  if (!route) {
    errors.push({ code: "ERR_ROUTE_NOT_FOUND", message: `指定された経路 (${params.routeId}) が存在しません` });
    return { valid: false, errors, warnings, effects };
  }

  try {
    validateServiceCalendar(params.calendar);
    validateOperationStopTimes(params.stopTimes, route);
    validateOperationLineAssignments(params.lineAssignments, state.lines, state.serviceSystems);

    const maxDayOffset = Math.max(...params.stopTimes.map((st) => st.dayOffset));
    const firstStop = params.stopTimes[0];
    const lastStop = params.stopTimes.at(-1)!;

    effects.push({
      type: "operation.created",
      description: `経路「${route.name}」に対する運行（${params.calendar.weekdays.length} 曜日対象）を定義します`,
    });

    return {
      valid: true,
      errors,
      warnings,
      effects,
      details: {
        type: "operation",
        data: {
          routeId: route.id,
          routeName: route.name,
          stopCount: params.stopTimes.length,
          multiDayMaxOffset: maxDayOffset,
          initialDepartureTime: formatTimeWithDayOffset(firstStop.departureTime, firstStop.dayOffset),
          finalArrivalTime: formatTimeWithDayOffset(lastStop.arrivalTime, lastStop.dayOffset),
        },
      },
    };
  } catch (err: any) {
    errors.push({
      code: err.message?.startsWith("ERR_") ? err.message.split(":")[0].trim() : "ERR_OPERATION_FAILED",
      message: err instanceof Error ? err.message : "運行の事前確認に失敗しました",
    });
    return { valid: false, errors, warnings, effects };
  }
}

export function inspectVehicleDutyCreation(
  state: MapState,
  params: {
    assignments: VehicleDutyAssignment[];
    defaultFormationId?: string;
  }
): InspectionResult {
  const errors: InspectionIssue[] = [];
  const warnings: InspectionIssue[] = [];
  const effects: InspectionEffect[] = [];

  try {
    validateDutyContinuity(params.assignments, state.operations, state.routes);

    if (params.defaultFormationId) {
      const formation = state.fleet.formations.find((f) => f.id === params.defaultFormationId);
      if (!formation) {
        errors.push({ code: "ERR_FORMATION_NOT_FOUND", message: `指定された編成 (${params.defaultFormationId}) が存在しません` });
      }
    }

    const maxServiceDay = Math.max(...params.assignments.map((a) => a.serviceDayOffset));

    effects.push({
      type: "vehicleDuty.created",
      description: `${params.assignments.length} 運行からなる運用（行程 ${maxServiceDay + 1} 日間）を定義します`,
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      effects,
      details: {
        type: "vehicleDuty",
        data: {
          assignmentCount: params.assignments.length,
          totalDays: maxServiceDay + 1,
          hasDefaultFormation: Boolean(params.defaultFormationId),
          continuousLocation: true,
        },
      },
    };
  } catch (err: any) {
    errors.push({
      code: err.message?.startsWith("ERR_") ? err.message.split(":")[0].trim() : "ERR_DUTY_FAILED",
      message: err instanceof Error ? err.message : "運用の事前確認に失敗しました",
    });
    return { valid: false, errors, warnings, effects };
  }
}

export function inspectExecutionEligibility(
  state: MapState,
  params: {
    operationId: string;
    formationId: string;
  }
): InspectionResult {
  const errors: InspectionIssue[] = [];
  const warnings: InspectionIssue[] = [];
  const effects: InspectionEffect[] = [];

  const eligibility = {
    formationPlaced: false,
    stationMatched: false,
    trackMatched: false,
    orientationMatched: false,
    notReserved: false,
  };

  const op = state.operations[params.operationId];
  if (!op) {
    errors.push({ code: "ERR_OPERATION_NOT_FOUND", message: `指定された運行 (${params.operationId}) が存在しません` });
    return { valid: false, errors, warnings, effects };
  }

  if (!op.routeId) {
    errors.push({ code: "ERR_OPERATION_INCOMPLETE", message: "運行に経路が設定されていません" });
    return { valid: false, errors, warnings, effects };
  }
  const route = state.routes[op.routeId];
  if (!route) {
    errors.push({ code: "ERR_ROUTE_NOT_FOUND", message: `運行の参照経路 (${op.routeId}) が存在しません` });
    return { valid: false, errors, warnings, effects };
  }

  const formation = state.fleet.formations.find((f) => f.id === params.formationId);
  if (!formation) {
    errors.push({ code: "ERR_FORMATION_NOT_FOUND", message: `指定された編成 (${params.formationId}) が存在しません` });
    return { valid: false, errors, warnings, effects };
  }

  const placement = state.vehiclePlacements.find((p) => p.formationId === params.formationId);
  if (!placement) {
    errors.push({ code: "ERR_FORMATION_NOT_PLACED", message: "編成が駅に配置されていません" });
  } else {
    eligibility.formationPlaced = true;
    const startStop = route.stops[0];

    if (placement.stationId === startStop.stationId) {
      eligibility.stationMatched = true;
    } else {
      errors.push({
        code: "ERR_PLACEMENT_STATION_MISMATCH",
        message: `配置駅 (${placement.stationId}) が経路始発駅 (${startStop.stationId}) と一致しません`,
      });
    }

    if (placement.trackId === startStop.trackId) {
      eligibility.trackMatched = true;
    } else {
      errors.push({
        code: "ERR_PLACEMENT_TRACK_MISMATCH",
        message: `配置線路 (${placement.trackId}) が経路始発線路 (${startStop.trackId}) と一致しません`,
      });
    }

    const firstLeg = route.legs?.[0];
    if (firstLeg?.tracks?.[0]) {
      const initialDir = firstLeg.tracks[0].direction;
      if (placement.orientation === initialDir) {
        eligibility.orientationMatched = true;
      } else {
        errors.push({
          code: "ERR_PLACEMENT_ORIENTATION_MISMATCH",
          message: `編成の配置向き (${placement.orientation}) が経路進行方向 (${initialDir}) と逆向きです`,
        });
      }
    }
  }

  const isReserved = Object.values(state.operationExecutions || {}).some(
    (exec) => exec.formationId === params.formationId && (exec.status === "reserved" || exec.status === "operating")
  );

  if (!isReserved) {
    eligibility.notReserved = true;
  } else {
    errors.push({ code: "ERR_FORMATION_ALREADY_ASSIGNED", message: "対象編成は既に別の運行で予約・運行中です" });
  }

  const valid =
    eligibility.formationPlaced &&
    eligibility.stationMatched &&
    eligibility.trackMatched &&
    eligibility.orientationMatched &&
    eligibility.notReserved;

  return {
    valid,
    errors,
    warnings,
    effects,
    details: {
      type: "execution",
      data: eligibility,
    },
  };
}
