import { trackCatalog } from "../data/trackCatalog";
import { analyzeLine, createParallelLines, recommendedCantMm, sampleTrack } from "./geometry";
import { SIMULATION_SPEEDS, createInitialClock, type MapState, type Point, type Track } from "./model";

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
  validateMapState(value);
  return structuredClone(value);
}

export function validateMapState(value: unknown): asserts value is MapState {
  if (!isRecord(value)) throw new Error("セーブデータの形式が正しくありません");
  if (value.version !== 8) throw new Error(`対応していないセーブ形式です: ${String(value.version)}`);
  if (!isRecord(value.clock) || !Number.isSafeInteger(value.clock.currentTimeMs) || Math.abs(value.clock.currentTimeMs as number) > 8_640_000_000_000_000 || typeof value.clock.paused !== "boolean" || !(SIMULATION_SPEEDS as readonly unknown[]).includes(value.clock.speedMultiplier)) throw new Error("ゲーム内時計が正しくありません");
  if (!Number.isInteger(value.nextTrackId) || (value.nextTrackId as number) < 1) throw new Error("次の線路IDが正しくありません");
  if (!Number.isInteger(value.nextTrackGroupId) || (value.nextTrackGroupId as number) < 1) throw new Error("次の線路群IDが正しくありません");
  if (!Number.isInteger(value.nextJunctionId) || (value.nextJunctionId as number) < 1) throw new Error("次の接続点IDが正しくありません");
  if (!Number.isInteger(value.nextStationId) || (value.nextStationId as number) < 1) throw new Error("次の駅IDが正しくありません");
  if (!Number.isInteger(value.nextRouteId) || (value.nextRouteId as number) < 1 || !Number.isInteger(value.nextOperatingTrainId) || (value.nextOperatingTrainId as number) < 1) throw new Error("次の運行IDが正しくありません");
  if (!Array.isArray(value.tracks) || !Array.isArray(value.trackGroups) || !Array.isArray(value.junctions) || !Array.isArray(value.stations) || !Array.isArray(value.routes) || !Array.isArray(value.operatingTrains)) throw new Error("地図または運行の一覧がありません");

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
  for (const station of value.stations) {
    if (!isRecord(station) || typeof station.id !== "string" || stationIds.has(station.id) || typeof station.name !== "string" || station.name.trim().length < 1 || station.name.length > 60 || !isPoint(station.position) || !Array.isArray(station.stopPoints) || station.stopPoints.length < 1) throw new Error("駅が正しくありません");
    stationIds.add(station.id);
    const stopTrackIds = new Set<string>();
    for (const stopPoint of station.stopPoints) {
      if (!isRecord(stopPoint) || typeof stopPoint.trackId !== "string" || !ids.has(stopPoint.trackId) || !isFiniteNumber(stopPoint.startDistanceM) || stopPoint.startDistanceM < 0 || !isFiniteNumber(stopPoint.endDistanceM) || stopPoint.endDistanceM <= stopPoint.startDistanceM || !isPoint(stopPoint.startPosition) || !isPoint(stopPoint.endPosition) || stopPoint.direction !== "both") throw new Error(`${station.id}の停車地点が正しくありません`);
      if (stopTrackIds.has(stopPoint.trackId)) throw new Error(`${station.id}に同じ線路の停車地点が重複しています`);
      stopTrackIds.add(stopPoint.trackId);
      const track = (value.tracks as Track[]).find((item) => item.id === stopPoint.trackId)!;
      if (stopPoint.endDistanceM > analyzeLine(sampleTrack(track)).lengthM + 0.001) throw new Error(`${station.id}の停車地点距離が線路長を超えています`);
    }
  }
  assertNextIdIsUnused(value.nextTrackId as number, ids, "track-", "次の線路ID");
  assertNextIdIsUnused(value.nextTrackGroupId as number, groupIds, "track-group-", "次の線路群ID");
  assertNextIdIsUnused(value.nextJunctionId as number, junctionIds, "junction-", "次の接続点ID");
  assertNextIdIsUnused(value.nextStationId as number, stationIds, "station-", "次の駅ID");
  const routeIds = new Set<string>();
  for (const route of value.routes) {
    if (!isRecord(route) || typeof route.id !== "string" || routeIds.has(route.id) || typeof route.name !== "string" || !Array.isArray(route.stationIds) || route.stationIds.length < 2 || !route.stationIds.every((id) => typeof id === "string" && stationIds.has(id)) || !Array.isArray(route.legs) || route.legs.length !== route.stationIds.length - 1 || !isFiniteNumber(route.lengthM) || route.lengthM < 0) throw new Error("運行経路が正しくありません");
    for (const leg of route.legs) if (!Array.isArray(leg) || !leg.every((item) => isRecord(item) && typeof item.trackId === "string" && ids.has(item.trackId) && isFiniteNumber(item.fromDistanceM) && isFiniteNumber(item.toDistanceM))) throw new Error(`${route.id}の走行区間が正しくありません`);
    routeIds.add(route.id);
  }
  const trainIds = new Set<string>();
  for (const train of value.operatingTrains) {
    if (!isRecord(train) || typeof train.id !== "string" || trainIds.has(train.id) || typeof train.name !== "string" || typeof train.formationId !== "string" || typeof train.routeId !== "string" || !routeIds.has(train.routeId) || !isFiniteNumber(train.speedKph) || !isFiniteNumber(train.dwellSeconds) || !["running", "dwelling", "completed"].includes(String(train.state)) || !Number.isInteger(train.legIndex) || !Number.isInteger(train.traversalIndex) || !isFiniteNumber(train.distanceOnTraversalM) || !isFiniteNumber(train.remainingDwellSeconds) || !isPoint(train.position)) throw new Error("運行列車が正しくありません");
    trainIds.add(train.id);
  }
  assertNextIdIsUnused(value.nextRouteId as number, routeIds, "route-", "次の運行経路ID");
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
  const state: MapState = { version: 8, clock: createInitialClock(), tracks: [], trackGroups: [], junctions: [], stations: [], routes: [], operatingTrains: [], nextTrackId: 1, nextTrackGroupId: 1, nextJunctionId: 1, nextStationId: 1, nextRouteId: 1, nextOperatingTrainId: 1 };
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
        const track = state.tracks.find((item) => item.id === ownId);
        if (track && otherId) track[key] = { trackId: otherId };
      }
      if (connection.lanePairs.length === 0 && newIds[0]) {
        const legacyTarget = legacyTracks.find((item) => item.source.id === connection.trackId)?.newIds[0];
        const track = state.tracks.find((item) => item.id === newIds[0]);
        if (track && legacyTarget) track[key] = { trackId: legacyTarget };
      }
    }
  });
  addMigratedJunctions(state);
  validateMapState(state);
  return state;
}

function migrateVersion2(value: Record<string, any>): MapState {
  const state = structuredClone(value) as MapState;
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
  validateMapState(state);
  return state;
}

function migrateVersion3(value: Record<string, any>): MapState {
  const state = structuredClone(value) as MapState;
  state.version = 8;
  state.clock = createInitialClock();
  state.stations = [];
  state.nextStationId = 1;
  state.routes = [];
  state.operatingTrains = [];
  state.nextRouteId = 1;
  state.nextOperatingTrainId = 1;
  validateMapState(state);
  return state;
}

function migrateVersion4(value: Record<string, any>): MapState {
  const state = structuredClone(value);
  for (const station of state.stations ?? []) station.stopPoints = station.stopPoints.map((stopPoint: any) => ({ ...stopPoint, lengthM: 120 }));
  state.version = 5;
  return migrateVersion5(state);
}

function migrateVersion5(value: Record<string, any>): MapState {
  const state = structuredClone(value) as MapState;
  state.version = 8;
  state.clock = createInitialClock();
  for (const station of state.stations) {
    station.stopPoints = station.stopPoints.map((legacy: any) => {
      const track = state.tracks.find((item) => item.id === legacy.trackId);
      if (!track) throw new Error(`${station.id}の停車地点線路が存在しません`);
      const path = sampleTrack(track);
      const total = analyzeLine(path).lengthM;
      const startDistanceM = Math.max(0, legacy.distanceM - legacy.lengthM / 2);
      const endDistanceM = Math.min(total, legacy.distanceM + legacy.lengthM / 2);
      return { trackId: legacy.trackId, startDistanceM, endDistanceM, startPosition: pointAtDistance(path, startDistanceM), endPosition: pointAtDistance(path, endDistanceM), direction: "both" as const };
    });
    const stopPoint = station.stopPoints[0];
    if (stopPoint) station.position = pointAtDistance(sampleTrack(state.tracks.find((item) => item.id === stopPoint.trackId)!), (stopPoint.startDistanceM + stopPoint.endDistanceM) / 2);
  }
  state.routes = [];
  state.operatingTrains = [];
  state.nextRouteId = 1;
  state.nextOperatingTrainId = 1;
  validateMapState(state);
  return state;
}

function migrateVersion6(value: Record<string, any>): MapState {
  const state = structuredClone(value) as MapState;
  state.version = 8;
  state.clock = createInitialClock();
  state.routes = [];
  state.operatingTrains = [];
  state.nextRouteId = 1;
  state.nextOperatingTrainId = 1;
  validateMapState(state);
  return state;
}

function migrateVersion7(value: Record<string, any>): MapState {
  const state = structuredClone(value) as MapState;
  state.version = 8;
  state.clock = createInitialClock();
  validateMapState(state);
  return state;
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

function addMigratedJunctions(state: MapState): void {
  for (const track of state.tracks) {
    for (const [key, location] of [["startConnection", "start"], ["endConnection", "end"]] as const) {
      const connection = track[key];
      if (!connection || connection.junctionId) continue;
      const target = state.tracks.find((item) => item.id === connection.trackId);
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

function isPoint(value: unknown): value is Point { return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y) }
function isFiniteNumber(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) }
function isRecord(value: unknown): value is Record<string, any> { return typeof value === "object" && value !== null && !Array.isArray(value) }
