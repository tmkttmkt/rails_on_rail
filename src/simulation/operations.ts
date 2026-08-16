import { analyzeLine, getTrackPortTangent, isTangentContinuous, sampleTrack } from "./geometry";
import type { MapState, OperatingTrain, Point, Route, RouteStop, RouteTraversal, RouteTraversalLeg, RouteTraversalTrack } from "./model";

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
      if (first !== second) {
        const track1 = state.tracks.find((t) => t.id === first.trackId);
        const track2 = state.tracks.find((t) => t.id === second.trackId);
        if (track1 && track2) {
          const tangent1 = getTrackPortTangent(track1, first.location, first.distanceM);
          const tangent2 = getTrackPortTangent(track2, second.location, second.distanceM);
          if (isTangentContinuous(tangent1, tangent2)) {
            addEdge(graph, nodeKey(first.trackId, first.distanceM), { to: nodeKey(second.trackId, second.distanceM), cost: 0 });
          }
        }
      }
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
      const nextDistance = distances.get(current)! + edge.cost;
      if (nextDistance < (distances.get(edge.to) ?? Infinity)) {
        distances.set(edge.to, nextDistance);
        previous.set(edge.to, { key: current, edge });
        pending.add(edge.to);
      }
    }
  }
  if (!reached) throw new Error(`「${from.name}」から「${to.name}」へ到達できません`);
  const traversals: RouteTraversal[] = [];
  let cursor: string | undefined = reached;
  while (cursor && previous.has(cursor)) {
    const step: { key: string; edge: Edge } = previous.get(cursor)!;
    if (step.edge.traversal) traversals.unshift(step.edge.traversal);
    cursor = step.key;
  }
  return coalesceTraversals(traversals);
}

export function createOperationRoute(state: MapState, name: string, stationIds: string[]): Route {
  const normalized = name.trim();
  if (normalized.length < 1 || normalized.length > 60) throw new Error("運行経路名は1〜60文字で入力してください");
  if (stationIds.length < 2) throw new Error("運行経路には2駅以上を指定してください");
  for (let index = 1; index < stationIds.length; index += 1) {
    if (stationIds[index] === stationIds[index - 1]) throw new Error("同じ駅を連続して指定することはできません");
  }

  const legs: RouteTraversalLeg[] = stationIds.slice(1).map((toId, index) => {
    const traversals = findStationRoute(state, stationIds[index], toId);
    const tracks: RouteTraversalTrack[] = traversals.map((t) => ({
      trackId: t.trackId,
      direction: t.fromDistanceM <= t.toDistanceM ? ("forward" as const) : ("reversed" as const),
      startDistanceM: Math.min(t.fromDistanceM, t.toDistanceM),
      endDistanceM: Math.max(t.fromDistanceM, t.toDistanceM),
      lengthM: Math.abs(t.toDistanceM - t.fromDistanceM),
    }));
    const totalDistanceM = tracks.reduce((sum, tr) => sum + tr.lengthM, 0);
    return {
      fromStopSequence: index + 1,
      toStopSequence: index + 2,
      tracks,
      junctionIds: [],
      totalDistanceM,
    };
  });

  const lengthM = legs.reduce((sum, leg) => sum + leg.totalDistanceM, 0);
  const routeStops: RouteStop[] = stationIds.map((stId, idx) => {
    const station = state.stations.find((s) => s.id === stId);
    const firstTrackId =
      legs[idx]?.tracks[0]?.trackId || legs[idx - 1]?.tracks.at(-1)?.trackId || station?.stopPoints[0]?.trackId || "";
    const stopPoint = station?.stopPoints.find((sp) => sp.trackId === firstTrackId) || station?.stopPoints[0];
    return {
      id: `rstop-${idx + 1}-${stId}`,
      sequence: idx + 1,
      stationId: stId,
      trackId: firstTrackId,
      stopPointId: stopPoint?.id || "",
      stopPointIndex: 0,
      distanceM: 0,
      commercialType: "stop",
      dwellSeconds: 5,
    };
  });

  const defaultLineId = Object.keys(state.lines)[0] || "line-default";
  const defaultSystemId = Object.keys(state.serviceSystems)[0] || undefined;
  const lineSections = [
    {
      id: `sec-1-route-${state.nextRouteId}`,
      fromStopId: routeStops[0].id,
      toStopId: routeStops.at(-1)!.id,
      lineId: defaultLineId,
      serviceSystemId: defaultSystemId,
    },
  ];

  return {
    id: `route-${state.nextRouteId}`,
    name: normalized,
    directionName: "下り",
    stops: routeStops,
    legs,
    lineSections,
    stationIds,
    totalDistanceM: lengthM,
    lengthM,
    status: "active",
    createdAtGameTimeMs: state.clock.currentTimeMs,
    updatedAtGameTimeMs: state.clock.currentTimeMs,
  };
}

export function createOperatingTrain(
  state: MapState,
  routeId: string,
  formationId: string,
  name: string,
  speedKph = 80,
  dwellSeconds = 5
): OperatingTrain {
  const route = requireRoute(state, routeId);
  if (!formationId.trim()) throw new Error("編成IDを入力してください");
  if (!Number.isFinite(speedKph) || speedKph <= 0) throw new Error("列車速度は0より大きくしてください");
  const firstLegTrack = route.legs[0]?.tracks[0];
  if (!firstLegTrack) throw new Error("走行区間のない運行経路です");
  const startDistM = firstLegTrack.direction === "forward" ? firstLegTrack.startDistanceM : firstLegTrack.endDistanceM;
  return {
    id: `operating-train-${state.nextOperatingTrainId}`,
    name: name.trim() || `列車 ${state.nextOperatingTrainId}`,
    formationId: formationId.trim(),
    routeId,
    speedKph,
    dwellSeconds,
    state: "dwelling",
    legIndex: 0,
    traversalIndex: 0,
    distanceOnTraversalM: 0,
    remainingDwellSeconds: dwellSeconds,
    position: pointAtTrackDistance(state, firstLegTrack.trackId, startDistM),
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
  let travelM = (remainingSeconds * train.speedKph) / 3.6;
  while (travelM > 0 && train.state === "running") {
    const leg = route.legs[train.legIndex];
    const trackTraversal = leg?.tracks?.[train.traversalIndex];
    if (!trackTraversal) {
      train.state = "completed";
      return;
    }
    const length = trackTraversal.lengthM;
    const available = length - train.distanceOnTraversalM;
    const used = Math.min(travelM, available);
    train.distanceOnTraversalM += used;
    travelM -= used;
    const currentDistM =
      trackTraversal.direction === "forward"
        ? trackTraversal.startDistanceM + train.distanceOnTraversalM
        : trackTraversal.endDistanceM - train.distanceOnTraversalM;
    train.position = pointAtTrackDistance(state, trackTraversal.trackId, currentDistM);
    if (train.distanceOnTraversalM + 1e-6 < length) break;
    train.traversalIndex += 1;
    train.distanceOnTraversalM = 0;
    if (train.traversalIndex < leg.tracks.length) continue;
    train.legIndex += 1;
    train.traversalIndex = 0;
    if (train.legIndex >= route.legs.length) {
      train.state = "completed";
      break;
    }
    const nextLegStop = route.stops?.[train.legIndex];
    train.state = "dwelling";
    train.remainingDwellSeconds = nextLegStop?.dwellSeconds ?? train.dwellSeconds;
    break;
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

function requireRoute(state: MapState, id: string): Route {
  const route = state.routes[id];
  if (!route) throw new Error(`運行経路が存在しません: ${id}`);
  return route;
}

function stopMidpoint(stop: { startDistanceM: number; endDistanceM: number }) {
  return (stop.startDistanceM + stop.endDistanceM) / 2;
}

function nodeKey(trackId: string, distance: number) {
  return `${trackId}@${distance.toFixed(6)}`;
}

function addEdge(graph: Map<string, Edge[]>, from: string, edge: Edge) {
  graph.set(from, [...(graph.get(from) ?? []), edge]);
}

function coalesceTraversals(items: RouteTraversal[]): RouteTraversal[] {
  const result: RouteTraversal[] = [];
  for (const item of items) {
    const previous = result.at(-1);
    if (previous && previous.trackId === item.trackId && Math.abs(previous.toDistanceM - item.fromDistanceM) < 0.001) {
      previous.toDistanceM = item.toDistanceM;
    } else {
      result.push({ ...item });
    }
  }
  return result;
}
