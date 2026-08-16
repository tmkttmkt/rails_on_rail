import type { TrackSpecification } from "../data/trackCatalog";
import { createInitialFleetState, type FleetState } from "./fleet";
import type {
  CommercialStopType,
  Line,
  Operation,
  OperationExecution,
  OperationExecutionStatus,
  OperationStopTime,
  Route,
  RouteLeg,
  RouteLineSection,
  RouteStop,
  RouteTraversal,
  RouteTraversalLeg,
  RouteTraversalTrack,
  ServiceCalendar,
  ServiceSystem,
  VehicleDuty,
  VehicleDutyAssignment,
  VehicleDutyExecution,
} from "./serviceModel";

export type {
  CommercialStopType,
  Line,
  Operation,
  OperationExecution,
  OperationExecutionStatus,
  OperationStopTime,
  Route,
  RouteLeg,
  RouteLineSection,
  RouteStop,
  RouteTraversal,
  RouteTraversalLeg,
  RouteTraversalTrack,
  ServiceCalendar,
  ServiceSystem,
  VehicleDuty,
  VehicleDutyAssignment,
  VehicleDutyExecution,
};

// Aliases for compatibility
export type TrainRunStatus = OperationExecutionStatus;
export type TrainRun = OperationExecution;
export type OperationRoute = Route;

export interface Point {
  x: number;
  y: number;
}

export interface Track {
  id: string;
  geometry: TrackGeometry;
  points: Point[];
  resolvedPath: boolean;
  specification: TrackSpecification;
  startConnection?: TrackConnection;
  endConnection?: TrackConnection;
  startTangent?: Point;
  endTangent?: Point;
  engineering: TrackEngineering;
}

export interface TrackEngineering {
  designSpeedKmh: number;
  builtMinimumRadiusM: number | null;
  cantProfile: CantPoint[];
}

export interface CantPoint {
  distanceM: number;
  cantMm: number;
}

export interface TrackConnection {
  trackId: string;
  junctionId?: string;
}

export type TrackJunctionPortLocation = "start" | "end" | "interior";

export interface TrackJunctionPort {
  trackId: string;
  location: TrackJunctionPortLocation;
  distanceM: number;
}

export interface TrackJunction {
  id: string;
  position: Point;
  ports: TrackJunctionPort[];
}

export interface StationStopPoint {
  id: string;
  trackId: string;
  startDistanceM: number;
  endDistanceM: number;
  startPosition: Point;
  endPosition: Point;
  direction: "both";
}

export interface Station {
  id: string;
  name: string;
  position: Point;
  stopPoints: StationStopPoint[];
}

export interface TrackGroup {
  id: string;
  name: string;
  trackIds: string[];
}

export interface OperatingTrain {
  id: string;
  name: string;
  formationId: string;
  routeId: string;
  trainRunId?: string;
  operationExecutionId?: string;
  speedKph: number;
  dwellSeconds: number;
  state: "running" | "dwelling" | "completed";
  legIndex: number;
  traversalIndex: number;
  distanceOnTraversalM: number;
  remainingDwellSeconds: number;
  position: Point;
}

export interface VehiclePlacement {
  id: string;
  formationId: string;
  stationId: string;
  trackId: string;
  centerDistanceM: number;
  occupiedStartDistanceM: number;
  occupiedEndDistanceM: number;
  orientation: "forward" | "reversed";
}

export type FormationOperationalStatus = "unplaced" | "placed" | "reserved" | "operating" | "awaiting-placement";

export type TrackGeometry = "straight" | "curve";

export const SIMULATION_SPEEDS = [1, 60, 300, 1800] as const;
export type SimulationSpeed = typeof SIMULATION_SPEEDS[number];
export const INITIAL_SIMULATION_TIME_MS = Date.UTC(1900, 0, 1, 6, 0, 0);

export interface SimulationClock {
  currentTimeMs: number;
  paused: boolean;
  speedMultiplier: SimulationSpeed;
}

export interface MapState {
  version: 11;
  clock: SimulationClock;
  tracks: Track[];
  trackGroups: TrackGroup[];
  junctions: TrackJunction[];
  stations: Station[];
  lines: Record<string, Line>;
  serviceSystems: Record<string, ServiceSystem>;
  routes: Record<string, Route>;
  operations: Record<string, Operation>;
  vehicleDuties: Record<string, VehicleDuty>;
  vehicleDutyExecutions: Record<string, VehicleDutyExecution>;
  operationExecutions: Record<string, OperationExecution>;
  operatingTrains: OperatingTrain[];
  fleet: FleetState;
  vehiclePlacements: VehiclePlacement[];
  // Backward compatibility alias properties
  operationRoutes: Record<string, any>;
  servicePatterns: Record<string, any>;
  stopPatterns: Record<string, any>;
  trainRuns: Record<string, any>;
  nextOperationRouteId?: number;
  nextServicePatternId?: number;
  nextStopPatternId?: number;
  nextTrainRunId?: number;
  nextTrackId: number;
  nextTrackGroupId: number;
  nextJunctionId: number;
  nextStationId: number;
  nextLineId: number;
  nextServiceSystemId: number;
  nextRouteId: number;
  nextOperationId: number;
  nextVehicleDutyId: number;
  nextVehicleDutyExecutionId: number;
  nextOperationExecutionId: number;
  nextOperatingTrainId: number;
  nextOperatorClassId: number;
  nextVehicleUnitId: number;
  nextFormationId: number;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
  rotation: number; // ラジアン、0 = 北向き
}

export interface Viewport {
  width: number;
  height: number;
}

export function createInitialState(): MapState {
  const state: MapState = {
    version: 11,
    clock: createInitialClock(),
    tracks: [],
    trackGroups: [],
    junctions: [],
    stations: [],
    lines: {},
    serviceSystems: {},
    routes: {},
    operations: {},
    vehicleDuties: {},
    vehicleDutyExecutions: {},
    operationExecutions: {},
    operatingTrains: [],
    fleet: createInitialFleetState(),
    vehiclePlacements: [],
    operationRoutes: {},
    servicePatterns: {},
    stopPatterns: {},
    trainRuns: {},
    nextOperationRouteId: 1,
    nextServicePatternId: 1,
    nextStopPatternId: 1,
    nextTrainRunId: 1,
    nextTrackId: 1,
    nextTrackGroupId: 1,
    nextJunctionId: 1,
    nextStationId: 1,
    nextLineId: 1,
    nextServiceSystemId: 1,
    nextRouteId: 1,
    nextOperationId: 1,
    nextVehicleDutyId: 1,
    nextVehicleDutyExecutionId: 1,
    nextOperationExecutionId: 1,
    nextOperatingTrainId: 1,
    nextOperatorClassId: 1,
    nextVehicleUnitId: 1,
    nextFormationId: 1,
  };
  return state;
}

export function getFormationOperationalStatus(state: MapState, formationId: string): FormationOperationalStatus {
  if (
    state.operatingTrains.some((train) => train.formationId === formationId && train.state !== "completed") ||
    Object.values(state.operationExecutions || {}).some(
      (exec) => exec.formationId === formationId && exec.status === "operating"
    )
  ) {
    return "operating";
  }
  if (
    Object.values(state.operationExecutions || {}).some(
      (exec) => exec.formationId === formationId && (exec.status === "reserved" || exec.status === "planned")
    )
  ) {
    return "reserved";
  }
  if (state.vehiclePlacements.some((placement) => placement.formationId === formationId)) {
    return "placed";
  }
  if (
    state.operatingTrains.some((train) => train.formationId === formationId && train.state === "completed") ||
    Object.values(state.operationExecutions || {}).some(
      (exec) => exec.formationId === formationId && exec.status === "completed"
    )
  ) {
    return "awaiting-placement";
  }
  return "unplaced";
}

export function createInitialClock(): SimulationClock {
  return { currentTimeMs: INITIAL_SIMULATION_TIME_MS, paused: true, speedMultiplier: 1 };
}

export function createInitialCamera(): Camera {
  return { x: 0, y: 0, zoom: 1, rotation: 0 };
}

export function worldToScreen(point: Point, camera: Camera, viewport: Viewport): Point {
  return {
    x: (point.x - camera.x) * camera.zoom + viewport.width / 2,
    y: (point.y - camera.y) * camera.zoom + viewport.height / 2,
  };
}

export function screenToWorld(point: Point, camera: Camera, viewport: Viewport): Point {
  const cos = Math.cos(camera.rotation);
  const sin = Math.sin(camera.rotation);
  const dx = (point.x - viewport.width / 2) / camera.zoom;
  const dy = (point.y - viewport.height / 2) / camera.zoom;
  return {
    x: camera.x + dx * cos - dy * sin,
    y: camera.y + dx * sin + dy * cos,
  };
}

export function zoomAt(
  camera: Camera,
  screenPoint: Point,
  nextZoom: number,
  viewport: Viewport,
): Camera {
  const anchor = screenToWorld(screenPoint, camera, viewport);
  const zoom = Math.min(4, Math.max(0.2, nextZoom));
  const cos = Math.cos(camera.rotation);
  const sin = Math.sin(camera.rotation);
  const dx = (screenPoint.x - viewport.width / 2) / zoom;
  const dy = (screenPoint.y - viewport.height / 2) / zoom;
  return {
    x: anchor.x - (dx * cos - dy * sin),
    y: anchor.y - (dx * sin + dy * cos),
    zoom,
    rotation: camera.rotation,
  };
}

export function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}
