import type { MapState } from "./model";
import {
  formatTimeWithDayOffset,
  getAbsoluteTimeSeconds,
  type Line,
  type Operation,
  type OperationLineAssignment,
  type OperationStopTime,
  type Route,
  type ServiceCalendar,
  type ServiceSystem,
} from "./serviceModel";

export function validateServiceCalendar(calendar: ServiceCalendar): void {
  if (!calendar || typeof calendar !== "object") {
    throw new Error("ERR_INVALID_CALENDAR: 運行カレンダーが不正です");
  }
  if (!Array.isArray(calendar.weekdays) || calendar.weekdays.length === 0) {
    throw new Error("ERR_INVALID_CALENDAR: 運行曜日を1つ以上指定してください");
  }
  for (const day of calendar.weekdays) {
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      throw new Error(`ERR_INVALID_CALENDAR: 曜日指定が無効です (${day})。0(日)〜6(土)で指定してください`);
    }
  }
  if (calendar.startDate && !Number.isFinite(Date.parse(calendar.startDate))) {
    throw new Error(`ERR_INVALID_CALENDAR: 開始日フォーマットが無効です (${calendar.startDate})`);
  }
  if (calendar.endDate && !Number.isFinite(Date.parse(calendar.endDate))) {
    throw new Error(`ERR_INVALID_CALENDAR: 終了日フォーマットが無効です (${calendar.endDate})`);
  }
  if (calendar.startDate && calendar.endDate && calendar.startDate > calendar.endDate) {
    throw new Error("ERR_INVALID_CALENDAR: 開始日は終了日以前である必要があります");
  }
}

export function validateOperationLineAssignments(
  assignments: OperationLineAssignment[] | undefined,
  lines: Record<string, Line>,
  serviceSystems: Record<string, ServiceSystem>
): void {
  if (!assignments || assignments.length === 0) return;

  const seenLineIds = new Set<string>();
  for (const a of assignments) {
    if (!a || typeof a !== "object" || !a.lineId) {
      throw new Error("ERR_INVALID_ASSIGNMENT: 路線IDが不正です");
    }
    if (seenLineIds.has(a.lineId)) {
      throw new Error(`ERR_DUPLICATE_LINE_ASSIGNMENT: 路線 (${a.lineId}) への重複所属はできません`);
    }
    seenLineIds.add(a.lineId);

    const line = lines[a.lineId];
    if (!line) {
      throw new Error(`ERR_LINE_NOT_FOUND: 所属先路線 (${a.lineId}) が存在しません`);
    }

    if (a.serviceSystemId) {
      const sys = serviceSystems[a.serviceSystemId];
      if (!sys) {
        throw new Error(`ERR_SERVICE_SYSTEM_NOT_FOUND: 所属先系統 (${a.serviceSystemId}) が存在しません`);
      }
      if (sys.lineId !== a.lineId) {
        throw new Error(
          `ERR_SYSTEM_LINE_MISMATCH: 系統「${sys.name}」の親路線 (${sys.lineId}) が指定路線 (${a.lineId}) と一致しません`
        );
      }
    }
  }
}

export function validateOperationStopTimes(stopTimes: OperationStopTime[], route: Route): void {
  if (!stopTimes || !Array.isArray(stopTimes) || stopTimes.length === 0) {
    throw new Error("ERR_INVALID_STOP_TIME_ORDER: 各停車地点の着発時刻が必要です");
  }

  if (stopTimes.length !== route.stops.length) {
    throw new Error(
      `ERR_INVALID_STOP_TIME_ORDER: 経路の停車地点数 (${route.stops.length}) と時刻設定数 (${stopTimes.length}) が一致しません`
    );
  }

  // Ensure all route stops are referenced in exact order
  for (let i = 0; i < route.stops.length; i++) {
    const routeStop = route.stops[i];
    const stTime = stopTimes[i];
    if (stTime.routeStopId !== routeStop.id) {
      throw new Error(
        `ERR_INVALID_STOP_TIME_ORDER: 時刻設定 ${i + 1} の地点ID (${stTime.routeStopId}) が経路地点 (${routeStop.id}) と一致しません`
      );
    }
    if (!Number.isInteger(stTime.dayOffset) || stTime.dayOffset < 0) {
      throw new Error(`ERR_INVALID_STOP_TIME_ORDER: dayOffset は0以上の整数である必要があります (${stTime.dayOffset})`);
    }
  }

  // Monotonic time validation across stops
  let lastDepSec = -1;

  for (let i = 0; i < route.stops.length; i++) {
    const routeStop = route.stops[i];
    const stTime = stopTimes[i];
    const isFirst = i === 0;
    const isLast = i === route.stops.length - 1;

    let arrSec: number | null = null;
    let depSec: number | null = null;

    if (stTime.arrivalTime) {
      arrSec = getAbsoluteTimeSeconds(stTime.arrivalTime, stTime.dayOffset);
    }
    if (stTime.departureTime) {
      depSec = getAbsoluteTimeSeconds(stTime.departureTime, stTime.dayOffset);
    }

    if (isFirst && depSec === null) {
      throw new Error("ERR_INVALID_STOP_TIME_ORDER: 始発駅の発車時刻を指定してください");
    }
    if (isLast && arrSec === null) {
      throw new Error("ERR_INVALID_STOP_TIME_ORDER: 終着駅の到着時刻を指定してください");
    }

    // Pass stop defaults
    if (routeStop.commercialType === "pass") {
      const timeSec = depSec ?? arrSec;
      if (timeSec === null) {
        throw new Error(`ERR_INVALID_STOP_TIME_ORDER: 通過駅「${routeStop.stationId}」の通過時刻を指定してください`);
      }
      arrSec = timeSec;
      depSec = timeSec;
    } else {
      if (!isFirst && arrSec === null) {
        throw new Error(`ERR_INVALID_STOP_TIME_ORDER: 停車駅「${routeStop.stationId}」の到着時刻を指定してください`);
      }
      if (!isLast && depSec === null) {
        throw new Error(`ERR_INVALID_STOP_TIME_ORDER: 停車駅「${routeStop.stationId}」の発車時刻を指定してください`);
      }
    }

    if (arrSec !== null && depSec !== null && arrSec > depSec) {
      throw new Error(
        `ERR_INVALID_STOP_TIME_ORDER: 地点「${routeStop.stationId}」で到着時刻 (${formatTimeWithDayOffset(stTime.arrivalTime, stTime.dayOffset)}) が発車時刻 (${formatTimeWithDayOffset(stTime.departureTime, stTime.dayOffset)}) より後になっています`
      );
    }

    const currentStartSec = arrSec ?? depSec!;
    if (lastDepSec > currentStartSec) {
      throw new Error(
        `ERR_INVALID_STOP_TIME_ORDER: 前地点の発車時刻より後続地点の到着・通過時刻が過去になっています (前: ${lastDepSec}s, 現: ${currentStartSec}s)`
      );
    }

    lastDepSec = depSec ?? arrSec!;
  }
}

export function createOperation(
  state: MapState,
  payload: {
    id?: string;
    name: string;
    operationNumber?: string;
    routeId?: string;
    calendar: ServiceCalendar;
    stopTimes?: OperationStopTime[];
    lineAssignments?: OperationLineAssignment[];
    description?: string;
  }
): { state: MapState; operation: Operation } {
  const name = payload.name.trim();
  if (!name) throw new Error("運行名を入力してください");

  validateServiceCalendar(payload.calendar);
  if (payload.routeId) {
    const route = state.routes[payload.routeId];
    if (!route) throw new Error(`ERR_ROUTE_NOT_FOUND: 指定された経路 (${payload.routeId}) が存在しません`);
    validateOperationStopTimes(payload.stopTimes || [], route);
  } else if (payload.stopTimes && payload.stopTimes.length > 0) {
    throw new Error("ERR_ROUTE_REQUIRED: 経路未設定の運行には時刻を設定できません");
  }
  validateOperationLineAssignments(payload.lineAssignments, state.lines, state.serviceSystems);

  const id = payload.id || `op-${state.nextOperationId++}`;
  if (state.operations[id]) throw new Error(`運行ID ${id} は既に存在します`);

  const now = state.clock.currentTimeMs;
  const operation: Operation = {
    id,
    name,
    operationNumber: payload.operationNumber?.trim() || undefined,
    routeId: payload.routeId,
    calendar: structuredClone(payload.calendar),
    stopTimes: structuredClone(payload.stopTimes || []),
    lineAssignments: payload.lineAssignments ? structuredClone(payload.lineAssignments) : undefined,
    description: payload.description?.trim() || undefined,
    requiresReview: false,
    createdAtGameTimeMs: now,
    updatedAtGameTimeMs: now,
  };

  state.operations[id] = operation;
  return { state, operation };
}

export function updateOperation(
  state: MapState,
  payload: {
    id: string;
    name?: string;
    operationNumber?: string;
    routeId?: string;
    calendar?: ServiceCalendar;
    stopTimes?: OperationStopTime[];
    lineAssignments?: OperationLineAssignment[];
    description?: string;
    markReviewed?: boolean;
  }
): { state: MapState; operation: Operation } {
  const operation = state.operations[payload.id];
  if (!operation) {
    throw new Error(`ERR_OPERATION_NOT_FOUND: 指定された運行 (${payload.id}) が存在しません`);
  }

  const targetRouteId = payload.routeId ?? operation.routeId;
  const route = targetRouteId ? state.routes[targetRouteId] : undefined;
  if (targetRouteId && !route) {
    throw new Error(`ERR_ROUTE_NOT_FOUND: 指定された経路 (${targetRouteId}) が存在しません`);
  }

  if (payload.name !== undefined) {
    const name = payload.name.trim();
    if (!name) throw new Error("運行名を空にすることはできません");
    operation.name = name;
  }
  if (payload.operationNumber !== undefined) {
    operation.operationNumber = payload.operationNumber.trim() || undefined;
  }
  if (payload.description !== undefined) {
    operation.description = payload.description.trim() || undefined;
  }
  if (payload.routeId !== undefined) {
    operation.routeId = payload.routeId;
  }
  if (payload.calendar !== undefined) {
    validateServiceCalendar(payload.calendar);
    operation.calendar = structuredClone(payload.calendar);
  }
  if (payload.stopTimes !== undefined) {
    if (!route) throw new Error("ERR_ROUTE_REQUIRED: 時刻設定には経路が必要です");
    validateOperationStopTimes(payload.stopTimes, route);
    operation.stopTimes = structuredClone(payload.stopTimes);
  } else if (payload.routeId !== undefined) {
    if (!route) throw new Error("ERR_ROUTE_REQUIRED: 経路が必要です");
    validateOperationStopTimes(operation.stopTimes, route);
  }
  if (payload.lineAssignments !== undefined) {
    validateOperationLineAssignments(payload.lineAssignments, state.lines, state.serviceSystems);
    operation.lineAssignments = structuredClone(payload.lineAssignments);
  }

  if (payload.markReviewed === true) {
    operation.requiresReview = false;
  }

  operation.updatedAtGameTimeMs = state.clock.currentTimeMs;
  return { state, operation };
}

export function assignOperationClassification(
  state: MapState,
  payload: {
    operationId: string;
    lineId: string;
    serviceSystemId?: string;
  }
): { state: MapState; operation: Operation } {
  const operation = state.operations[payload.operationId];
  if (!operation) {
    throw new Error(`ERR_OPERATION_NOT_FOUND: 指定された運行 (${payload.operationId}) が存在しません`);
  }
  const currentAssignments = operation.lineAssignments ? [...operation.lineAssignments] : [];
  const existingIdx = currentAssignments.findIndex((a) => a.lineId === payload.lineId);
  if (existingIdx >= 0) {
    currentAssignments[existingIdx] = {
      lineId: payload.lineId,
      serviceSystemId: payload.serviceSystemId,
    };
  } else {
    currentAssignments.push({
      lineId: payload.lineId,
      serviceSystemId: payload.serviceSystemId,
    });
  }
  validateOperationLineAssignments(currentAssignments, state.lines, state.serviceSystems);
  operation.lineAssignments = currentAssignments;
  operation.updatedAtGameTimeMs = state.clock.currentTimeMs;
  return { state, operation };
}

export function unassignOperationClassification(
  state: MapState,
  payload: {
    operationId: string;
    lineId: string;
  }
): { state: MapState; operation: Operation } {
  const operation = state.operations[payload.operationId];
  if (!operation) {
    throw new Error(`ERR_OPERATION_NOT_FOUND: 指定された運行 (${payload.operationId}) が存在しません`);
  }
  if (operation.lineAssignments) {
    operation.lineAssignments = operation.lineAssignments.filter((a) => a.lineId !== payload.lineId);
    if (operation.lineAssignments.length === 0) {
      operation.lineAssignments = undefined;
    }
  }
  operation.updatedAtGameTimeMs = state.clock.currentTimeMs;
  return { state, operation };
}

export function deleteOperation(state: MapState, operationId: string): { state: MapState } {
  const operation = state.operations[operationId];
  if (!operation) {
    throw new Error(`ERR_OPERATION_NOT_FOUND: 指定された運行 (${operationId}) が存在しません`);
  }

  // Check if any VehicleDuty references this operation
  const referencingDuties = Object.values(state.vehicleDuties || {}).filter((duty) =>
    duty.assignments?.some((a) => a.operationId === operationId)
  );
  if (referencingDuties.length > 0) {
    const dutyNames = referencingDuties.map((d) => `「${d.name}」`).join(", ");
    throw new Error(`ERR_REFERENCED_BY_DUTY: 運行「${operation.name}」は運用 ${dutyNames} から参照されているため削除できません`);
  }

  delete state.operations[operationId];
  return { state };
}

export function duplicateOperation(
  state: MapState,
  payload: {
    sourceOperationId: string;
    name?: string;
    timeShiftMinutes?: number;
  }
): { state: MapState; operation: Operation } {
  const source = state.operations[payload.sourceOperationId];
  if (!source) {
    throw new Error(`ERR_OPERATION_NOT_FOUND: 複製元の運行 (${payload.sourceOperationId}) が存在しません`);
  }

  const shiftMinutes = payload.timeShiftMinutes ?? 60;
  const shiftSeconds = shiftMinutes * 60;

  const shiftedStopTimes: OperationStopTime[] = source.stopTimes.map((st) => {
    const shiftTime = (timeStr?: string, dayOffset = 0): { timeStr?: string; dayOffset: number } => {
      if (!timeStr) return { dayOffset };
      const totalSec = getAbsoluteTimeSeconds(timeStr, dayOffset) + shiftSeconds;
      const newDayOffset = Math.floor(totalSec / 86400);
      const remSec = totalSec % 86400;
      const h = String(Math.floor(remSec / 3600)).padStart(2, "0");
      const m = String(Math.floor((remSec % 3600) / 60)).padStart(2, "0");
      const s = String(remSec % 60).padStart(2, "0");
      return { timeStr: `${h}:${m}:${s}`, dayOffset: newDayOffset };
    };

    const arr = shiftTime(st.arrivalTime, st.dayOffset);
    const dep = shiftTime(st.departureTime, st.dayOffset);
    const effDayOffset = dep.timeStr ? dep.dayOffset : arr.dayOffset;

    return {
      routeStopId: st.routeStopId,
      arrivalTime: arr.timeStr,
      departureTime: dep.timeStr,
      dayOffset: effDayOffset,
    };
  });

  const name = payload.name?.trim() || `${source.name} (複製)`;

  return createOperation(state, {
    name,
    routeId: source.routeId,
    calendar: structuredClone(source.calendar),
    stopTimes: shiftedStopTimes,
    lineAssignments: source.lineAssignments ? structuredClone(source.lineAssignments) : undefined,
    description: source.description,
  });
}
