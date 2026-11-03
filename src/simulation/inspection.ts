import { analyzeLine, calculateTangentAngleDifferenceRad, closestPointOnSegment, getTrackPortTangent, isTangentContinuous, sampleTrack } from "./geometry";
import type { MapState, Point, TrackJunctionPortLocation } from "./model";
import { buildOperationRoute } from "./pathfinding";

export interface TrackRadiusInspection {
  trackId: string;
  geometry: "straight" | "curve";
  minimumRadiusM: number | null;
}

export interface MapRadiusInspection {
  tracks: TrackRadiusInspection[];
  minimumRadiusM: number | null;
  topology: MapTopologyInspection;
}

export interface UnconnectedEndpointInspection {
  trackId: string;
  endpoint: "start" | "end";
  point: Point;
}

export interface NearMissInspection extends UnconnectedEndpointInspection {
  nearTrackId: string;
  distanceM: number;
}

export interface InvalidConnectionDetail {
  junctionId: string;
  trackId1: string;
  location1: TrackJunctionPortLocation;
  trackId2: string;
  location2: TrackJunctionPortLocation;
  angleDifferenceDeg: number;
}

export interface MapTopologyInspection {
  connectedComponents: string[][];
  isolatedTrackIds: string[];
  unconnectedEndpoints: UnconnectedEndpointInspection[];
  nearMisses: NearMissInspection[];
  invalidConnections: InvalidConnectionDetail[];
}

export function inspectTrackRadii(state: Pick<MapState, "tracks">): MapRadiusInspection {
  const tracks = state.tracks.map((track): TrackRadiusInspection => ({
    trackId: track.id,
    geometry: track.geometry,
    minimumRadiusM: analyzeLine(sampleTrack(track)).minimumRadiusM,
  }));
  const finiteRadii = tracks.flatMap((track) => track.minimumRadiusM === null ? [] : [track.minimumRadiusM]);
  return {
    tracks,
    minimumRadiusM: finiteRadii.length > 0 ? Math.min(...finiteRadii) : null,
    topology: inspectTopology(state as Pick<MapState, "tracks" | "junctions">),
  };
}

function inspectTopology(state: Pick<MapState, "tracks" | "junctions">): MapTopologyInspection {
  const adjacency = new Map(state.tracks.map((track) => [track.id, new Set<string>()]));
  const connectedEnds = new Set<string>();
  const invalidConnections: InvalidConnectionDetail[] = [];
  const recordedInvalidPairs = new Set<string>();

  for (const junction of state.junctions ?? []) {
    for (let i = 0; i < junction.ports.length; i += 1) {
      const port = junction.ports[i];
      const track1 = state.tracks.find((t) => t.id === port.trackId);
      for (let j = i + 1; j < junction.ports.length; j += 1) {
        const other = junction.ports[j];
        if (port.trackId === other.trackId) continue;
        const track2 = state.tracks.find((t) => t.id === other.trackId);

        let isContinuous = true;
        let angleDiffDeg = 0;

        if (track1 && track2) {
          const tangent1 = getTrackPortTangent(track1, port.location, port.distanceM);
          const tangent2 = getTrackPortTangent(track2, other.location, other.distanceM);
          const angleDiffRad = calculateTangentAngleDifferenceRad(tangent1, tangent2);
          angleDiffDeg = angleDiffRad * (180 / Math.PI);
          isContinuous = isTangentContinuous(tangent1, tangent2);
        }

        if (isContinuous) {
          adjacency.get(port.trackId)?.add(other.trackId);
          adjacency.get(other.trackId)?.add(port.trackId);
          if (port.location === "start" || port.location === "end") connectedEnds.add(`${port.trackId}:${port.location}`);
          if (other.location === "start" || other.location === "end") connectedEnds.add(`${other.trackId}:${other.location}`);
        } else {
          const pairKey = `${junction.id}:${[port.trackId, other.trackId].sort().join(":")}`;
          if (!recordedInvalidPairs.has(pairKey)) {
            recordedInvalidPairs.add(pairKey);
            invalidConnections.push({
              junctionId: junction.id,
              trackId1: port.trackId,
              location1: port.location,
              trackId2: other.trackId,
              location2: other.location,
              angleDifferenceDeg: Math.round(angleDiffDeg * 10) / 10,
            });
          }
        }
      }
    }
  }

  const connectedComponents: string[][] = [];
  const visited = new Set<string>();
  for (const track of state.tracks) {
    if (visited.has(track.id)) continue;
    const component: string[] = [];
    const pending = [track.id];
    visited.add(track.id);
    while (pending.length > 0) {
      const current = pending.pop()!;
      component.push(current);
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) { visited.add(neighbor); pending.push(neighbor); }
      }
    }
    connectedComponents.push(component.sort(trackIdOrder));
  }
  const componentByTrackId = new Map<string, number>();
  connectedComponents.forEach((component, componentIndex) => component.forEach((trackId) => componentByTrackId.set(trackId, componentIndex)));
  const unconnectedEndpoints = state.tracks.flatMap((track): UnconnectedEndpointInspection[] => {
    const path = sampleTrack(track);
    return (["start", "end"] as const).flatMap((endpoint) => connectedEnds.has(`${track.id}:${endpoint}`) ? [] : [{
      trackId: track.id,
      endpoint,
      point: { ...(endpoint === "start" ? path[0] : path.at(-1)!) },
    }]);
  });
  const nearMisses = unconnectedEndpoints.flatMap((endpoint): NearMissInspection[] => {
    let nearest: { trackId: string; distanceM: number } | null = null;
    for (const track of state.tracks) {
      if (track.id === endpoint.trackId) continue;
      if (componentByTrackId.get(track.id) === componentByTrackId.get(endpoint.trackId)) continue;
      const path = sampleTrack(track);
      for (let index = 0; index < path.length - 1; index += 1) {
        const distanceM = closestPointOnSegment(endpoint.point, path[index], path[index + 1]).distance;
        if (!nearest || distanceM < nearest.distanceM) nearest = { trackId: track.id, distanceM };
      }
    }
    return nearest && nearest.distanceM <= 2
      ? [{ ...endpoint, nearTrackId: nearest.trackId, distanceM: nearest.distanceM }]
      : [];
  });
  return {
    connectedComponents: connectedComponents.sort((a, b) => b.length - a.length),
    isolatedTrackIds: state.tracks.filter((track) => (adjacency.get(track.id)?.size ?? 0) === 0).map((track) => track.id),
    unconnectedEndpoints,
    nearMisses,
    invalidConnections,
  };
}

function trackIdOrder(first: string, second: string): number {
  return Number(first.match(/\d+$/)?.[0] ?? 0) - Number(second.match(/\d+$/)?.[0] ?? 0) || first.localeCompare(second);
}

export interface OperationRouteInspectionResult {
  valid: boolean;
  summary: {
    totalDistanceM: number;
    legCount: number;
    tangentValid: boolean;
  } | null;
  errors: Array<{ code: string; message: string; field?: string }>;
  warnings: Array<{ code: string; message: string }>;
}

export function inspectOperationRoute(
  state: MapState,
  params: {
    servicePatternId: string;
    directionId: string;
    stops: Array<{ stationId: string; trackId: string }>;
  }
): OperationRouteInspectionResult {
  const errors: Array<{ code: string; message: string; field?: string }> = [];
  const warnings: Array<{ code: string; message: string }> = [];

  const sp = state.servicePatterns?.[params.servicePatternId] || state.serviceSystems?.[params.servicePatternId];
  if (!sp) {
    errors.push({ code: "ERR_SERVICE_PATTERN_NOT_FOUND", message: `指定された運行系統 (${params.servicePatternId}) が存在しません。` });
    return { valid: false, summary: null, errors, warnings };
  }

  if (!params.stops || params.stops.length < 2) {
    errors.push({ code: "ERR_INVALID_STOPS", message: "運行経路には2つ以上の停車駅を指定してください。" });
    return { valid: false, summary: null, errors, warnings };
  }

  try {
    const route = buildOperationRoute(state, {
      servicePatternId: params.servicePatternId,
      directionId: params.directionId,
      name: "Inspect Route",
      stops: params.stops,
    });

    for (const stop of route.stops) {
      if (stop.commercialType === "pass") {
        const station = state.stations.find((s: any) => s.id === stop.stationId);
        warnings.push({ code: "WARN_PASS_STATION_NO_STOP", message: `${station?.name || stop.stationId}は通過指定されています。` });
      }
    }

    return {
      valid: true,
      summary: {
        totalDistanceM: route.totalDistanceM ?? route.lengthM ?? 0,
        legCount: route.legs.length,
        tangentValid: true,
      },
      errors: [],
      warnings,
    };
  } catch (err: any) {
    errors.push({
      code: "ERR_NO_VALID_PATH",
      message: err instanceof Error ? err.message : "経路作成事前検証に失敗しました",
    });
    return { valid: false, summary: null, errors, warnings };
  }
}

export interface TrainRunInspectionResult {
  valid: boolean;
  eligibility: {
    formationPlaced: boolean;
    stationMatched: boolean;
    trackMatched: boolean;
    orientationMatched: boolean;
    notReserved: boolean;
  };
  errors: Array<{ code: string; message: string }>;
}

export function inspectTrainRun(
  state: MapState,
  params: {
    routeId: string;
    formationId: string;
    scheduledDepartureTimeMs?: number;
  }
): TrainRunInspectionResult {
  const errors: Array<{ code: string; message: string }> = [];
  const eligibility = {
    formationPlaced: false,
    stationMatched: false,
    trackMatched: false,
    orientationMatched: false,
    notReserved: false,
  };

  const route = state.operationRoutes?.[params.routeId];
  if (!route) {
    errors.push({ code: "ERR_ROUTE_NOT_FOUND", message: `指定された運行経路 (${params.routeId}) が存在しません。` });
    return { valid: false, eligibility, errors };
  }

  const formation = state.fleet?.formations?.find((f: any) => f.id === params.formationId);
  if (!formation) {
    errors.push({ code: "ERR_FORMATION_NOT_FOUND", message: `指定された編成 (${params.formationId}) が存在しません。` });
    return { valid: false, eligibility, errors };
  }

  const placement = state.vehiclePlacements?.find((p: any) => p.formationId === params.formationId);
  if (!placement) {
    errors.push({ code: "ERR_FORMATION_NOT_PLACED", message: "編成が駅に配置されていません。" });
  } else {
    eligibility.formationPlaced = true;

    const startStop = route.stops?.[0];
    const startStationId = startStop?.stationId || route.stationIds[0];
    const startTrackId = startStop?.trackId || route.legs?.[0]?.tracks?.[0]?.trackId;

    if (placement.stationId === startStationId) {
      eligibility.stationMatched = true;
    } else {
      errors.push({ code: "ERR_PLACEMENT_STATION_MISMATCH", message: `配置駅 (${placement.stationId}) が経路始発駅 (${startStationId}) と一致しません。` });
    }

    if (placement.trackId === startTrackId) {
      eligibility.trackMatched = true;
    } else {
      errors.push({ code: "ERR_PLACEMENT_TRACK_MISMATCH", message: `配置線路 (${placement.trackId}) が経路始発線路 (${startTrackId}) と一致しません。` });
    }

    const firstLeg = route.legs?.[0];
    if (firstLeg && firstLeg.tracks && firstLeg.tracks.length > 0) {
      const initialDir = firstLeg.tracks[0].direction;
      if (placement.orientation === initialDir) {
        eligibility.orientationMatched = true;
      } else {
        errors.push({ code: "ERR_PLACEMENT_ORIENTATION_MISMATCH", message: `編成の配置向き (${placement.orientation}) が経路始発進行方向 (${initialDir}) と逆向きです。` });
      }
    }
  }

  const isReserved = Object.values(state.trainRuns || {}).some(
    (run: any) => run.formationId === params.formationId && (run.status === "reserved" || run.status === "operating")
  );

  if (!isReserved) {
    eligibility.notReserved = true;
  } else {
    errors.push({ code: "ERR_FORMATION_ALREADY_RESERVED", message: "対象編成は既に他の運行に割り当てられています。" });
  }

  const valid = eligibility.formationPlaced && eligibility.stationMatched && eligibility.trackMatched && eligibility.orientationMatched && eligibility.notReserved;
  return { valid, eligibility, errors };
}
