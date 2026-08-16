import { trackCatalog } from "../data/trackCatalog";
import { vehicleCatalog } from "../data/vehicleCatalog";
import { createInitialFleetState } from "./fleet";
import { analyzeLine, createParallelLines, recommendedCantMm, sampleTrack } from "./geometry";
import {
  SIMULATION_SPEEDS,
  createInitialClock,
  type MapState,
  type Point,
  type Track,
  type VehiclePlacement,
} from "./model";
import { formatServiceDateUtc, getAbsoluteTimeSeconds } from "./serviceModel";

export interface SaveMetadata { name: string; createdAt: string; updatedAt: string }
export interface SaveFile { formatVersion: 1; metadata: SaveMetadata; state: MapState }
export interface SaveSlot extends SaveFile { id: string }

export function serializeMapState(state: MapState): string {
  validateMapState(state);
  return JSON.stringify(state, null, 2);
}

export function parseMapState(json: string): MapState {
  return coerceMapState(parseJson(json));
}

export function createSaveFile(name: string, state: MapState, createdAt = new Date().toISOString(), updatedAt = createdAt): SaveFile {
  const normalizedName = validateSaveName(name);
  validateTimestamp(createdAt);
  validateTimestamp(updatedAt);
  validateMapState(state);
  return { formatVersion: 1, metadata: { name: normalizedName, createdAt, updatedAt }, state: structuredClone(state) };
}

export function serializeSaveFile(save: SaveFile): string {
  validateSaveEnvelope(save);
  validateMapState(save.state);
  return JSON.stringify(save, null, 2);
}

export function parseSaveFile(json: string, legacyName = "取り込んだマップ"): SaveFile {
  const value = parseJson(json);
  if (isRecord(value) && value.formatVersion !== undefined) {
    validateSaveEnvelope(value);
    return { formatVersion: 1, metadata: structuredClone(value.metadata), state: coerceMapState(value.state) };
  }
  return createSaveFile(legacyName, coerceMapState(value));
}

export function validateSaveName(name: string): string {
  const normalized = name.trim();
  if (normalized.length < 1 || normalized.length > 80) throw new Error("セーブ名は1〜80文字で入力してください");
  return normalized;
}

function parseJson(json: string): unknown {
  try { return JSON.parse(json); } catch { throw new Error("セーブデータが正しいJSONではありません"); }
}

function validateSaveEnvelope(value: unknown): asserts value is { formatVersion: 1; metadata: SaveMetadata; state: unknown } {
  if (!isRecord(value) || value.formatVersion !== 1) throw new Error(`対応していないセーブファイル形式です: ${String(isRecord(value) ? value.formatVersion : undefined)}`);
  if (!isRecord(value.metadata) || typeof value.metadata.name !== "string") throw new Error("セーブの管理情報が正しくありません");
  validateSaveName(value.metadata.name);
  if (typeof value.metadata.createdAt !== "string" || typeof value.metadata.updatedAt !== "string") throw new Error("セーブ日時が正しくありません");
  validateTimestamp(value.metadata.createdAt);
  validateTimestamp(value.metadata.updatedAt);
}

function validateTimestamp(value: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new Error("セーブ日時が正しくありません");
}

function coerceMapState(value: unknown): MapState {
  if (!isRecord(value)) throw new Error("セーブデータの形式が正しくありません");
  if (value.version === 1) return migrateVersion1(value);
  if (value.version === 2) return migrateVersion2(value);
  if (value.version === 3) return migrateVersion3(value);
  if (value.version === 4) return migrateVersion4(value);
  if (value.version === 5) return migrateVersion5(value);
  if (value.version === 6) return migrateVersion6(value);
  if (value.version === 7) return migrateVersion7(value);
  if (value.version === 8) return migrateVersion8(value);
  if (value.version === 9) return migrateVersion9(value);
  if (value.version === 10) return migrateVersion10(value);
  validateMapState(value);
  return structuredClone(value);
}

export function validateMapState(value: unknown): asserts value is MapState {
  if (!isRecord(value)) throw new Error("セーブデータの形式が正しくありません");
  if (value.version !== 11) throw new Error(`対応していないセーブ形式です: ${String(value.version)}`);
  if (!isRecord(value.clock) || !Number.isSafeInteger(value.clock.currentTimeMs) || Math.abs(value.clock.currentTimeMs as number) > 8_640_000_000_000_000 || typeof value.clock.paused !== "boolean" || !(SIMULATION_SPEEDS as readonly unknown[]).includes(value.clock.speedMultiplier)) throw new Error("ゲーム内時計が正しくありません");
  if (!Number.isInteger(value.nextTrackId) || (value.nextTrackId as number) < 1) throw new Error("次の線路IDが正しくありません");
  if (!Number.isInteger(value.nextTrackGroupId) || (value.nextTrackGroupId as number) < 1) throw new Error("次の線路群IDが正しくありません");
  if (!Number.isInteger(value.nextJunctionId) || (value.nextJunctionId as number) < 1) throw new Error("次の接続点IDが正しくありません");
  if (!Number.isInteger(value.nextStationId) || (value.nextStationId as number) < 1) throw new Error("次の駅IDが正しくありません");
  if (!Number.isInteger(value.nextLineId) || (value.nextLineId as number) < 1) throw new Error("次の路線IDが正しくありません");
  if (!Number.isInteger(value.nextServiceSystemId) || (value.nextServiceSystemId as number) < 1) throw new Error("次の系統IDが正しくありません");
  if (!Number.isInteger(value.nextRouteId) || (value.nextRouteId as number) < 1) throw new Error("次の経路IDが正しくありません");
  if (!Number.isInteger(value.nextOperationId) || (value.nextOperationId as number) < 1) throw new Error("次の運行IDが正しくありません");
  if (!Number.isInteger(value.nextVehicleDutyId) || (value.nextVehicleDutyId as number) < 1) throw new Error("次の運用IDが正しくありません");
  if (!Number.isInteger(value.nextVehicleDutyExecutionId) || (value.nextVehicleDutyExecutionId as number) < 1) throw new Error("次の運用実施IDが正しくありません");
  if (!Number.isInteger(value.nextOperationExecutionId) || (value.nextOperationExecutionId as number) < 1) throw new Error("次の運行実行IDが正しくありません");
  if (!Number.isInteger(value.nextOperatingTrainId) || (value.nextOperatingTrainId as number) < 1) throw new Error("次の運行列車IDが正しくありません");
  if (!Number.isInteger(value.nextOperatorClassId) || (value.nextOperatorClassId as number) < 1) throw new Error("次の運行会社形式IDが正しくありません");
  if (!Number.isInteger(value.nextVehicleUnitId) || (value.nextVehicleUnitId as number) < 1) throw new Error("次の車両個体IDが正しくありません");
  if (!Number.isInteger(value.nextFormationId) || (value.nextFormationId as number) < 1) throw new Error("次の編成IDが正しくありません");

  if (!Array.isArray(value.tracks) || !Array.isArray(value.trackGroups) || !Array.isArray(value.junctions) || !Array.isArray(value.stations) || !Array.isArray(value.operatingTrains)) throw new Error("地図または運行の一覧がありません");
  if (!isRecord(value.fleet) || !Array.isArray(value.fleet.operatorClasses) || !Array.isArray(value.fleet.vehicleUnits) || !Array.isArray(value.fleet.formations) || !Array.isArray(value.fleet.trains)) throw new Error("車両状態が正しくありません");
  if (!Array.isArray(value.vehiclePlacements)) throw new Error("車両配置の一覧がありません");
  if (!isRecord(value.lines) || !isRecord(value.serviceSystems) || !isRecord(value.routes) || !isRecord(value.operations) || !isRecord(value.vehicleDuties) || !isRecord(value.vehicleDutyExecutions) || !isRecord(value.operationExecutions)) throw new Error("路線・系統・運行モデルの構造が正しくありません");

  const ids = new Set<string>();
  for (const item of value.tracks) validateTrack(item, ids);
  const junctionIds = new Set<string>();
  for (const junction of value.junctions) {
    if (!isRecord(junction) || typeof junction.id !== "string" || junctionIds.has(junction.id) || !isPoint(junction.position) || !Array.isArray(junction.ports) || junction.ports.length < 2) throw new Error("接続点が正しくありません");
    junctionIds.add(junction.id);
    const portTrackIds = new Set<string>();
    for (const port of junction.ports) {
      if (!isRecord(port) || typeof port.trackId !== "string" || !ids.has(port.trackId) || !["start", "end", "interior"].includes(port.location) || !isFiniteNumber(port.distanceM) || port.distanceM < 0) throw new Error(`${junction.id}の接続口が正しくありません`);
      if (portTrackIds.has(port.trackId)) throw new Error(`${junction.id}に同じ線路が重複しています`);
      portTrackIds.add(port.trackId);
    }
  }
  for (const item of value.tracks as Track[]) for (const connection of [item.startConnection, item.endConnection]) {
    if (connection && !ids.has(connection.trackId)) throw new Error(`接続先線路が存在しません: ${connection.trackId}`);
    if (connection && !connection.junctionId) throw new Error(`${item.id}の接続点情報がありません`);
    if (connection?.junctionId && !junctionIds.has(connection.junctionId)) throw new Error(`接続点が存在しません: ${connection.junctionId}`);
    if (connection?.junctionId) {
      const junction = value.junctions.find((candidate: any) => candidate.id === connection.junctionId);
      if (!junction.ports.some((port: any) => port.trackId === item.id) || !junction.ports.some((port: any) => port.trackId === connection.trackId)) throw new Error(`${item.id}の接続点に参加線路がありません`);
    }
  }
  const grouped = new Set<string>();
  const groupIds = new Set<string>();
  for (const group of value.trackGroups) {
    if (!isRecord(group) || typeof group.id !== "string" || typeof group.name !== "string" || !Array.isArray(group.trackIds) || group.trackIds.length < 2 || !group.trackIds.every((id) => typeof id === "string")) throw new Error("線路群が正しくありません");
    if (groupIds.has(group.id)) throw new Error(`線路群IDが重複しています: ${group.id}`);
    groupIds.add(group.id);
    for (const id of group.trackIds) {
      if (!ids.has(id)) throw new Error(`線路群の線路が存在しません: ${id}`);
      if (grouped.has(id)) throw new Error(`${id}が複数の線路群へ所属しています`);
      grouped.add(id);
    }
  }
  const stationIds = new Set<string>();
  const allStopPointIds = new Set<string>();
  for (const station of value.stations) {
    if (!isRecord(station) || typeof station.id !== "string" || stationIds.has(station.id) || typeof station.name !== "string" || station.name.trim().length < 1 || station.name.length > 60 || !isPoint(station.position) || !Array.isArray(station.stopPoints) || station.stopPoints.length < 1) throw new Error("駅が正しくありません");
    stationIds.add(station.id);
    const stopTrackIds = new Set<string>();
    for (const stopPoint of station.stopPoints) {
      if (!isRecord(stopPoint) || typeof stopPoint.id !== "string" || typeof stopPoint.trackId !== "string" || !ids.has(stopPoint.trackId) || !isFiniteNumber(stopPoint.startDistanceM) || stopPoint.startDistanceM < 0 || !isFiniteNumber(stopPoint.endDistanceM) || stopPoint.endDistanceM <= stopPoint.startDistanceM || !isPoint(stopPoint.startPosition) || !isPoint(stopPoint.endPosition) || stopPoint.direction !== "both") throw new Error(`${station.id}の停車地点が正しくありません`);
      if (stopTrackIds.has(stopPoint.trackId)) throw new Error(`${station.id}に同じ線路の停車地点が重複しています`);
      if (allStopPointIds.has(stopPoint.id)) throw new Error(`停車地点IDが重複しています: ${stopPoint.id}`);
      stopTrackIds.add(stopPoint.trackId);
      allStopPointIds.add(stopPoint.id);
      const track = (value.tracks as Track[]).find((item) => item.id === stopPoint.trackId)!;
      if (stopPoint.endDistanceM > analyzeLine(sampleTrack(track)).lengthM + 0.001) throw new Error(`${station.id}の停車地点距離が線路長を超えています`);
    }
  }
  assertNextIdIsUnused(value.nextTrackId as number, ids, "track-", "次の線路ID");
  assertNextIdIsUnused(value.nextTrackGroupId as number, groupIds, "track-group-", "次の線路群ID");
  assertNextIdIsUnused(value.nextJunctionId as number, junctionIds, "junction-", "次の接続点ID");
  assertNextIdIsUnused(value.nextStationId as number, stationIds, "station-", "次の駅ID");

  // Fleet Validation
  const operatorClassIds = new Set<string>();
  const operatorIdNumbers = new Set<string>();
  for (const opClass of value.fleet.operatorClasses) {
    if (!isRecord(opClass) || typeof opClass.id !== "string" || typeof opClass.operatorId !== "string" || typeof opClass.className !== "string" || typeof opClass.baseVehicleDesignId !== "string") throw new Error("運行会社形式が正しくありません");
    if (operatorClassIds.has(opClass.id)) throw new Error(`運行会社形式IDが重複しています: ${opClass.id}`);
    operatorClassIds.add(opClass.id);
    vehicleCatalog.getVehicleDesign(opClass.baseVehicleDesignId);
    if (opClass.connectionOverrides) {
      if (!isRecord(opClass.connectionOverrides)) throw new Error("接続オーバーライドが正しくありません");
      for (const end of Object.values(opClass.connectionOverrides)) {
        if (end) vehicleCatalog.validateConnectionEnd(end as any, "運行会社形式の接続端");
      }
    }
  }

  const vehicleUnitIds = new Set<string>();
  for (const unit of value.fleet.vehicleUnits) {
    if (!isRecord(unit) || typeof unit.id !== "string" || typeof unit.operatorClassId !== "string" || typeof unit.operatorNumber !== "string") throw new Error("車両個体が正しくありません");
    if (vehicleUnitIds.has(unit.id)) throw new Error(`車両個体IDが重複しています: ${unit.id}`);
    if (!operatorClassIds.has(unit.operatorClassId)) throw new Error(`車両個体の運行会社形式が存在しません: ${unit.operatorClassId}`);
    const opClass = value.fleet.operatorClasses.find((c: any) => c.id === unit.operatorClassId);
    const key = `${opClass.operatorId}:${unit.operatorNumber}`;
    if (operatorIdNumbers.has(key)) throw new Error(`運行会社車両番号が重複しています: ${unit.operatorNumber}`);
    operatorIdNumbers.add(key);
    vehicleUnitIds.add(unit.id);
  }

  const formationIds = new Set<string>();
  const assignedVehicleIds = new Set<string>();
  for (const formation of value.fleet.formations) {
    if (!isRecord(formation) || typeof formation.id !== "string" || typeof formation.name !== "string" || !Array.isArray(formation.vehicles) || !Array.isArray(formation.warnings)) throw new Error("編成が正しくありません");
    if (formationIds.has(formation.id)) throw new Error(`編成IDが重複しています: ${formation.id}`);
    formationIds.add(formation.id);
    for (const v of formation.vehicles) {
      if (!isRecord(v) || typeof v.vehicleId !== "string" || !["forward", "reversed"].includes(v.orientation)) throw new Error("編成内車両が正しくありません");
      if (!vehicleUnitIds.has(v.vehicleId)) throw new Error(`編成内車両が存在しません: ${v.vehicleId}`);
      if (assignedVehicleIds.has(v.vehicleId)) throw new Error(`車両が複数の編成へ重複所属しています: ${v.vehicleId}`);
      assignedVehicleIds.add(v.vehicleId);
    }
  }

  assertNextIdIsUnused(value.nextOperatorClassId as number, operatorClassIds, "class-", "次の運行会社形式ID");
  assertNextIdIsUnused(value.nextVehicleUnitId as number, vehicleUnitIds, "vehicle-", "次の車両個体ID");
  assertNextIdIsUnused(value.nextFormationId as number, formationIds, "formation-", "次の編成ID");

  // Validate Line, ServiceSystem, Route, Operation, VehicleDuty, VehicleDutyExecution, OperationExecution
  const lineIds = new Set(Object.keys(value.lines));
  const serviceSystemIds = new Set(Object.keys(value.serviceSystems));
  const routeIds = new Set(Object.keys(value.routes));
  const operationIds = new Set(Object.keys(value.operations));
  const vehicleDutyIds = new Set(Object.keys(value.vehicleDuties));

  for (const [lineId, line] of Object.entries(value.lines)) {
    if (!isRecord(line) || line.id !== lineId || typeof line.name !== "string" || typeof line.color !== "string" || !Number.isFinite(line.displayOrder)) {
      throw new Error(`路線 ${lineId} の情報が正しくありません`);
    }
  }

  for (const [sysId, sys] of Object.entries(value.serviceSystems)) {
    if (!isRecord(sys) || sys.id !== sysId || typeof sys.name !== "string" || typeof sys.lineId !== "string" || !lineIds.has(sys.lineId) || !Number.isFinite(sys.displayOrder)) {
      throw new Error(`系統 ${sysId} の情報が正しくありません`);
    }
  }

  for (const [routeId, route] of Object.entries(value.routes)) {
    if (!isRecord(route) || route.id !== routeId || typeof route.name !== "string" || typeof route.directionName !== "string" || !Array.isArray(route.stops) || !Array.isArray(route.legs) || !Array.isArray(route.lineSections)) {
      throw new Error(`経路 ${routeId} の構造が正しくありません`);
    }
    const stopIds = new Set<string>();
    for (const stop of route.stops) {
      if (!isRecord(stop) || typeof stop.id !== "string" || stopIds.has(stop.id) || !Number.isInteger(stop.sequence) || !stationIds.has(stop.stationId) || !ids.has(stop.trackId) || !["stop", "pass"].includes(stop.commercialType)) {
        throw new Error(`経路 ${routeId} の停車地点情報が正しくありません`);
      }
      stopIds.add(stop.id);
    }
    for (const leg of route.legs) {
      if (!isRecord(leg) || !Array.isArray(leg.tracks)) throw new Error(`経路 ${routeId} の区間走行情報が正しくありません`);
      for (const trTrack of leg.tracks) {
        if (!isRecord(trTrack) || !ids.has(trTrack.trackId) || !["forward", "reversed"].includes(trTrack.direction)) {
          throw new Error(`経路 ${routeId} の走行線路情報が正しくありません`);
        }
      }
    }
    for (const sec of route.lineSections) {
      if (!isRecord(sec) || typeof sec.id !== "string" || !stopIds.has(sec.fromStopId) || !stopIds.has(sec.toStopId)) {
        throw new Error(`経路 ${routeId} の路線区間情報が正しくありません`);
      }
      if (lineIds.size > 0 && !lineIds.has(sec.lineId)) {
        throw new Error(`経路 ${routeId} の路線区間情報が正しくありません`);
      }
      if (sec.serviceSystemId && !serviceSystemIds.has(sec.serviceSystemId)) {
        throw new Error(`経路 ${routeId} の区間系統 ${sec.serviceSystemId} が存在しません`);
      }
      if (sec.serviceSystemId && value.serviceSystems[sec.serviceSystemId] && value.serviceSystems[sec.serviceSystemId].lineId !== sec.lineId) {
        throw new Error(`経路 ${routeId} の区間系統と路線が一致しません`);
      }
    }
  }

  for (const [opId, op] of Object.entries(value.operations)) {
    if (!isRecord(op) || op.id !== opId || typeof op.name !== "string" || typeof op.routeId !== "string" || !routeIds.has(op.routeId) || !isRecord(op.calendar) || !Array.isArray(op.stopTimes)) {
      throw new Error(`運行 ${opId} の構造が正しくありません`);
    }
    const route = value.routes[op.routeId];
    const routeStopIds = new Set(route.stops.map((s: any) => s.id));
    let prevSec = -1;
    for (const st of op.stopTimes) {
      if (!isRecord(st) || typeof st.routeStopId !== "string" || !routeStopIds.has(st.routeStopId) || !Number.isInteger(st.dayOffset) || st.dayOffset < 0) {
        throw new Error(`運行 ${opId} の停車時刻情報が正しくありません`);
      }
      const curSec = getAbsoluteTimeSeconds(st.departureTime || st.arrivalTime, st.dayOffset);
      if (curSec < prevSec) {
        throw new Error(`運行 ${opId} の着発時刻順が不正です`);
      }
      prevSec = curSec;
    }
  }

  for (const [dutyId, duty] of Object.entries(value.vehicleDuties)) {
    if (!isRecord(duty) || duty.id !== dutyId || typeof duty.name !== "string" || !Array.isArray(duty.assignments)) {
      throw new Error(`運用 ${dutyId} の構造が正しくありません`);
    }
    if (duty.defaultFormationId && !formationIds.has(duty.defaultFormationId)) {
      throw new Error(`運用 ${dutyId} の通常編成 ${duty.defaultFormationId} が存在しません`);
    }
    for (const a of duty.assignments) {
      if (!isRecord(a) || typeof a.operationId !== "string" || !operationIds.has(a.operationId) || !Number.isInteger(a.sequence) || !Number.isInteger(a.serviceDayOffset) || a.serviceDayOffset < 0) {
        throw new Error(`運用 ${dutyId} の運行割当が正しくありません`);
      }
    }
  }

  for (const [execId, exec] of Object.entries(value.vehicleDutyExecutions)) {
    if (!isRecord(exec) || exec.id !== execId || typeof exec.vehicleDutyId !== "string" || !vehicleDutyIds.has(exec.vehicleDutyId) || typeof exec.serviceDate !== "string") {
      throw new Error(`運用実施 ${execId} の情報が正しくありません`);
    }
    if (exec.formationId && !formationIds.has(exec.formationId)) {
      throw new Error(`運用実施 ${execId} の差し替え編成が存在しません: ${exec.formationId}`);
    }
  }

  for (const [opExecId, opExec] of Object.entries(value.operationExecutions)) {
    if (!isRecord(opExec) || opExec.id !== opExecId || typeof opExec.operationId !== "string" || !operationIds.has(opExec.operationId) || typeof opExec.formationId !== "string" || !formationIds.has(opExec.formationId) || typeof opExec.serviceDate !== "string" || !Number.isFinite(opExec.scheduledDepartureTimeMs) || !["planned", "reserved", "operating", "completed", "cancelled", "failed"].includes(opExec.status)) {
      throw new Error(`運行実行 ${opExecId} の情報が正しくありません`);
    }
  }

  assertNextIdIsUnused(value.nextLineId as number, lineIds, "line-", "次の路線ID");
  assertNextIdIsUnused(value.nextServiceSystemId as number, serviceSystemIds, "sys-", "次の系統ID");
  assertNextIdIsUnused(value.nextRouteId as number, routeIds, "route-", "次の経路ID");
  assertNextIdIsUnused(value.nextOperationId as number, operationIds, "op-", "次の運行ID");
  assertNextIdIsUnused(value.nextVehicleDutyId as number, vehicleDutyIds, "duty-", "次の運用ID");

  const placementIds = new Set<string>();
  const placedFormationIds = new Set<string>();
  for (const placement of value.vehiclePlacements as VehiclePlacement[]) {
    if (!isRecord(placement) || typeof placement.id !== "string" || typeof placement.formationId !== "string" || typeof placement.stationId !== "string" || typeof placement.trackId !== "string" || !isFiniteNumber(placement.centerDistanceM) || !isFiniteNumber(placement.occupiedStartDistanceM) || !isFiniteNumber(placement.occupiedEndDistanceM) || !["forward", "reversed"].includes(placement.orientation)) throw new Error("車両配置が正しくありません");
    if (placementIds.has(placement.id)) throw new Error(`配置IDが重複しています: ${placement.id}`);
    placementIds.add(placement.id);
    if (!formationIds.has(placement.formationId)) throw new Error(`配置対象の編成が存在しません: ${placement.formationId}`);
    if (placedFormationIds.has(placement.formationId)) throw new Error(`編成が複数の場所へ重複配置されています: ${placement.formationId}`);
    placedFormationIds.add(placement.formationId);
    if (!stationIds.has(placement.stationId)) throw new Error(`配置先の駅が存在しません: ${placement.stationId}`);
    if (!ids.has(placement.trackId)) throw new Error(`配置先の線路が存在しません: ${placement.trackId}`);
    const station = (value.stations as any[]).find((s) => s.id === placement.stationId)!;
    const stopPoint = station.stopPoints.find((sp: any) => sp.trackId === placement.trackId);
    if (!stopPoint) throw new Error(`配置先の駅に指定線路の停車地点がありません: ${placement.stationId}`);
    if (placement.centerDistanceM < stopPoint.startDistanceM - 0.001 || placement.centerDistanceM > stopPoint.endDistanceM + 0.001) {
      throw new Error(`配置位置が駅の停車範囲外です: ${placement.stationId}`);
    }
    const formation = (value.fleet.formations as any[]).find((f) => f.id === placement.formationId)!;
    if (!Array.isArray(formation.vehicles) || formation.vehicles.length === 0) {
      throw new Error("空の編成は配置できません");
    }
    if (placement.occupiedStartDistanceM < 0 || placement.occupiedEndDistanceM <= placement.occupiedStartDistanceM) throw new Error("配置占有距離が正しくありません");
    const track = (value.tracks as Track[]).find((t) => t.id === placement.trackId)!;
    const trackLength = analyzeLine(sampleTrack(track)).lengthM;
    if (placement.occupiedEndDistanceM > trackLength + 0.001) throw new Error("配置占有距離が線路長を超えています");
  }

  for (let i = 0; i < value.vehiclePlacements.length; i += 1) {
    for (let j = i + 1; j < value.vehiclePlacements.length; j += 1) {
      const p1 = value.vehiclePlacements[i];
      const p2 = value.vehiclePlacements[j];
      if (p1.trackId === p2.trackId) {
        if (p1.occupiedStartDistanceM <= p2.occupiedEndDistanceM && p2.occupiedStartDistanceM <= p1.occupiedEndDistanceM) {
          throw new Error(`同一線路上で編成の配置位置が重複しています: ${p1.trackId}`);
        }
      }
    }
  }

  const trainIds = new Set<string>();
  const operatingFormationIds = new Set<string>();
  for (const train of value.operatingTrains) {
    if (!isRecord(train) || typeof train.id !== "string" || trainIds.has(train.id) || typeof train.name !== "string" || typeof train.formationId !== "string" || typeof train.routeId !== "string" || !routeIds.has(train.routeId) || !isFiniteNumber(train.speedKph) || !isFiniteNumber(train.dwellSeconds) || !["running", "dwelling", "completed"].includes(String(train.state)) || !Number.isInteger(train.legIndex) || !Number.isInteger(train.traversalIndex) || !isFiniteNumber(train.distanceOnTraversalM) || !isFiniteNumber(train.remainingDwellSeconds) || !isPoint(train.position)) throw new Error("運行列車が正しくありません");
    if (!formationIds.has(train.formationId)) throw new Error(`運行列車の編成が存在しません: ${train.formationId}`);
    trainIds.add(train.id);
    if (train.state !== "completed") {
      if (operatingFormationIds.has(train.formationId)) throw new Error(`編成が複数の運行列車へ重複登録されています: ${train.formationId}`);
      operatingFormationIds.add(train.formationId);
    }
  }

  for (const formationId of operatingFormationIds) {
    if (placedFormationIds.has(formationId)) throw new Error(`運行中の編成が配置状態に重複して存在しています: ${formationId}`);
  }

  assertNextIdIsUnused(value.nextOperatingTrainId as number, trainIds, "operating-train-", "次の運行列車ID");
}

function validateTrack(value: unknown, ids: Set<string>): asserts value is Track {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.length === 0) throw new Error("線路IDが正しくありません");
  if (ids.has(value.id)) throw new Error(`線路IDが重複しています: ${value.id}`);
  ids.add(value.id);
  if (value.geometry !== "straight" && value.geometry !== "curve") throw new Error(`${value.id}の線形種別が正しくありません`);
  if (value.resolvedPath !== true) throw new Error(`${value.id}の完成線形がありません`);
  if (!Array.isArray(value.points) || value.points.length < 2 || !value.points.every(isPoint)) throw new Error(`${value.id}の座標が正しくありません`);
  validateSpecification(value.specification, value.id);
  if (!isRecord(value.engineering) || !isFiniteNumber(value.engineering.designSpeedKmh)) throw new Error(`${value.id}の工学状態が正しくありません`);
  if (value.engineering.builtMinimumRadiusM !== null && !isFiniteNumber(value.engineering.builtMinimumRadiusM)) throw new Error(`${value.id}の最小半径が正しくありません`);
  if (!Array.isArray(value.engineering.cantProfile) || !value.engineering.cantProfile.every((point) => isRecord(point) && isFiniteNumber(point.distanceM) && isFiniteNumber(point.cantMm))) throw new Error(`${value.id}のカントが正しくありません`);
  if (value.startConnection !== undefined) validateConnection(value.startConnection, value.id);
  if (value.endConnection !== undefined) validateConnection(value.endConnection, value.id);
}

function validateSpecification(value: unknown, trackId: string): void {
  if (!isRecord(value) || typeof value.gaugeId !== "string" || typeof value.railProfileId !== "string" || typeof value.supportSystemId !== "string" || typeof value.roadbedId !== "string") throw new Error(`${trackId}の軌道構成が正しくありません`);
  trackCatalog.validateSpecification({ gaugeId: value.gaugeId, railProfileId: value.railProfileId, supportSystemId: value.supportSystemId, roadbedId: value.roadbedId });
}

function validateConnection(value: unknown, trackId: string): void {
  if (!isRecord(value) || typeof value.trackId !== "string") throw new Error(`${trackId}の接続情報が正しくありません`);
  if (typeof value.junctionId !== "string") throw new Error(`${trackId}の接続点情報が正しくありません`);
}

function migrateVersion1(value: Record<string, any>): MapState {
  if (!Array.isArray(value.tracks)) throw new Error("旧セーブに線路一覧がありません");
  const state: any = { version: 8, clock: createInitialClock(), tracks: [], trackGroups: [], junctions: [], stations: [], routes: [], operatingTrains: [], nextTrackId: 1, nextTrackGroupId: 1, nextJunctionId: 1, nextStationId: 1, nextRouteId: 1, nextOperatingTrainId: 1 };
  const laneIdMap = new Map<string, string>();
  const legacyTracks: { source: Record<string, any>; newIds: string[] }[] = [];

  for (const source of value.tracks) {
    if (!isRecord(source) || (source.geometry !== "straight" && source.geometry !== "curve") || !Array.isArray(source.points) || !source.points.every(isPoint)) throw new Error("旧セーブの線路が正しくありません");
    const count = Number.isInteger(source.trackCount) && source.trackCount > 0 ? source.trackCount : 1;
    const spacing = isFiniteNumber(source.trackSpacing) && source.trackSpacing > 0 ? source.trackSpacing : 12;
    validateSpecification(source.specification, String(source.id));
    const center = sampleTrack({ geometry: source.geometry, points: source.points, startTangent: source.startTangent, endTangent: source.endTangent });
    const paths = createParallelLines(center, count, spacing);
    const newIds = paths.map(() => `track-${state.nextTrackId++}`);
    legacyTracks.push({ source, newIds });
    const oldLanes = Array.isArray(source.lanes) ? source.lanes : [];
    newIds.forEach((id, index) => laneIdMap.set(typeof oldLanes[index]?.id === "string" ? oldLanes[index].id : `${source.id}-lane-${index + 1}`, id));
    paths.forEach((path, index) => {
      const alignment = analyzeLine(path);
      const speed = isFiniteNumber(source.engineering?.designSpeedKmh) ? source.engineering.designSpeedKmh : 80;
      const gaugeMm = trackCatalog.getGauge(source.specification.gaugeId).gaugeMm;
      const cantMm = recommendedCantMm(gaugeMm, speed, alignment.minimumRadiusM);
      state.tracks.push({ id: newIds[index], geometry: source.geometry, points: path, resolvedPath: true, specification: structuredClone(source.specification), engineering: { designSpeedKmh: speed, builtMinimumRadiusM: alignment.minimumRadiusM, cantProfile: [{ distanceM: 0, cantMm }, { distanceM: alignment.lengthM, cantMm }] } });
    });
    if (newIds.length >= 2) state.trackGroups.push({ id: `track-group-${state.nextTrackGroupId}`, name: `線路群 ${state.nextTrackGroupId++}`, trackIds: newIds });
  }

  legacyTracks.forEach(({ source, newIds }) => {
    for (const key of ["startConnection", "endConnection"] as const) {
      const connection = source[key];
      if (!isRecord(connection) || !Array.isArray(connection.lanePairs)) continue;
      for (const pair of connection.lanePairs) {
        if (!isRecord(pair)) continue;
        const ownId = laneIdMap.get(String(pair.ownLaneId));
        const otherId = laneIdMap.get(String(pair.otherLaneId));
        const track = state.tracks.find((item: any) => item.id === ownId);
        if (track && otherId) track[key] = { trackId: otherId };
      }
      if (connection.lanePairs.length === 0 && newIds[0]) {
        const legacyTarget = legacyTracks.find((item) => item.source.id === connection.trackId)?.newIds[0];
        const track = state.tracks.find((item: any) => item.id === newIds[0]);
        if (track && legacyTarget) track[key] = { trackId: legacyTarget };
      }
    }
  });
  addMigratedJunctions(state);
  return migrateVersion8(state);
}

function migrateVersion2(value: Record<string, any>): MapState {
  const state = structuredClone(value);
  state.version = 8;
  state.clock = createInitialClock();
  state.junctions = [];
  state.nextJunctionId = 1;
  state.stations = [];
  state.nextStationId = 1;
  state.routes = [];
  state.operatingTrains = [];
  state.nextRouteId = 1;
  state.nextOperatingTrainId = 1;
  addMigratedJunctions(state);
  return migrateVersion8(state);
}

function migrateVersion3(value: Record<string, any>): MapState {
  const state = structuredClone(value);
  state.version = 8;
  state.clock = createInitialClock();
  state.stations = [];
  state.nextStationId = 1;
  state.routes = [];
  state.operatingTrains = [];
  state.nextRouteId = 1;
  state.nextOperatingTrainId = 1;
  return migrateVersion8(state);
}

function migrateVersion4(value: Record<string, any>): MapState {
  const state = structuredClone(value);
  for (const station of state.stations ?? []) station.stopPoints = station.stopPoints.map((stopPoint: any) => ({ ...stopPoint, lengthM: 120 }));
  state.version = 5;
  return migrateVersion5(state);
}

function migrateVersion5(value: Record<string, any>): MapState {
  const state = structuredClone(value);
  state.version = 8;
  state.clock = createInitialClock();
  for (const station of state.stations) {
    station.stopPoints = station.stopPoints.map((legacy: any) => {
      const track = state.tracks.find((item: any) => item.id === legacy.trackId);
      if (!track) throw new Error(`${station.id}の停車地点線路が存在しません`);
      const path = sampleTrack(track);
      const total = analyzeLine(path).lengthM;
      const startDistanceM = Math.max(0, legacy.distanceM - legacy.lengthM / 2);
      const endDistanceM = Math.min(total, legacy.distanceM + legacy.lengthM / 2);
      return { trackId: legacy.trackId, startDistanceM, endDistanceM, startPosition: pointAtDistance(path, startDistanceM), endPosition: pointAtDistance(path, endDistanceM), direction: "both" as const };
    });
    const stopPoint = station.stopPoints[0];
    if (stopPoint) station.position = pointAtDistance(sampleTrack(state.tracks.find((item: any) => item.id === stopPoint.trackId)!), (stopPoint.startDistanceM + stopPoint.endDistanceM) / 2);
  }
  state.routes = [];
  state.operatingTrains = [];
  state.nextRouteId = 1;
  state.nextOperatingTrainId = 1;
  return migrateVersion8(state);
}

function migrateVersion6(value: Record<string, any>): MapState {
  const state = structuredClone(value);
  state.version = 8;
  state.clock = createInitialClock();
  state.routes = [];
  state.operatingTrains = [];
  state.nextRouteId = 1;
  state.nextOperatingTrainId = 1;
  return migrateVersion8(state);
}

function migrateVersion7(value: Record<string, any>): MapState {
  const state = structuredClone(value);
  state.version = 8;
  state.clock = createInitialClock();
  return migrateVersion8(state);
}

function migrateVersion8(value: Record<string, any>): MapState {
  const state = structuredClone(value);
  state.version = 9;
  state.fleet = createInitialFleetState();
  state.vehiclePlacements = [];
  state.dispatchReservations = [];
  state.nextOperatorClassId = 1;
  state.nextVehicleUnitId = 1;
  state.nextFormationId = 1;
  state.nextDispatchReservationId = 1;
  state.operatingTrains = [];
  return migrateVersion9(state);
}

function migrateVersion9(value: Record<string, any>): MapState {
  const state = structuredClone(value);
  state.version = 10;

  state.lines = isRecord(state.lines) ? state.lines : {};
  state.servicePatterns = isRecord(state.servicePatterns) ? state.servicePatterns : {};
  state.stopPatterns = isRecord(state.stopPatterns) ? state.stopPatterns : {};
  state.operationRoutes = isRecord(state.operationRoutes) ? state.operationRoutes : {};
  state.trainRuns = isRecord(state.trainRuns) ? state.trainRuns : {};

  state.nextLineId = Number.isInteger(state.nextLineId) ? state.nextLineId : 1;
  state.nextServicePatternId = Number.isInteger(state.nextServicePatternId) ? state.nextServicePatternId : 1;
  state.nextStopPatternId = Number.isInteger(state.nextStopPatternId) ? state.nextStopPatternId : 1;
  state.nextOperationRouteId = Number.isInteger(state.nextOperationRouteId) ? state.nextOperationRouteId : 1;
  state.nextTrainRunId = Number.isInteger(state.nextTrainRunId) ? state.nextTrainRunId : 1;

  const now = state.clock?.currentTimeMs ?? Date.now();

  // Ensure all station stopPoints have stable id
  if (Array.isArray(state.stations)) {
    for (const station of state.stations) {
      if (Array.isArray(station.stopPoints)) {
        station.stopPoints.forEach((sp: any, index: number) => {
          if (!sp.id) sp.id = `${station.id}-sp-${index + 1}`;
        });
      }
    }
  }

  let defaultLineId = "line-default";
  if (Object.keys(state.lines).length === 0) {
    state.lines[defaultLineId] = {
      id: defaultLineId,
      name: "既定路線",
      code: "DEF",
      color: "#4B5563",
      servicePatternIds: ["sp-default"],
      createdAtGameTimeMs: now,
      updatedAtGameTimeMs: now,
    };
    state.nextLineId = Math.max(state.nextLineId, 2);
  } else {
    defaultLineId = Object.keys(state.lines)[0];
  }

  let defaultSpId = "sp-default";
  if (Object.keys(state.servicePatterns).length === 0) {
    state.servicePatterns[defaultSpId] = {
      id: defaultSpId,
      name: "既定運行系統",
      type: "local",
      lineIds: [defaultLineId],
      directions: [
        {
          id: "dir-default",
          name: "下り",
          stopPatternId: "spat-default",
          routeIds: [],
        },
      ],
      createdAtGameTimeMs: now,
      updatedAtGameTimeMs: now,
    };
    state.stopPatterns["spat-default"] = {
      id: "spat-default",
      servicePatternId: defaultSpId,
      directionId: "dir-default",
      stops: [],
    };
    state.nextServicePatternId = Math.max(state.nextServicePatternId, 2);
    state.nextStopPatternId = Math.max(state.nextStopPatternId, 2);
    if (!state.lines[defaultLineId].servicePatternIds.includes(defaultSpId)) {
      state.lines[defaultLineId].servicePatternIds.push(defaultSpId);
    }
  } else {
    defaultSpId = Object.keys(state.servicePatterns)[0];
  }

  const sp = state.servicePatterns[defaultSpId];

  // Upgrade legacy routes array into operationRoutes & stopPatterns
  const legacyRoutes: any[] = Array.isArray(state.routes) ? state.routes : [];
  for (const oldRoute of legacyRoutes) {
    if (!oldRoute || typeof oldRoute.id !== "string") continue;
    if (state.operationRoutes[oldRoute.id]) continue;

    const dirId = `dir-default-${oldRoute.id}`;
    const spatId = `spat-default-${oldRoute.id}`;

    const stationIds: string[] = Array.isArray(oldRoute.stationIds) ? oldRoute.stationIds : [];
    const stopPatternStops: any[] = stationIds.map((stId, index) => ({
      sequence: index + 1,
      stationId: stId,
      commercialType: "stop",
      defaultDwellSeconds: 5,
    }));
    state.stopPatterns[spatId] = {
      id: spatId,
      servicePatternId: defaultSpId,
      directionId: dirId,
      stops: stopPatternStops,
    };
    state.nextStopPatternId += 1;

    const routeStops: any[] = stationIds.map((stId, index) => {
      const station = (state.stations as any[])?.find((s) => s.id === stId);
      const leg = oldRoute.legs?.[index];
      const prevLeg = oldRoute.legs?.[index - 1];
      const legTrack = Array.isArray(leg) ? leg[0] : (leg as any)?.tracks?.[0];
      const prevLegTrack = Array.isArray(prevLeg) ? prevLeg.at(-1) : (prevLeg as any)?.tracks?.at(-1);
      const trackId = legTrack?.trackId || prevLegTrack?.trackId || station?.stopPoints?.[0]?.trackId || "";
      const stopPoint = station?.stopPoints?.find((sp: any) => sp.trackId === trackId) || station?.stopPoints?.[0];
      return {
        sequence: index + 1,
        stationId: stId,
        trackId,
        stopPointId: stopPoint?.id || `${stId}-sp-1`,
        stopPointIndex: 0,
        distanceM: 0,
        commercialType: "stop",
        dwellSeconds: 5,
      };
    });

    const legacyLegs: any[][] = Array.isArray(oldRoute.legs) ? oldRoute.legs : [];
    const routeLegs: any[] = legacyLegs.map((oldLeg, legIndex) => {
      const tracks = (Array.isArray(oldLeg) ? oldLeg : []).map((t: any) => {
        const from = t.fromDistanceM ?? 0;
        const to = t.toDistanceM ?? 0;
        return {
          trackId: t.trackId,
          direction: from <= to ? "forward" : "reversed",
          startDistanceM: Math.min(from, to),
          endDistanceM: Math.max(from, to),
          lengthM: Math.abs(to - from),
        };
      });
      const legDist = tracks.reduce((sum: number, tr: any) => sum + tr.lengthM, 0);
      return {
        fromStopSequence: legIndex + 1,
        toStopSequence: legIndex + 2,
        tracks,
        junctionIds: [],
        totalDistanceM: legDist,
      };
    });

    const totalDist = oldRoute.lengthM ?? routeLegs.reduce((sum: number, leg: any) => sum + leg.totalDistanceM, 0);

    const newOpRoute = {
      id: oldRoute.id,
      servicePatternId: defaultSpId,
      directionId: dirId,
      stopPatternId: spatId,
      name: oldRoute.name || `運行経路 ${oldRoute.id}`,
      stationIds,
      stops: routeStops,
      legs: routeLegs,
      totalDistanceM: totalDist,
      lengthM: totalDist,
      status: "active" as const,
      createdAtGameTimeMs: now,
    };
    state.operationRoutes[oldRoute.id] = newOpRoute;

    if (!sp.directions.some((d: any) => d.id === dirId)) {
      sp.directions.push({
        id: dirId,
        name: "下り",
        stopPatternId: spatId,
        routeIds: [oldRoute.id],
      });
    }
  }

  // Convert dispatchReservations to trainRuns
  if (Array.isArray(state.dispatchReservations)) {
    for (const res of state.dispatchReservations) {
      const runId = `run-${res.id}`;
      state.trainRuns[runId] = {
        id: runId,
        servicePatternId: defaultSpId,
        directionId: "dir-default",
        routeId: res.routeId,
        formationId: res.formationId,
        scheduledDepartureTimeMs: res.departureTimeMs,
        requestedSpeedKph: 80,
        status: res.status === "pending" ? "reserved" : (res.status || "planned"),
        createdAtGameTimeMs: res.createdAtGameTimeMs ?? now,
      };
    }
  }

  // Remove legacy properties from MapState
  delete state.routes;
  delete state.dispatchReservations;

  return migrateVersion10(state);
}

function migrateVersion10(value: Record<string, any>): MapState {
  const state = structuredClone(value);
  state.version = 11;

  const now = state.clock?.currentTimeMs ?? Date.now();

  state.lines = isRecord(state.lines) ? state.lines : {};
  state.serviceSystems = {};
  state.routes = {};
  state.operations = {};
  state.vehicleDuties = {};
  state.vehicleDutyExecutions = {};
  state.operationExecutions = {};

  let defaultLineId = "line-default";
  if (Object.keys(state.lines).length === 0) {
    state.lines[defaultLineId] = {
      id: defaultLineId,
      name: "既定路線",
      code: "DEF",
      color: "#4B5563",
      displayOrder: 1,
      createdAtGameTimeMs: now,
      updatedAtGameTimeMs: now,
    };
  } else {
    defaultLineId = Object.keys(state.lines)[0];
    Object.values(state.lines).forEach((line: any, idx: number) => {
      line.displayOrder = line.displayOrder ?? idx + 1;
      delete line.servicePatternIds;
    });
  }

  // Migrate ServicePatterns -> ServiceSystems
  const legacyServicePatterns = isRecord(state.servicePatterns) ? state.servicePatterns : {};
  let defaultSystemId = "sys-default";

  if (Object.keys(legacyServicePatterns).length === 0) {
    state.serviceSystems[defaultSystemId] = {
      id: defaultSystemId,
      lineId: defaultLineId,
      name: "既定系統",
      displayOrder: 1,
      createdAtGameTimeMs: now,
      updatedAtGameTimeMs: now,
    };
  } else {
    Object.values(legacyServicePatterns).forEach((sp: any, idx: number) => {
      const lineId = Array.isArray(sp.lineIds) && sp.lineIds[0] ? sp.lineIds[0] : defaultLineId;
      state.serviceSystems[sp.id] = {
        id: sp.id,
        lineId,
        name: sp.name || `系統 ${idx + 1}`,
        shortName: sp.type === "local" ? "各停" : sp.type === "rapid" ? "快速" : undefined,
        displayOrder: idx + 1,
        createdAtGameTimeMs: sp.createdAtGameTimeMs ?? now,
        updatedAtGameTimeMs: sp.updatedAtGameTimeMs ?? now,
      };
      if (idx === 0) defaultSystemId = sp.id;
    });
  }

  // Migrate OperationRoutes -> Routes
  const legacyOpRoutes = isRecord(state.operationRoutes) ? state.operationRoutes : {};
  for (const [routeId, oldRoute] of Object.entries(legacyOpRoutes) as [string, any][]) {
    const sp = legacyServicePatterns[oldRoute.servicePatternId || ""];
    const dir = sp?.directions?.find((d: any) => d.id === oldRoute.directionId);
    const directionName = dir?.name || "下り";

    const stops = (oldRoute.stops || []).map((st: any, idx: number) => ({
      id: st.id || st.stopPointId || `rstop-${idx + 1}-${st.stationId}`,
      sequence: idx + 1,
      stationId: st.stationId,
      trackId: st.trackId,
      stopPointId: st.stopPointId,
      stopPointIndex: st.stopPointIndex ?? 0,
      distanceM: st.distanceM ?? 0,
      commercialType: st.commercialType || "stop",
      dwellSeconds: st.dwellSeconds ?? 5,
    }));

    const primaryLineId = sp?.lineIds?.[0] || defaultLineId;
    const primarySystemId = state.serviceSystems[oldRoute.servicePatternId] ? oldRoute.servicePatternId : undefined;

    const lineSections = stops.length >= 2 ? [
      {
        id: `sec-1-${routeId}`,
        fromStopId: stops[0].id,
        toStopId: stops.at(-1)!.id,
        lineId: primaryLineId,
        serviceSystemId: primarySystemId,
      },
    ] : [];

    state.routes[routeId] = {
      id: routeId,
      name: oldRoute.name || `経路 ${routeId}`,
      directionName,
      stops,
      legs: oldRoute.legs || [],
      lineSections,
      totalDistanceM: oldRoute.totalDistanceM ?? oldRoute.lengthM ?? 0,
      lengthM: oldRoute.totalDistanceM ?? oldRoute.lengthM ?? 0,
      status: oldRoute.status || "active",
      createdAtGameTimeMs: oldRoute.createdAtGameTimeMs ?? now,
      updatedAtGameTimeMs: now,
    };
  }

  // Migrate TrainRuns -> Operations, VehicleDuties, OperationExecutions
  const legacyTrainRuns = isRecord(state.trainRuns) ? state.trainRuns : {};
  for (const [runId, run] of Object.entries(legacyTrainRuns) as [string, any][]) {
    const route = state.routes[run.routeId];
    if (!route) continue;
    const opId = `op-${runId.replace(/^run-/, "")}`;

    // Create stopTimes from scheduledDepartureTimeMs
    const stopTimes = (route?.stops || []).map((st: any, idx: number) => {
      const isFirst = idx === 0;
      const isLast = idx === (route?.stops?.length ?? 1) - 1;
      const baseSec = Math.floor((run.scheduledDepartureTimeMs % 86400000) / 1000);
      const depSec = baseSec + idx * 120;
      const arrSec = isFirst ? undefined : formatSec(depSec - 30);
      return {
        routeStopId: st.id,
        arrivalTime: arrSec,
        departureTime: isLast ? undefined : formatSec(depSec),
        dayOffset: 0,
      };
    });

    state.operations[opId] = {
      id: opId,
      name: `運行 ${opId}`,
      routeId: run.routeId,
      calendar: { weekdays: [0, 1, 2, 3, 4, 5, 6] },
      stopTimes,
      requiresReview: false,
      createdAtGameTimeMs: run.createdAtGameTimeMs ?? now,
      updatedAtGameTimeMs: now,
    };

    const dutyId = `duty-${runId.replace(/^run-/, "")}`;
    state.vehicleDuties[dutyId] = {
      id: dutyId,
      name: `運用 ${dutyId}`,
      assignments: [{ operationId: opId, sequence: 1, serviceDayOffset: 0 }],
      defaultFormationId: run.formationId,
      createdAtGameTimeMs: run.createdAtGameTimeMs ?? now,
      updatedAtGameTimeMs: now,
    };

    state.operationExecutions[runId] = {
      id: runId,
      operationId: opId,
      vehicleDutyId: dutyId,
      formationId: run.formationId,
      serviceDate: formatServiceDateUtc(run.scheduledDepartureTimeMs),
      scheduledDepartureTimeMs: run.scheduledDepartureTimeMs,
      actualDepartureTimeMs: run.actualDepartureTimeMs,
      completedTimeMs: run.completedTimeMs,
      requestedSpeedKph: run.requestedSpeedKph || 80,
      dwellSeconds: run.dwellSeconds,
      status: run.status || "planned",
      currentStopSequence: run.currentStopSequence || 1,
      operatingTrainId: run.operatingTrainId,
      failureReason: run.failureReason,
      createdAtGameTimeMs: run.createdAtGameTimeMs ?? now,
      updatedAtGameTimeMs: run.updatedAtGameTimeMs ?? now,
    };
  }

  // Create default operations for any Route that had no train runs
  for (const [rId, route] of Object.entries(state.routes) as [string, any][]) {
    const hasOp = Object.values(state.operations).some((o: any) => o.routeId === rId);
    if (!hasOp) {
      const opId = `op-default-${rId}`;
      const stopTimes = route.stops.map((st: any, idx: number) => {
        const isFirst = idx === 0;
        const isLast = idx === route.stops.length - 1;
        const depSec = 28800 + idx * 120; // 08:00:00
        return {
          routeStopId: st.id,
          arrivalTime: isFirst ? undefined : formatSec(depSec - 30),
          departureTime: isLast ? undefined : formatSec(depSec),
          dayOffset: 0,
        };
      });
      state.operations[opId] = {
        id: opId,
        name: `運行 ${route.name}`,
        routeId: rId,
        calendar: { weekdays: [0, 1, 2, 3, 4, 5, 6] },
        stopTimes,
        requiresReview: false,
        createdAtGameTimeMs: now,
        updatedAtGameTimeMs: now,
      };
    }
  }

  // Clean up legacy v10 keys
  delete state.servicePatterns;
  delete state.stopPatterns;
  delete state.operationRoutes;
  delete state.trainRuns;
  delete state.nextServicePatternId;
  delete state.nextStopPatternId;
  delete state.nextOperationRouteId;
  delete state.nextTrainRunId;
  delete state.dispatchReservations;
  delete state.nextDispatchReservationId;

  // Next IDs
  state.nextLineId = Math.max(state.nextLineId || 1, Object.keys(state.lines).length + 1);
  state.nextServiceSystemId = Math.max(Object.keys(state.serviceSystems).length + 1, 1);
  state.nextRouteId = Math.max(state.nextRouteId || 1, Object.keys(state.routes).length + 1);
  state.nextOperationId = Math.max(Object.keys(state.operations).length + 1, 1);
  state.nextVehicleDutyId = Math.max(Object.keys(state.vehicleDuties).length + 1, 1);
  state.nextVehicleDutyExecutionId = 1;
  state.nextOperationExecutionId = Math.max(Object.keys(state.operationExecutions).length + 1, 1);

  validateMapState(state);
  return state as MapState;
}

function formatSec(totalSec: number): string {
  const s = ((totalSec % 86400) + 86400) % 86400;
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

function pointAtDistance(points: Point[], distanceM: number): Point {
  let traversed = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const length = Math.hypot(points[index + 1].x - points[index].x, points[index + 1].y - points[index].y);
    if (traversed + length >= distanceM) {
      const ratio = length <= 0 ? 0 : (distanceM - traversed) / length;
      return { x: points[index].x + (points[index + 1].x - points[index].x) * ratio, y: points[index].y + (points[index + 1].y - points[index].y) * ratio };
    }
    traversed += length;
  }
  return { ...(points.at(-1) ?? { x: 0, y: 0 }) };
}

function addMigratedJunctions(state: any): void {
  for (const track of state.tracks) {
    for (const [key, location] of [["startConnection", "start"], ["endConnection", "end"]] as const) {
      const connection = track[key];
      if (!connection || connection.junctionId) continue;
      const target = state.tracks.find((item: any) => item.id === connection.trackId);
      if (!target) continue;
      const ownPath = sampleTrack(track);
      const position = location === "start" ? ownPath[0] : ownPath.at(-1)!;
      const targetPath = sampleTrack(target);
      const targetDistance = nearestDistanceOnPath(targetPath, position);
      const targetLength = analyzeLine(targetPath).lengthM;
      const junctionId = `junction-${state.nextJunctionId++}`;
      connection.junctionId = junctionId;
      state.junctions.push({ id: junctionId, position: { ...position }, ports: [
        { trackId: track.id, location, distanceM: location === "start" ? 0 : analyzeLine(ownPath).lengthM },
        { trackId: target.id, location: targetDistance <= 0.001 ? "start" : targetLength - targetDistance <= 0.001 ? "end" : "interior", distanceM: targetDistance },
      ] });
    }
  }
}

function nearestDistanceOnPath(points: Point[], position: Point): number {
  let traversed = 0;
  let bestDistance = 0;
  let bestGap = Infinity;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const ratio = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((position.x - start.x) * dx + (position.y - start.y) * dy) / lengthSquared));
    const candidate = { x: start.x + dx * ratio, y: start.y + dy * ratio };
    const gap = Math.hypot(position.x - candidate.x, position.y - candidate.y);
    const segmentLength = Math.sqrt(lengthSquared);
    if (gap < bestGap) { bestGap = gap; bestDistance = traversed + segmentLength * ratio; }
    traversed += segmentLength;
  }
  return bestDistance;
}

function assertNextIdIsUnused(next: number, ids: Set<string>, prefix: string, label: string): void {
  const maximum = Math.max(0, ...[...ids].flatMap((id) => {
    if (!id.startsWith(prefix)) return [];
    const value = Number(id.slice(prefix.length));
    return Number.isInteger(value) ? [value] : [];
  }));
  if (next <= maximum) throw new Error(`${label}が既存IDと衝突しています`);
}

function isPoint(value: unknown): value is Point { return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y); }
function isFiniteNumber(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function isRecord(value: unknown): value is Record<string, any> { return typeof value === "object" && value !== null && !Array.isArray(value); }
