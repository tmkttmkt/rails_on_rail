import { SIMULATION_SPEEDS, createInitialState, type MapState, type Point, type SimulationSpeed, type Track, type TrackGeometry, type TrackGroup, type TrackJunctionPortLocation } from "./model";
import { trackCatalog, type TrackSpecification } from "../data/trackCatalog";
import { analyzeLine, closestPointOnSegment, createParallelLines, polylineOverlapLength, recommendedCantMm, sampleTrack } from "./geometry";
import { advanceOperatingTrains, createOperatingTrain, createOperationRoute } from "./operations";

export type MapCommand =
  | { type: "track.create"; geometry: TrackGeometry; points: Point[]; trackCount?: number; trackSpacing?: number; specification?: TrackSpecification; designSpeedKmh?: number; connectionAlignmentIndex?: number; startTangent?: Point; endTangent?: Point; startConnectionTrackId?: string; endConnectionTrackId?: string }
  | { type: "track.delete"; trackId: string }
  | { type: "trackGroup.create"; trackIds: string[]; name?: string }
  | { type: "trackGroup.addTrack"; groupId: string; trackId: string }
  | { type: "trackGroup.removeTrack"; groupId: string; trackId: string }
  | { type: "trackGroup.dissolve"; groupId: string }
  | { type: "station.createRange"; name: string; trackId: string; startPosition: Point; endPosition: Point; includeTrackGroup?: boolean }
  | { type: "station.rename"; stationId: string; name: string }
  | { type: "station.extend"; stationId: string; trackId: string; position: Point }
  | { type: "station.merge"; stationIds: string[] }
  | { type: "station.delete"; stationId: string }
  | { type: "route.create"; name: string; stationIds: string[] }
  | { type: "train.dispatch"; routeId: string; formationId: string; name: string; speedKph?: number; dwellSeconds?: number }
  | { type: "simulation.tick"; elapsedSeconds: number }
  | { type: "simulation.setPaused"; paused: boolean }
  | { type: "simulation.setSpeed"; speedMultiplier: SimulationSpeed }
  | { type: "map.clear" };

export interface CommandResult {
  state: MapState;
  message: string;
}

export function executeCommand(state: MapState, command: MapCommand): CommandResult {
  const next = structuredClone(state);

  switch (command.type) {
    case "track.create":
      return createTracks(next, command);
    case "track.delete": {
      const index = next.tracks.findIndex((track) => track.id === command.trackId);
      if (index < 0) throw new Error("線路が存在しません");
      next.tracks.splice(index, 1);
      next.junctions = next.junctions.flatMap((junction) => {
        const ports = junction.ports.filter((port) => port.trackId !== command.trackId);
        return ports.length >= 2 ? [{ ...junction, ports }] : [];
      });
      next.trackGroups = next.trackGroups.flatMap((group) => {
        const trackIds = group.trackIds.filter((id) => id !== command.trackId);
        return trackIds.length >= 2 ? [{ ...group, trackIds }] : [];
      });
      for (const track of next.tracks) {
        if (track.startConnection?.trackId === command.trackId || (track.startConnection?.junctionId && !next.junctions.some((item) => item.id === track.startConnection?.junctionId))) delete track.startConnection;
        if (track.endConnection?.trackId === command.trackId || (track.endConnection?.junctionId && !next.junctions.some((item) => item.id === track.endConnection?.junctionId))) delete track.endConnection;
      }
      next.stations = next.stations.flatMap((station) => {
        const stopPoints = station.stopPoints.filter((stopPoint) => stopPoint.trackId !== command.trackId);
        return stopPoints.length > 0 ? [{ ...station, stopPoints }] : [];
      });
      removeInvalidRoutesAndTrains(next);
      return { state: next, message: "線路を撤去しました" };
    }
    case "trackGroup.create": {
      const trackIds = uniqueTrackIds(command.trackIds);
      if (trackIds.length < 2) throw new Error("線路群には2本以上の線路が必要です");
      assertTracksExist(next, trackIds);
      assertTracksUngrouped(next, trackIds);
      const group = createGroup(next, trackIds, command.name);
      return { state: next, message: `「${group.name}」を作成しました` };
    }
    case "trackGroup.addTrack": {
      const group = requireGroup(next, command.groupId);
      assertTracksExist(next, [command.trackId]);
      assertTracksUngrouped(next, [command.trackId]);
      group.trackIds.push(command.trackId);
      group.trackIds = orderTrackIdsSpatially(next, group.trackIds);
      return { state: next, message: `${group.name}へ線路を追加しました` };
    }
    case "trackGroup.removeTrack": {
      const group = requireGroup(next, command.groupId);
      if (!group.trackIds.includes(command.trackId)) throw new Error("線路群に指定線路がありません");
      group.trackIds = group.trackIds.filter((id) => id !== command.trackId);
      if (group.trackIds.length < 2) {
        next.trackGroups = next.trackGroups.filter((item) => item.id !== group.id);
        return { state: next, message: `${group.name}から線路を外し、残り1本のため束を解体しました` };
      }
      return { state: next, message: `${group.name}から線路を外しました` };
    }
    case "trackGroup.dissolve": {
      const group = requireGroup(next, command.groupId);
      next.trackGroups = next.trackGroups.filter((item) => item.id !== group.id);
      return { state: next, message: `「${group.name}」を解体しました。線路は残っています` };
    }
    case "station.createRange": {
      const name = normalizeStationName(command.name);
      const track = requireTrack(next, command.trackId);
      const path = sampleTrack(track);
      const first = locateOnPath(path, command.startPosition);
      const second = locateOnPath(path, command.endPosition);
      const startDistanceM = Math.min(first.distanceM, second.distanceM);
      const endDistanceM = Math.max(first.distanceM, second.distanceM);
      if (endDistanceM - startDistanceM < 1) throw new Error("駅範囲は1 m以上にしてください");
      const midpoint = pointAtPathDistance(path, (startDistanceM + endDistanceM) / 2);
      const trackIds = command.includeTrackGroup ? groupTrackIds(next, track.id) : [track.id];
      const stopPoints = trackIds.map((trackId) => {
        const targetPath = sampleTrack(requireTrack(next, trackId));
        const targetStart = locateOnPath(targetPath, first.point);
        const targetEnd = locateOnPath(targetPath, second.point);
        const targetStartDistanceM = Math.min(targetStart.distanceM, targetEnd.distanceM);
        const targetEndDistanceM = Math.max(targetStart.distanceM, targetEnd.distanceM);
        if (targetEndDistanceM - targetStartDistanceM < 1) throw new Error(`${trackId}へ駅範囲を設定できません`);
        return { trackId, startDistanceM: targetStartDistanceM, endDistanceM: targetEndDistanceM, startPosition: pointAtPathDistance(targetPath, targetStartDistanceM), endPosition: pointAtPathDistance(targetPath, targetEndDistanceM), direction: "both" as const };
      });
      const number = next.nextStationId++;
      next.stations.push({ id: `station-${number}`, name, position: midpoint, stopPoints });
      return { state: next, message: `駅「${name}」を${stopPoints.length}本の線路へ設置しました` };
    }
    case "station.rename": {
      const station = next.stations.find((item) => item.id === command.stationId);
      if (!station) throw new Error("駅が存在しません");
      station.name = normalizeStationName(command.name);
      return { state: next, message: `駅名を「${station.name}」へ変更しました` };
    }
    case "station.extend": {
      const station = next.stations.find((item) => item.id === command.stationId);
      if (!station) throw new Error("駅が存在しません");
      const stopPoint = station.stopPoints.find((item) => item.trackId === command.trackId);
      if (!stopPoint) throw new Error("選択した駅はこの線路に停車地点を持ちません");
      const groupIds = new Set(groupTrackIds(next, command.trackId));
      for (const target of station.stopPoints.filter((item) => groupIds.has(item.trackId))) {
        const path = sampleTrack(requireTrack(next, target.trackId));
        const located = locateOnPath(path, command.position);
        target.startDistanceM = Math.min(target.startDistanceM, located.distanceM);
        target.endDistanceM = Math.max(target.endDistanceM, located.distanceM);
        target.startPosition = pointAtPathDistance(path, target.startDistanceM);
        target.endPosition = pointAtPathDistance(path, target.endDistanceM);
      }
      const centers = station.stopPoints.map((item) => pointAtPathDistance(sampleTrack(requireTrack(next, item.trackId)), (item.startDistanceM + item.endDistanceM) / 2));
      station.position = { x: centers.reduce((sum, point) => sum + point.x, 0) / centers.length, y: centers.reduce((sum, point) => sum + point.y, 0) / centers.length };
      return { state: next, message: `駅「${station.name}」を延長しました` };
    }
    case "station.merge": {
      const stationIds = [...new Set(command.stationIds)];
      if (stationIds.length < 2) throw new Error("統合する駅を2駅以上選択してください");
      const stations = stationIds.map((id) => {
        const station = next.stations.find((item) => item.id === id);
        if (!station) throw new Error("統合対象の駅が存在しません");
        return station;
      });
      const target = stations[0];
      for (const source of stations.slice(1)) {
        for (const incoming of source.stopPoints) {
          const existing = target.stopPoints.find((item) => item.trackId === incoming.trackId);
          if (!existing) {
            target.stopPoints.push(structuredClone(incoming));
            continue;
          }
          const path = sampleTrack(requireTrack(next, existing.trackId));
          existing.startDistanceM = Math.min(existing.startDistanceM, incoming.startDistanceM);
          existing.endDistanceM = Math.max(existing.endDistanceM, incoming.endDistanceM);
          existing.startPosition = pointAtPathDistance(path, existing.startDistanceM);
          existing.endPosition = pointAtPathDistance(path, existing.endDistanceM);
        }
      }
      const centers = target.stopPoints.map((stopPoint) => pointAtPathDistance(sampleTrack(requireTrack(next, stopPoint.trackId)), (stopPoint.startDistanceM + stopPoint.endDistanceM) / 2));
      target.position = { x: centers.reduce((sum, point) => sum + point.x, 0) / centers.length, y: centers.reduce((sum, point) => sum + point.y, 0) / centers.length };
      const removedIds = new Set(stationIds.slice(1));
      next.stations = next.stations.filter((station) => !removedIds.has(station.id));
      removeInvalidRoutesAndTrains(next);
      return { state: next, message: `${stationIds.length}駅を「${target.name}」へ統合しました` };
    }
    case "station.delete": {
      const index = next.stations.findIndex((item) => item.id === command.stationId);
      if (index < 0) throw new Error("駅が存在しません");
      const [station] = next.stations.splice(index, 1);
      removeInvalidRoutesAndTrains(next);
      return { state: next, message: `駅「${station.name}」を撤去しました` };
    }
    case "route.create": {
      const route = createOperationRoute(next, command.name, command.stationIds);
      next.nextRouteId += 1;
      next.routes.push(route);
      return { state: next, message: `運行経路「${route.name}」を作成しました` };
    }
    case "train.dispatch": {
      const train = createOperatingTrain(next, command.routeId, command.formationId, command.name, command.speedKph, command.dwellSeconds);
      next.nextOperatingTrainId += 1;
      next.operatingTrains.push(train);
      return { state: next, message: `列車「${train.name}」を配置しました` };
    }
    case "simulation.tick": {
      if (!Number.isFinite(command.elapsedSeconds) || command.elapsedSeconds < 0) throw new Error("経過時間は0以上の有限値で指定してください");
      const nextTimeMs = Math.round(next.clock.currentTimeMs + command.elapsedSeconds * 1000);
      if (!Number.isSafeInteger(nextTimeMs) || Math.abs(nextTimeMs) > 8_640_000_000_000_000) throw new Error("ゲーム内時刻が表現可能な範囲を超えています");
      next.clock.currentTimeMs = nextTimeMs;
      let remainingSeconds = command.elapsedSeconds;
      while (remainingSeconds > 0) {
        const step = Math.min(60, remainingSeconds);
        advanceOperatingTrains(next, step);
        remainingSeconds -= step;
      }
      return { state: next, message: "時間を進めました" };
    }
    case "simulation.setPaused":
      next.clock.paused = command.paused;
      return { state: next, message: command.paused ? "時間を一時停止しました" : "時間を進行します" };
    case "simulation.setSpeed":
      if (!(SIMULATION_SPEEDS as readonly number[]).includes(command.speedMultiplier)) throw new Error("対応していない時間速度です");
      next.clock.speedMultiplier = command.speedMultiplier;
      return { state: next, message: `時間速度を${command.speedMultiplier}倍へ変更しました` };
    case "map.clear":
      return { state: { ...createInitialState(), clock: structuredClone(next.clock) }, message: "マップを空にしました" };
  }
}

function removeInvalidRoutesAndTrains(state: MapState): void {
  const stationIds = new Set(state.stations.map((station) => station.id));
  state.routes = state.routes.filter((route) => route.stationIds.every((id) => stationIds.has(id)) && route.legs.flat().every((traversal) => state.tracks.some((track) => track.id === traversal.trackId)));
  const routeIds = new Set(state.routes.map((route) => route.id));
  state.operatingTrains = state.operatingTrains.filter((train) => routeIds.has(train.routeId));
}

function createTracks(next: MapState, command: Extract<MapCommand, { type: "track.create" }>): CommandResult {
  if (command.points.length < 2) throw new Error("線路には2点以上が必要です");
  const trackCount = command.trackCount ?? 1;
  if (!Number.isInteger(trackCount) || trackCount < 1 || trackCount > 8) throw new Error("線路本数は1〜8本で指定してください");
  const trackSpacing = command.trackSpacing ?? 12;
  if (!Number.isFinite(trackSpacing) || trackSpacing <= 0) throw new Error("線路間隔は0より大きい値にしてください");
  const specification = command.specification ?? trackCatalog.defaultSpecification();
  trackCatalog.validateSpecification(specification);
  const designSpeedKmh = command.designSpeedKmh ?? 80;
  if (!Number.isFinite(designSpeedKmh) || designSpeedKmh < 0 || designSpeedKmh > 500) throw new Error("設計速度は0〜500 km/hで指定してください");

  const startTarget = command.startConnectionTrackId ? requireTrack(next, command.startConnectionTrackId) : undefined;
  const endTarget = command.endConnectionTrackId ? requireTrack(next, command.endConnectionTrackId) : undefined;
  const centerLine = sampleTrack({
    geometry: command.geometry,
    points: command.points,
    ...(command.startTangent ? { startTangent: command.startTangent } : {}),
    ...(command.endTangent ? { endTangent: command.endTangent } : {}),
  });
  const paths = createParallelLines(centerLine, trackCount, trackSpacing);
  const newIds = paths.map(() => `track-${next.nextTrackId++}`);
  const startTargetIds = startTarget ? groupTrackIds(next, startTarget.id) : [];
  const alignmentIndex = command.connectionAlignmentIndex ?? centeredConnectionCandidateIndex(newIds.length, startTargetIds.length);
  const startPairs = startTarget ? pairByAlignment(newIds, startTargetIds, alignmentIndex) : [];
  const endPairs = endTarget ? pairByCenter(newIds, groupTrackIds(next, endTarget.id)) : [];
  if (startTarget) {
    alignPathsToConnection(next, paths, startTarget.id, alignmentIndex, centerLine[0]);
  }
  if (endTarget) {
    alignPathEndsToConnection(next, paths, endTarget.id, centeredConnectionCandidateIndex(newIds.length, groupTrackIds(next, endTarget.id).length), centerLine.at(-1)!);
  }
  for (const path of paths) {
    for (const existing of next.tracks) {
      if (polylineOverlapLength(path, sampleTrack(existing)) > 0.0001) throw new Error(`既設線路${existing.id}と同じ区間へ線路を重ねることはできません`);
    }
  }
  const gaugeMm = trackCatalog.getGauge(specification.gaugeId).gaugeMm;
  const startJunctionIds = new Map(startPairs.map((pair) => {
    const ownIndex = newIds.indexOf(pair.ownId);
    return [pair.ownId, createConnectionJunction(next, pair.ownId, paths[ownIndex], "start", pair.otherId, paths[ownIndex][0])] as const;
  }));
  const endJunctionIds = new Map(endPairs.map((pair) => {
    const ownIndex = newIds.indexOf(pair.ownId);
    return [pair.ownId, createConnectionJunction(next, pair.ownId, paths[ownIndex], "end", pair.otherId, paths[ownIndex].at(-1)!)] as const;
  }));

  paths.forEach((path, index) => {
    const alignment = analyzeLine(path);
    const cantMm = recommendedCantMm(gaugeMm, designSpeedKmh, alignment.minimumRadiusM);
    const startConnection = startPairs.find((pair) => pair.ownId === newIds[index]);
    const endConnection = endPairs.find((pair) => pair.ownId === newIds[index]);
    next.tracks.push({
      id: newIds[index],
      geometry: command.geometry,
      points: path.map((point) => ({ ...point })),
      resolvedPath: true,
      specification: structuredClone(specification),
      ...(startConnection ? { startConnection: { trackId: startConnection.otherId, junctionId: startJunctionIds.get(newIds[index]) } } : {}),
      ...(endConnection ? { endConnection: { trackId: endConnection.otherId, junctionId: endJunctionIds.get(newIds[index]) } } : {}),
      engineering: {
        designSpeedKmh,
        builtMinimumRadiusM: alignment.minimumRadiusM,
        cantProfile: [{ distanceM: 0, cantMm }, { distanceM: alignment.lengthM, cantMm }],
      },
    });
  });

  if (newIds.length >= 2) createGroup(next, newIds);
  return { state: next, message: `${trackCount}本の独立した${command.geometry === "curve" ? "曲線" : "直線"}線路を敷設しました` };
}

export function pairByCenter(ownIds: string[], otherIds: string[]): { ownId: string; otherId: string }[] {
  return pairByAlignment(ownIds, otherIds, centeredConnectionCandidateIndex(ownIds.length, otherIds.length));
}

export function connectionCandidateCount(ownCount: number, otherCount: number): number {
  return ownCount + otherCount - 1;
}

export function centeredConnectionCandidateIndex(ownCount: number, otherCount: number): number {
  return Math.floor((connectionCandidateCount(ownCount, otherCount) - 1) / 2);
}

export function connectionCandidateIndexFromSelectedTrack(ownCount: number, otherIds: string[], selectedTrackId: string): number {
  const selectedIndex = otherIds.indexOf(selectedTrackId);
  if (selectedIndex < 0) return centeredConnectionCandidateIndex(ownCount, otherIds.length);
  const center = (otherIds.length - 1) / 2;
  if (selectedIndex < center) return selectedIndex + ownCount - 1;
  if (selectedIndex > center) return selectedIndex;
  return centeredConnectionCandidateIndex(ownCount, otherIds.length);
}

export function pairByAlignment(ownIds: string[], otherIds: string[], candidateIndex: number): { ownId: string; otherId: string }[] {
  const maximum = connectionCandidateCount(ownIds.length, otherIds.length) - 1;
  const selected = Math.max(0, Math.min(maximum, Math.round(candidateIndex)));
  const shift = selected - (ownIds.length - 1);
  return ownIds.flatMap((ownId, ownIndex) => {
    const otherIndex = ownIndex + shift;
    return otherIndex >= 0 && otherIndex < otherIds.length
      ? [{ ownId, otherId: otherIds[otherIndex] }]
      : [];
  });
}

export function alignPathsToConnection(state: MapState, paths: Point[][], targetTrackId: string, candidateIndex: number, anchor: Point): void {
  const targetIds = groupTrackIds(state, targetTrackId);
  const ownIds = paths.map((_, index) => `preview-${index}`);
  const pairs = pairByAlignment(ownIds, targetIds, candidateIndex);
  if (pairs.length === 0) return;
  const clickedIndex = targetIds.indexOf(targetTrackId);
  const pair = [...pairs].sort((a, b) => Math.abs(targetIds.indexOf(a.otherId) - clickedIndex) - Math.abs(targetIds.indexOf(b.otherId) - clickedIndex))[0];
  const ownIndex = ownIds.indexOf(pair.ownId);
  const target = state.tracks.find((track) => track.id === pair.otherId);
  if (ownIndex < 0 || !target) return;
  const targetPoint = nearestPointOnPath(sampleTrack(target), anchor);
  const shift = { x: targetPoint.x - paths[ownIndex][0].x, y: targetPoint.y - paths[ownIndex][0].y };
  for (const path of paths) for (const point of path) { point.x += shift.x; point.y += shift.y; }
}

export function alignPathEndsToConnection(state: MapState, paths: Point[][], targetTrackId: string, candidateIndex: number, anchor: Point): void {
  const targetIds = groupTrackIds(state, targetTrackId);
  const ownIds = paths.map((_, index) => `preview-${index}`);
  for (const pair of pairByAlignment(ownIds, targetIds, candidateIndex)) {
    const ownIndex = ownIds.indexOf(pair.ownId);
    const target = state.tracks.find((track) => track.id === pair.otherId);
    if (ownIndex < 0 || !target || paths[ownIndex].length === 0) continue;
    paths[ownIndex][paths[ownIndex].length - 1] = nearestPointOnPath(sampleTrack(target), anchor);
  }
}

export function findTrackGroup(state: MapState, trackId: string): TrackGroup | undefined {
  return state.trackGroups.find((group) => group.trackIds.includes(trackId));
}

function groupTrackIds(state: MapState, trackId: string): string[] {
  return findTrackGroup(state, trackId)?.trackIds ?? [trackId];
}

function nearestPointOnPath(points: Point[], point: Point): Point {
  let nearest = points[0] ?? point;
  let distance = Infinity;
  for (let index = 0; index < points.length - 1; index += 1) {
    const candidate = closestPointOnSegment(point, points[index], points[index + 1]);
    if (candidate.distance < distance) { nearest = candidate.point; distance = candidate.distance; }
  }
  return nearest;
}

function createGroup(state: MapState, trackIds: string[], name?: string): TrackGroup {
  const number = state.nextTrackGroupId++;
  const group = { id: `track-group-${number}`, name: name?.trim() || `線路群 ${number}`, trackIds: orderTrackIdsSpatially(state, trackIds) };
  state.trackGroups.push(group);
  return group;
}

function orderTrackIdsSpatially(state: MapState, trackIds: string[]): string[] {
  const tracks = trackIds.map((id) => requireTrack(state, id));
  const reference = sampleTrack(tracks[0]);
  if (reference.length < 2) return [...trackIds];
  const direction = { x: reference[1].x - reference[0].x, y: reference[1].y - reference[0].y };
  const length = Math.hypot(direction.x, direction.y) || 1;
  const normal = { x: -direction.y / length, y: direction.x / length };
  return [...tracks]
    .sort((first, second) => trackCenter(first).x * normal.x + trackCenter(first).y * normal.y - (trackCenter(second).x * normal.x + trackCenter(second).y * normal.y))
    .map((track) => track.id);
}

function trackCenter(track: Track): Point {
  const points = sampleTrack(track);
  return points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 });
}

function createConnectionJunction(state: MapState, ownTrackId: string, ownPath: Point[], ownLocation: "start" | "end", otherTrackId: string, position: Point): string {
  const other = requireTrack(state, otherTrackId);
  const otherPath = sampleTrack(other);
  const located = locateOnPath(otherPath, position);
  const id = `junction-${state.nextJunctionId++}`;
  state.junctions.push({
    id,
    position: { ...located.point },
    ports: [
      { trackId: ownTrackId, location: ownLocation, distanceM: ownLocation === "start" ? 0 : pathLength(ownPath) },
      { trackId: otherTrackId, location: located.location, distanceM: located.distanceM },
    ],
  });
  return id;
}

function locateOnPath(points: Point[], position: Point): { point: Point; distanceM: number; location: TrackJunctionPortLocation } {
  let traversed = 0;
  let best = { point: points[0] ?? position, distanceM: 0, distance: Infinity };
  for (let index = 0; index < points.length - 1; index += 1) {
    const candidate = closestPointOnSegment(position, points[index], points[index + 1]);
    const segmentLength = Math.hypot(points[index + 1].x - points[index].x, points[index + 1].y - points[index].y);
    const partial = Math.hypot(candidate.point.x - points[index].x, candidate.point.y - points[index].y);
    if (candidate.distance < best.distance) best = { point: candidate.point, distanceM: traversed + partial, distance: candidate.distance };
    traversed += segmentLength;
  }
  const total = traversed;
  const location = best.distanceM <= 0.001 ? "start" : total - best.distanceM <= 0.001 ? "end" : "interior";
  return { point: best.point, distanceM: best.distanceM, location };
}

function pathLength(points: Point[]): number {
  return points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0);
}

function pointAtPathDistance(points: Point[], distanceM: number): Point {
  let traversed = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (traversed + length >= distanceM) {
      const ratio = length <= 0 ? 0 : (distanceM - traversed) / length;
      return { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio };
    }
    traversed += length;
  }
  return { ...(points.at(-1) ?? { x: 0, y: 0 }) };
}

function normalizeStationName(name: string): string {
  const normalized = name.trim();
  if (normalized.length < 1 || normalized.length > 60) throw new Error("駅名は1〜60文字で入力してください");
  return normalized;
}


function uniqueTrackIds(trackIds: string[]): string[] {
  return [...new Set(trackIds)];
}

function assertTracksExist(state: MapState, trackIds: string[]): void {
  for (const id of trackIds) requireTrack(state, id);
}

function assertTracksUngrouped(state: MapState, trackIds: string[]): void {
  for (const id of trackIds) if (findTrackGroup(state, id)) throw new Error(`${id}は既に線路群へ所属しています`);
}

function requireTrack(state: MapState, trackId: string): Track {
  const track = state.tracks.find((item) => item.id === trackId);
  if (!track) throw new Error(`線路が存在しません: ${trackId}`);
  return track;
}

function requireGroup(state: MapState, groupId: string): TrackGroup {
  const group = state.trackGroups.find((item) => item.id === groupId);
  if (!group) throw new Error(`線路群が存在しません: ${groupId}`);
  return group;
}
