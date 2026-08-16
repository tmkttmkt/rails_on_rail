import type { MapState } from "./model";
import {
  getAbsoluteTimeSeconds,
  type Operation,
  type Route,
  type VehicleDuty,
  type VehicleDutyAssignment,
  type VehicleDutyExecution,
} from "./serviceModel";

export function validateDutyContinuity(
  assignments: VehicleDutyAssignment[],
  operations: Record<string, Operation>,
  routes: Record<string, Route>
): void {
  if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
    throw new Error("ERR_INVALID_DUTY: 運用には1つ以上の運行割り当てが必要です");
  }

  // Check sequence numbering
  const sorted = [...assignments].sort((a, b) => a.sequence - b.sequence);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].sequence !== i + 1) {
      throw new Error(`ERR_INVALID_DUTY: 運用の運行順序が連続していません (${sorted[i].sequence} !== ${i + 1})`);
    }
    if (!Number.isInteger(sorted[i].serviceDayOffset) || sorted[i].serviceDayOffset < 0) {
      throw new Error(`ERR_INVALID_DUTY: serviceDayOffset は0以上の整数である必要があります (${sorted[i].serviceDayOffset})`);
    }
    const op = operations[sorted[i].operationId];
    if (!op) {
      throw new Error(`ERR_OPERATION_NOT_FOUND: 運行 (${sorted[i].operationId}) が存在しません`);
    }
    const route = routes[op.routeId];
    if (!route) {
      throw new Error(`ERR_ROUTE_NOT_FOUND: 運行の参照経路 (${op.routeId}) が存在しません`);
    }
  }

  // Check continuity and time sequence between consecutive duty operations
  for (let i = 0; i < sorted.length - 1; i++) {
    const curAssign = sorted[i];
    const nextAssign = sorted[i + 1];

    const curOp = operations[curAssign.operationId];
    const nextOp = operations[nextAssign.operationId];

    const curRoute = routes[curOp.routeId];
    const nextRoute = routes[nextOp.routeId];

    const curLastStop = curRoute.stops.at(-1)!;
    const nextFirstStop = nextRoute.stops[0];

    // Same Station & Same Track Continuity Check
    if (curLastStop.stationId !== nextFirstStop.stationId) {
      throw new Error(
        `ERR_DUTY_LOCATION_DISCONTINUITY: 前運行「${curOp.name}」の終着駅 (${curLastStop.stationId}) と次運行「${nextOp.name}」の始発駅 (${nextFirstStop.stationId}) が一致しません`
      );
    }
    if (curLastStop.trackId !== nextFirstStop.trackId) {
      throw new Error(
        `ERR_DUTY_LOCATION_DISCONTINUITY: 前運行「${curOp.name}」の終着番線・線路 (${curLastStop.trackId}) と次運行「${nextOp.name}」の始発番線・線路 (${nextFirstStop.trackId}) が一致しません`
      );
    }

    // Time ordering check across serviceDayOffset and stopTime dayOffsets
    const curLastStopTime = curOp.stopTimes.find((st) => st.routeStopId === curLastStop.id) || curOp.stopTimes.at(-1);
    const nextFirstStopTime = nextOp.stopTimes.find((st) => st.routeStopId === nextFirstStop.id) || nextOp.stopTimes[0];

    if (curLastStopTime && nextFirstStopTime) {
      const curEndSec =
        curAssign.serviceDayOffset * 86400 +
        getAbsoluteTimeSeconds(curLastStopTime.arrivalTime || curLastStopTime.departureTime, curLastStopTime.dayOffset);

      const nextStartSec =
        nextAssign.serviceDayOffset * 86400 +
        getAbsoluteTimeSeconds(nextFirstStopTime.departureTime || nextFirstStopTime.arrivalTime, nextFirstStopTime.dayOffset);

      if (curEndSec > nextStartSec) {
        throw new Error(
          `ERR_DUTY_OPERATION_OVERLAP: 運用内で前運行の終着時刻 (${curEndSec}s) が次運行の始発時刻 (${nextStartSec}s) より後になっています`
        );
      }
    }
  }
}

export function createVehicleDuty(
  state: MapState,
  payload: {
    id?: string;
    name: string;
    assignments: VehicleDutyAssignment[];
    defaultFormationId?: string;
  }
): { state: MapState; vehicleDuty: VehicleDuty } {
  const name = payload.name.trim();
  if (!name) throw new Error("運用名を入力してください");

  validateDutyContinuity(payload.assignments, state.operations, state.routes);

  if (payload.defaultFormationId) {
    const formation = state.fleet.formations.find((f) => f.id === payload.defaultFormationId);
    if (!formation) {
      throw new Error(`ERR_FORMATION_NOT_FOUND: 指定された編成 (${payload.defaultFormationId}) が存在しません`);
    }
  }

  const id = payload.id || `duty-${state.nextVehicleDutyId++}`;
  if (state.vehicleDuties[id]) throw new Error(`運用ID ${id} は既に存在します`);

  const now = state.clock.currentTimeMs;
  const vehicleDuty: VehicleDuty = {
    id,
    name,
    assignments: structuredClone(payload.assignments),
    defaultFormationId: payload.defaultFormationId || undefined,
    createdAtGameTimeMs: now,
    updatedAtGameTimeMs: now,
  };

  state.vehicleDuties[id] = vehicleDuty;
  return { state, vehicleDuty };
}

export function updateVehicleDuty(
  state: MapState,
  payload: {
    id: string;
    name?: string;
    assignments?: VehicleDutyAssignment[];
    defaultFormationId?: string;
  }
): { state: MapState; vehicleDuty: VehicleDuty } {
  const duty = state.vehicleDuties[payload.id];
  if (!duty) {
    throw new Error(`ERR_VEHICLE_DUTY_NOT_FOUND: 指定された運用 (${payload.id}) が存在しません`);
  }

  if (payload.name !== undefined) {
    const name = payload.name.trim();
    if (!name) throw new Error("運用名を空にすることはできません");
    duty.name = name;
  }

  if (payload.assignments !== undefined) {
    validateDutyContinuity(payload.assignments, state.operations, state.routes);
    duty.assignments = structuredClone(payload.assignments);
  }

  if (payload.defaultFormationId !== undefined) {
    if (payload.defaultFormationId) {
      const formation = state.fleet.formations.find((f) => f.id === payload.defaultFormationId);
      if (!formation) {
        throw new Error(`ERR_FORMATION_NOT_FOUND: 指定された編成 (${payload.defaultFormationId}) が存在しません`);
      }
    }
    duty.defaultFormationId = payload.defaultFormationId || undefined;
  }

  duty.updatedAtGameTimeMs = state.clock.currentTimeMs;
  return { state, vehicleDuty: duty };
}

export function deleteVehicleDuty(state: MapState, dutyId: string): { state: MapState } {
  const duty = state.vehicleDuties[dutyId];
  if (!duty) {
    throw new Error(`ERR_VEHICLE_DUTY_NOT_FOUND: 指定された運用 (${dutyId}) が存在しません`);
  }

  // Check if active execution references this duty
  const activeRuns = Object.values(state.operationExecutions || {}).filter(
    (exec) => exec.vehicleDutyId === dutyId && (exec.status === "reserved" || exec.status === "operating")
  );
  if (activeRuns.length > 0) {
    throw new Error("ERR_REFERENCED_BY_ACTIVE_RUN: 運用には運行中または予約済みの列車が存在するため削除できません");
  }

  delete state.vehicleDuties[dutyId];
  return { state };
}

export function assignDutyFormation(state: MapState, dutyId: string, formationId?: string): { state: MapState; vehicleDuty: VehicleDuty } {
  return updateVehicleDuty(state, { id: dutyId, defaultFormationId: formationId });
}

export function createVehicleDutyExecution(
  state: MapState,
  payload: {
    id?: string;
    vehicleDutyId: string;
    serviceDate: string;
    formationId?: string;
    cancelledOperationIds?: string[];
  }
): { state: MapState; execution: VehicleDutyExecution } {
  const duty = state.vehicleDuties[payload.vehicleDutyId];
  if (!duty) {
    throw new Error(`ERR_VEHICLE_DUTY_NOT_FOUND: 指定された運用 (${payload.vehicleDutyId}) が存在しません`);
  }

  if (payload.formationId) {
    const formation = state.fleet.formations.find((f) => f.id === payload.formationId);
    if (!formation) {
      throw new Error(`ERR_FORMATION_NOT_FOUND: 差し替え指定された編成 (${payload.formationId}) が存在しません`);
    }
  }

  const id = payload.id || `duty-exec-${state.nextVehicleDutyExecutionId++}`;
  const now = state.clock.currentTimeMs;

  const execution: VehicleDutyExecution = {
    id,
    vehicleDutyId: payload.vehicleDutyId,
    serviceDate: payload.serviceDate,
    formationId: payload.formationId,
    cancelledOperationIds: payload.cancelledOperationIds ? [...payload.cancelledOperationIds] : undefined,
    createdAtGameTimeMs: now,
    updatedAtGameTimeMs: now,
  };

  state.vehicleDutyExecutions[id] = execution;
  return { state, execution };
}

export function replaceDutyExecutionFormation(
  state: MapState,
  vehicleDutyId: string,
  serviceDate: string,
  formationId?: string
): { state: MapState; execution: VehicleDutyExecution } {
  let exec = Object.values(state.vehicleDutyExecutions || {}).find(
    (e) => e.vehicleDutyId === vehicleDutyId && e.serviceDate === serviceDate
  );

  if (exec) {
    if (formationId) {
      const formation = state.fleet.formations.find((f) => f.id === formationId);
      if (!formation) throw new Error(`ERR_FORMATION_NOT_FOUND: 指定された編成 (${formationId}) が存在しません`);
    }
    exec.formationId = formationId;
    exec.updatedAtGameTimeMs = state.clock.currentTimeMs;
    return { state, execution: exec };
  }

  return createVehicleDutyExecution(state, {
    vehicleDutyId,
    serviceDate,
    formationId,
  });
}

export function cancelDutyExecutionOperation(
  state: MapState,
  vehicleDutyId: string,
  serviceDate: string,
  operationId: string
): { state: MapState; execution: VehicleDutyExecution } {
  let exec = Object.values(state.vehicleDutyExecutions || {}).find(
    (e) => e.vehicleDutyId === vehicleDutyId && e.serviceDate === serviceDate
  );

  if (!exec) {
    const res = createVehicleDutyExecution(state, { vehicleDutyId, serviceDate, cancelledOperationIds: [operationId] });
    return res;
  }

  exec.cancelledOperationIds = exec.cancelledOperationIds || [];
  if (!exec.cancelledOperationIds.includes(operationId)) {
    exec.cancelledOperationIds.push(operationId);
  }
  exec.updatedAtGameTimeMs = state.clock.currentTimeMs;
  return { state, execution: exec };
}

/**
 * Returns effective formation ID for a vehicle duty on a given date.
 */
export function getEffectiveFormationForDutyDate(
  state: MapState,
  dutyId: string,
  serviceDate: string
): string | undefined {
  const exec = Object.values(state.vehicleDutyExecutions || {}).find(
    (e) => e.vehicleDutyId === dutyId && e.serviceDate === serviceDate
  );
  if (exec && exec.formationId) {
    return exec.formationId;
  }
  return state.vehicleDuties[dutyId]?.defaultFormationId;
}
