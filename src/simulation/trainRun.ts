import { getFormationLengthM, type Formation } from "./fleet";
import type {
  MapState,
  OperatingTrain,
  Operation,
  OperationExecution,
  Route,
  VehiclePlacement,
} from "./model";
import { pointAtTrackDistance } from "./operations";
import { formatServiceDateUtc } from "./serviceModel";

export interface ReserveOperationExecutionInput {
  id?: string;
  operationId: string;
  serviceDate?: string;
  vehicleDutyId?: string;
  formationId?: string;
  scheduledDepartureTimeMs?: number;
  requestedSpeedKph?: number;
  dwellSeconds?: number;
}

export function validateOperationExecutionReservation(
  state: MapState,
  input: ReserveOperationExecutionInput
): {
  operation: Operation;
  route: Route;
  formation: Formation;
  placement: VehiclePlacement;
} {
  const operation = state.operations[input.operationId];
  if (!operation) {
    throw new Error(`ERR_OPERATION_NOT_FOUND: 指定された運行 (${input.operationId}) が存在しません。`);
  }

  const route = state.routes[operation.routeId];
  if (!route) {
    throw new Error(`ERR_ROUTE_NOT_FOUND: 指定された経路 (${operation.routeId}) が存在しません。`);
  }

  const formationId =
    input.formationId ||
    (input.vehicleDutyId ? state.vehicleDuties[input.vehicleDutyId]?.defaultFormationId : undefined);

  if (!formationId) {
    throw new Error("ERR_FORMATION_NOT_SPECIFIED: 運行に使用する編成が指定されていません。");
  }

  const formation = state.fleet.formations.find((f) => f.id === formationId);
  if (!formation) {
    throw new Error(`ERR_FORMATION_NOT_FOUND: 指定された編成 (${formationId}) が存在しません。`);
  }

  if (formation.vehicles.length === 0) {
    throw new Error("ERR_FORMATION_EMPTY: 空の編成は発車できません。");
  }

  const speed = input.requestedSpeedKph ?? 80;
  if (!Number.isFinite(speed) || speed <= 0 || speed > 500) {
    throw new Error("ERR_INVALID_SPEED: 要求速度は 0 km/h より大きく 500 km/h 以下である必要があります。");
  }

  const placement = state.vehiclePlacements.find((p) => p.formationId === formationId);
  if (!placement) {
    throw new Error("ERR_FORMATION_NOT_PLACED: 編成が駅に配置されていません。");
  }

  // Check if formation is already reserved or operating
  const isAlreadyReserved = Object.values(state.operationExecutions || {}).some(
    (exec) =>
      exec.formationId === formationId &&
      (exec.status === "reserved" || exec.status === "operating" || exec.status === "planned")
  );

  if (isAlreadyReserved) {
    throw new Error("ERR_FORMATION_ALREADY_ASSIGNED: 対象編成は既に他の運行で予約・運行中です。");
  }

  // Topology / Placement eligibility checks
  const startStop = route.stops?.[0];
  if (!startStop) {
    throw new Error("ERR_INVALID_ROUTE: 経路に停車地点がありません。");
  }

  if (placement.stationId !== startStop.stationId) {
    throw new Error(
      `ERR_PLACEMENT_STATION_MISMATCH: 配置駅（${placement.stationId}）が運行経路の始発駅（${startStop.stationId}）と一致しません。`
    );
  }

  if (placement.trackId !== startStop.trackId) {
    throw new Error(
      `ERR_PLACEMENT_TRACK_MISMATCH: 配置線路（${placement.trackId}）が運行経路の始発線路（${startStop.trackId}）と一致しません。`
    );
  }

  const firstLeg = route.legs?.[0];
  if (firstLeg && firstLeg.tracks && firstLeg.tracks.length > 0) {
    const initialDir = firstLeg.tracks[0].direction;
    if (placement.orientation !== initialDir) {
      throw new Error(
        `ERR_PLACEMENT_ORIENTATION_MISMATCH: 編成の配置向き（${placement.orientation}）が運行経路の進行方向（${initialDir}）と逆向きです。`
      );
    }
  }

  return { operation, route, formation, placement };
}

export function reserveOperationExecution(
  state: MapState,
  input: ReserveOperationExecutionInput
): { execution: OperationExecution; operatingTrain?: OperatingTrain } {
  const { operation, route, formation, placement } = validateOperationExecutionReservation(state, input);

  const execId = input.id || `exec-${state.nextOperationExecutionId++}`;
  const now = state.clock.currentTimeMs;
  const schedTime = input.scheduledDepartureTimeMs ?? now;
  const serviceDate = input.serviceDate || formatServiceDateUtc(schedTime);
  const isImmediate = schedTime <= now;

  const execution: OperationExecution = {
    id: execId,
    operationId: operation.id,
    vehicleDutyId: input.vehicleDutyId,
    formationId: formation.id,
    serviceDate,
    scheduledDepartureTimeMs: schedTime,
    requestedSpeedKph: input.requestedSpeedKph ?? 80,
    dwellSeconds: input.dwellSeconds ?? startDwellFromRoute(route),
    status: isImmediate ? "operating" : "reserved",
    currentStopSequence: 1,
    createdAtGameTimeMs: now,
    updatedAtGameTimeMs: now,
  };

  let operatingTrain: OperatingTrain | undefined;

  if (isImmediate) {
    execution.actualDepartureTimeMs = now;
    operatingTrain = startOperationExecution(state, execution, route, placement, formation);
  }

  state.operationExecutions[execution.id] = execution;
  return { execution, operatingTrain };
}

export function startOperationExecution(
  state: MapState,
  execution: OperationExecution,
  route: Route,
  placement: VehiclePlacement,
  formation: Formation
): OperatingTrain {
  const firstTrackId = route.stops?.[0]?.trackId || route.legs[0]?.tracks[0]?.trackId || placement.trackId;
  const firstDistanceM = route.stops?.[0]?.distanceM || 0;
  const startPos = pointAtTrackDistance(state, firstTrackId, firstDistanceM);

  const initialDwell = execution.dwellSeconds ?? route.stops?.[0]?.dwellSeconds ?? 5;
  const trainId = `operating-train-${state.nextOperatingTrainId++}`;

  const train: OperatingTrain = {
    id: trainId,
    name: formation.name,
    formationId: formation.id,
    routeId: route.id,
    trainRunId: execution.id,
    operationExecutionId: execution.id,
    speedKph: execution.requestedSpeedKph,
    dwellSeconds: initialDwell,
    state: "dwelling",
    legIndex: 0,
    traversalIndex: 0,
    distanceOnTraversalM: 0,
    remainingDwellSeconds: initialDwell,
    position: startPos,
  };

  state.operatingTrains.push(train);
  execution.operatingTrainId = train.id;
  execution.status = "operating";
  execution.actualDepartureTimeMs = execution.actualDepartureTimeMs || state.clock.currentTimeMs;

  // Remove vehicle placement from map
  const placementIndex = state.vehiclePlacements.findIndex((p) => p.id === placement.id);
  if (placementIndex >= 0) {
    state.vehiclePlacements.splice(placementIndex, 1);
  }

  return train;
}

export function cancelOperationExecution(state: MapState, executionId: string): OperationExecution {
  const exec = state.operationExecutions[executionId];
  if (!exec) {
    throw new Error(`ERR_EXECUTION_NOT_FOUND: 指定された運行実行 (${executionId}) が存在しません。`);
  }

  if (exec.status !== "planned" && exec.status !== "reserved") {
    throw new Error("ERR_CANNOT_CANCEL: 運行中または完了済みの運行実行はキャンセルできません。");
  }

  exec.status = "cancelled";
  exec.updatedAtGameTimeMs = state.clock.currentTimeMs;
  return exec;
}

export function revalidateOperationExecutionDeparture(
  state: MapState,
  exec: OperationExecution
): { route: Route; formation: Formation; placement: VehiclePlacement } {
  const op = state.operations[exec.operationId];
  if (!op) {
    throw new Error(`ERR_OPERATION_NOT_FOUND: 運行 (${exec.operationId}) が存在しません。`);
  }

  const route = state.routes[op.routeId];
  if (!route || route.status !== "active") {
    throw new Error(`ERR_ROUTE_NOT_FOUND: 経路 (${op.routeId}) が存在しないか無効です。`);
  }

  const formation = state.fleet.formations.find((f) => f.id === exec.formationId);
  if (!formation || formation.vehicles.length === 0) {
    throw new Error(`ERR_FORMATION_NOT_FOUND: 編成 (${exec.formationId}) が存在しないか空です。`);
  }

  const placement = state.vehiclePlacements.find((p) => p.formationId === exec.formationId);
  if (!placement) {
    throw new Error("ERR_FORMATION_NOT_PLACED: placement-missing (編成が配置されていません。)");
  }

  const startStop = route.stops?.[0];
  if (!startStop) {
    throw new Error("ERR_INVALID_ROUTE: 経路に停車地点がありません。");
  }

  if (placement.stationId !== startStop.stationId) {
    throw new Error(
      `ERR_PLACEMENT_STATION_MISMATCH: start-station-mismatch (配置駅 (${placement.stationId}) が経路始発駅 (${startStop.stationId}) と不一致です。)`
    );
  }

  if (placement.trackId !== startStop.trackId) {
    throw new Error(
      `ERR_PLACEMENT_TRACK_MISMATCH: start-track-mismatch (配置線路 (${placement.trackId}) が経路始発線路 (${startStop.trackId}) と不一致です。)`
    );
  }

  const firstLegTrack = route.legs?.[0]?.tracks?.[0];
  if (firstLegTrack && placement.orientation !== firstLegTrack.direction) {
    throw new Error(
      `ERR_PLACEMENT_ORIENTATION_MISMATCH: orientation-mismatch (配置向き (${placement.orientation}) が進行方向 (${firstLegTrack.direction}) と不一致です。)`
    );
  }

  if (!Number.isFinite(exec.requestedSpeedKph) || exec.requestedSpeedKph <= 0 || exec.requestedSpeedKph > 500) {
    throw new Error("ERR_INVALID_SPEED: 要求速度が無効です。");
  }

  return { route, formation, placement };
}

export function tickOperationExecutions(state: MapState, _elapsedSeconds: number): void {
  const now = state.clock.currentTimeMs;

  // 1. Process due reserved executions -> operating with full revalidation
  const dueExecs = Object.values(state.operationExecutions || {})
    .filter((exec) => exec.status === "reserved" && exec.scheduledDepartureTimeMs <= now)
    .sort((a, b) => a.scheduledDepartureTimeMs - b.scheduledDepartureTimeMs || a.id.localeCompare(b.id));

  for (const exec of dueExecs) {
    try {
      const { route, formation, placement } = revalidateOperationExecutionDeparture(state, exec);
      startOperationExecution(state, exec, route, placement, formation);
    } catch (error) {
      exec.status = "failed";
      exec.failureReason = error instanceof Error ? error.message : "発車処理エラー";
      exec.updatedAtGameTimeMs = now;
    }
  }

  // 2. Handle completed trains
  for (const train of state.operatingTrains) {
    if (train.state !== "completed") continue;

    const execId = train.operationExecutionId || train.trainRunId;
    const exec = execId ? state.operationExecutions[execId] : undefined;
    if (exec && exec.status === "operating") {
      exec.status = "completed";
      exec.completedTimeMs = now;
      exec.updatedAtGameTimeMs = now;
    }

    // Auto-place formation at destination station if space permits
    if (!state.vehiclePlacements.some((p) => p.formationId === train.formationId)) {
      const route = state.routes[train.routeId];
      if (route && route.stops.length >= 2) {
        const lastStop = route.stops.at(-1)!;
        const station = state.stations.find((s) => s.id === lastStop.stationId);
        const targetTrackId = lastStop.trackId;

        if (station && targetTrackId) {
          const stopPoint =
            (lastStop.stopPointId ? station.stopPoints.find((sp) => sp.id === lastStop.stopPointId) : undefined) ||
            station.stopPoints.find((sp) => sp.trackId === targetTrackId) ||
            station.stopPoints[0];
          const formation = state.fleet.formations.find((f) => f.id === train.formationId);

          if (stopPoint && formation && formation.vehicles.length > 0) {
            const centerDistanceM = (stopPoint.startDistanceM + stopPoint.endDistanceM) / 2;
            const { lengthM: formationLengthM } = getFormationLengthM(state.fleet, formation);
            const occupiedStartDistanceM = centerDistanceM - formationLengthM / 2;
            const occupiedEndDistanceM = centerDistanceM + formationLengthM / 2;

            const overlap = state.vehiclePlacements.some(
              (p) =>
                p.trackId === stopPoint.trackId &&
                occupiedStartDistanceM <= p.occupiedEndDistanceM &&
                p.occupiedStartDistanceM <= occupiedEndDistanceM
            );

            if (!overlap && occupiedStartDistanceM >= 0) {
              state.vehiclePlacements.push({
                id: `placement-${train.formationId}`,
                formationId: train.formationId,
                stationId: station.id,
                trackId: stopPoint.trackId,
                centerDistanceM,
                occupiedStartDistanceM,
                occupiedEndDistanceM,
                orientation: "forward",
              });
            }
          }
        }
      }
    }
  }
}

function startDwellFromRoute(route: Route): number {
  return route.stops?.[0]?.dwellSeconds ?? 5;
}

// Backward-compatible wrappers for existing code and tests
export function validateTrainRunCreation(state: MapState, input: any): any {
  // Find or create operation for routeId
  let op = Object.values(state.operations || {}).find((o) => o.routeId === input.routeId);
  if (!op) {
    const route = state.routes[input.routeId];
    if (route) {
      op = {
        id: `op-${input.routeId}`,
        name: `運行 ${route.name}`,
        routeId: route.id,
        calendar: { weekdays: [0, 1, 2, 3, 4, 5, 6] },
        stopTimes: route.stops.map((st) => ({
          routeStopId: st.id,
          departureTime: "08:00:00",
          dayOffset: 0,
        })),
      };
      state.operations[op.id] = op;
    }
  }

  return validateOperationExecutionReservation(state, {
    operationId: op?.id || `op-${input.routeId}`,
    formationId: input.formationId,
    scheduledDepartureTimeMs: input.scheduledDepartureTimeMs,
    requestedSpeedKph: input.requestedSpeedKph,
    dwellSeconds: input.dwellSeconds,
  });
}

export function createTrainRun(state: MapState, input: any): { run: OperationExecution; operatingTrain?: OperatingTrain } {
  let op = Object.values(state.operations || {}).find((o) => o.routeId === input.routeId);
  if (!op) {
    const route = state.routes[input.routeId];
    if (route) {
      op = {
        id: `op-${input.routeId}`,
        name: `運行 ${route.name}`,
        routeId: route.id,
        calendar: { weekdays: [0, 1, 2, 3, 4, 5, 6] },
        stopTimes: route.stops.map((st) => ({
          routeStopId: st.id,
          departureTime: "08:00:00",
          dayOffset: 0,
        })),
      };
      state.operations[op.id] = op;
    }
  }

  const { execution, operatingTrain } = reserveOperationExecution(state, {
    id: input.id,
    operationId: op?.id || `op-${input.routeId}`,
    formationId: input.formationId,
    scheduledDepartureTimeMs: input.scheduledDepartureTimeMs,
    requestedSpeedKph: input.requestedSpeedKph,
    dwellSeconds: input.dwellSeconds,
  });

  return { run: execution, operatingTrain };
}

export const startTrainRunExecution = startOperationExecution as any;
export const cancelTrainRun = cancelOperationExecution as any;
export const revalidateTrainRunDeparture = revalidateOperationExecutionDeparture as any;
export const tickTrainRuns = tickOperationExecutions;
