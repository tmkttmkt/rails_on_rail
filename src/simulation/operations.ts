import { analyzeLine, sampleTrack } from "./geometry";
import type { MapState, OperatingTrain, OperationRoute, Point, RouteTraversal } from "./model";

interface Edge { to: string; cost: number; traversal?: RouteTraversal }

export function findStationRoute(state: MapState, fromStationId: string, toStationId: string): RouteTraversal[] {
  const from = requireStation(state, fromStationId);
  const to = requireStation(state, toStationId);
  const graph = new Map<string, Edge[]>();
  const distancesByTrack = new Map<string, number[]>();
  const addDistance = (trackId: string, distance: number) => {
    const values = distancesByTrack.get(trackId) ?? [];
    if (!values.some((value) => Math.abs(value - distance) < 0.001)) values.push(distance);
    distancesByTrack.set(trackId, values);
  };

  for (const track of state.tracks) {
    const length = analyzeLine(sampleTrack(track)).lengthM;
    addDistance(track.id, 0);
    addDistance(track.id, length);
  }
  for (const junction of state.junctions) for (const port of junction.ports) addDistance(port.trackId, port.distanceM);
  for (const station of state.stations) for (const stop of station.stopPoints) addDistance(stop.trackId, stopMidpoint(stop));

  for (const [trackId, values] of distancesByTrack) {
    values.sort((a, b) => a - b);
    for (let index = 1; index < values.length; index += 1) {
      const first = values[index - 1];
      const second = values[index];
      addEdge(graph, nodeKey(trackId, first), { to: nodeKey(trackId, second), cost: second - first, traversal: { trackId, fromDistanceM: first, toDistanceM: second } });
      addEdge(graph, nodeKey(trackId, second), { to: nodeKey(trackId, first), cost: second - first, traversal: { trackId, fromDistanceM: second, toDistanceM: first } });
    }
  }
  for (const junction of state.junctions) {
    for (const first of junction.ports) for (const second of junction.ports) {
      if (first !== second) addEdge(graph, nodeKey(first.trackId, first.distanceM), { to: nodeKey(second.trackId, second.distanceM), cost: 0 });
    }
  }

  const starts = from.stopPoints.map((stop) => nodeKey(stop.trackId, stopMidpoint(stop)));
  const targets = new Set(to.stopPoints.map((stop) => nodeKey(stop.trackId, stopMidpoint(stop))));
  const distances = new Map(starts.map((key) => [key, 0]));
  const previous = new Map<string, { key: string; edge: Edge }>();
  const pending = new Set(starts);
  let reached: string | null = null;
  while (pending.size > 0) {
    const current = [...pending].reduce((best, key) => (distances.get(key)! < distances.get(best)! ? key : best));
    pending.delete(current);
    if (targets.has(current)) { reached = current; break; }
    for (const edge of graph.get(current) ?? []) {
      const candidate = distances.get(current)! + edge.cost;
      if (candidate + 1e-9 >= (distances.get(edge.to) ?? Number.POSITIVE_INFINITY)) continue;
      distances.set(edge.to, candidate);
      previous.set(edge.to, { key: current, edge });
      pending.add(edge.to);
    }
  }
  if (!reached) throw new Error(`駅「${from.name}」から「${to.name}」へ到達できません`);
  const reversed: RouteTraversal[] = [];
  while (!starts.includes(reached)) {
    const step = previous.get(reached);
    if (!step) throw new Error("経路の復元に失敗しました");
    if (step.edge.traversal) reversed.push(step.edge.traversal);
    reached = step.key;
  }
  return coalesceTraversals(reversed.reverse());
}

export function createOperationRoute(state: MapState, name: string, stationIds: string[]): OperationRoute {
  if (stationIds.length < 2) throw new Error("運行経路には2駅以上が必要です");
  const normalized = name.trim();
  if (!normalized) throw new Error("運行経路名を入力してください");
  const legs = stationIds.slice(1).map((stationId, index) => {
    if (stationId === stationIds[index]) throw new Error("同じ駅を続けて指定できません");
    return findStationRoute(state, stationIds[index], stationId);
  });
  const lengthM = legs.flat().reduce((sum, traversal) => sum + traversalLength(traversal), 0);
  return { id: `route-${state.nextRouteId}`, name: normalized, stationIds: [...stationIds], legs, lengthM };
}

export function createOperatingTrain(state: MapState, routeId: string, formationId: string, name: string, speedKph = 80, dwellSeconds = 5): OperatingTrain {
  const route = requireRoute(state, routeId);
  if (!formationId.trim()) throw new Error("編成IDを入力してください");
  if (!Number.isFinite(speedKph) || speedKph <= 0) throw new Error("列車速度は0より大きくしてください");
  const first = route.legs[0]?.[0];
  if (!first) throw new Error("走行区間のない運行経路です");
  return {
    id: `operating-train-${state.nextOperatingTrainId}`,
    name: name.trim() || `列車 ${state.nextOperatingTrainId}`,
    formationId: formationId.trim(), routeId, speedKph, dwellSeconds,
    state: "dwelling", legIndex: 0, traversalIndex: 0, distanceOnTraversalM: 0,
    remainingDwellSeconds: dwellSeconds,
    position: pointAtTrackDistance(state, first.trackId, first.fromDistanceM),
  };
}

export function advanceOperatingTrains(state: MapState, elapsedSeconds: number): void {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return;
  for (const train of state.operatingTrains) advanceTrain(state, train, elapsedSeconds);
}

function advanceTrain(state: MapState, train: OperatingTrain, elapsedSeconds: number): void {
  if (train.state === "completed") return;
  let remainingSeconds = Math.min(elapsedSeconds, 60);
  if (train.state === "dwelling") {
    const used = Math.min(remainingSeconds, train.remainingDwellSeconds);
    train.remainingDwellSeconds -= used;
    remainingSeconds -= used;
    if (train.remainingDwellSeconds > 0) return;
    train.state = "running";
  }
  const route = requireRoute(state, train.routeId);
  let travelM = remainingSeconds * train.speedKph / 3.6;
  while (travelM > 0 && train.state === "running") {
    const traversal = route.legs[train.legIndex]?.[train.traversalIndex];
    if (!traversal) { train.state = "completed"; return; }
    const length = traversalLength(traversal);
    const available = length - train.distanceOnTraversalM;
    const used = Math.min(travelM, available);
    train.distanceOnTraversalM += used;
    travelM -= used;
    const direction = Math.sign(traversal.toDistanceM - traversal.fromDistanceM);
    train.position = pointAtTrackDistance(state, traversal.trackId, traversal.fromDistanceM + direction * train.distanceOnTraversalM);
    if (train.distanceOnTraversalM + 1e-6 < length) break;
    train.traversalIndex += 1;
    train.distanceOnTraversalM = 0;
    if (train.traversalIndex < route.legs[train.legIndex].length) continue;
    train.legIndex += 1;
    train.traversalIndex = 0;
    if (train.legIndex >= route.legs.length) { train.state = "completed"; break; }
    train.state = "dwelling";
    train.remainingDwellSeconds = train.dwellSeconds;
  }
}

export function pointAtTrackDistance(state: MapState, trackId: string, distanceM: number): Point {
  const track = state.tracks.find((item) => item.id === trackId);
  if (!track) throw new Error(`線路が存在しません: ${trackId}`);
  const path = sampleTrack(track);
  let remaining = Math.max(0, distanceM);
  for (let index = 1; index < path.length; index += 1) {
    const start = path[index - 1];
    const end = path[index];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (remaining <= length) {
      const ratio = length <= 1e-9 ? 0 : remaining / length;
      return { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio };
    }
    remaining -= length;
  }
  return { ...path.at(-1)! };
}

function requireStation(state: MapState, id: string) {
  const station = state.stations.find((item) => item.id === id);
  if (!station) throw new Error(`駅が存在しません: ${id}`);
  return station;
}
function requireRoute(state: MapState, id: string) {
  const route = state.routes.find((item) => item.id === id);
  if (!route) throw new Error(`運行経路が存在しません: ${id}`);
  return route;
}
function stopMidpoint(stop: { startDistanceM: number; endDistanceM: number }) { return (stop.startDistanceM + stop.endDistanceM) / 2; }
function nodeKey(trackId: string, distance: number) { return `${trackId}@${distance.toFixed(6)}`; }
function addEdge(graph: Map<string, Edge[]>, from: string, edge: Edge) { graph.set(from, [...(graph.get(from) ?? []), edge]); }
function traversalLength(traversal: RouteTraversal) { return Math.abs(traversal.toDistanceM - traversal.fromDistanceM); }
function coalesceTraversals(items: RouteTraversal[]): RouteTraversal[] {
  const result: RouteTraversal[] = [];
  for (const item of items) {
    const previous = result.at(-1);
    if (previous && previous.trackId === item.trackId && Math.abs(previous.toDistanceM - item.fromDistanceM) < 0.001) previous.toDistanceM = item.toDistanceM;
    else result.push({ ...item });
  }
  return result;
}
