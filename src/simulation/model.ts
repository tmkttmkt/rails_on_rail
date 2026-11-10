import type { TrackSpecification } from "../data/trackCatalog";
import type { YardState } from "./yard";
import { createInitialFleetState, type FleetState } from "./fleet";
import type {
  CommercialStopType,
  Line,
  Operation,
  OperationExecution,
  OperationExecutionStatus,
  OperationLineAssignment,
  OperationStopTime,
  Route,
  RouteLeg,
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
  OperationLineAssignment,
  OperationStopTime,
  Route,
  RouteLeg,
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

// 線路の運転上の区分。設備規格とは別で、規格の上に乗る運用の制約である。
export type TrackKind = "main" | "side";
export const TRACK_KINDS: readonly TrackKind[] = ["main", "side"];
export const TRACK_KIND_LABELS: Record<TrackKind, string> = { main: "本線", side: "側線" };

export interface Track {
  id: string;
  kind: TrackKind;
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

export type TurnoutSide = "left" | "right";

export interface Turnout {
  id: string;
  junctionId: string;
  typeId: string;
  throughTrackId: string;
  divergingTrackId: string;
  side: TurnoutSide;
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

// 停車場の種類。日本の鉄道では停車場が上位区分であり、
// 駅・信号場・操車場はその種類である。
export type StationKind = "station" | "signal-box" | "yard" | "depot";
export const STATION_KINDS: readonly StationKind[] = ["station", "signal-box", "yard", "depot"];
export const STATION_KIND_LABELS: Record<StationKind, string> = {
  "station": "駅",
  "signal-box": "信号場",
  "yard": "操車場",
  "depot": "車両基地",
};

export const FACILITY_USES = ["unknown", "stabling", "headshunt", "maintenance", "depot"] as const;
export type FacilityUse = typeof FACILITY_USES[number];
export const FACILITY_USE_LABELS: Record<FacilityUse, string> = { unknown: "用途未確認", stabling: "留置線", headshunt: "引上げ線", maintenance: "保守用側線", depot: "車庫・検修施設" };

export interface Station {
  id: string;
  name: string;
  kind: StationKind;
  position: Point;
  stopPoints: StationStopPoint[];
  /** 駅の存在は確認済みだが旅客停車範囲は未確定。範囲の代用を作らない。 */
  unresolvedReason?: string;
  facilityUse?: FacilityUse;
}

export const STATION_AREA_ROLES = ["platform", "stabling", "headshunt", "workshop", "maintenance", "throat", "transit", "unknown"] as const;
export type StationAreaRole = typeof STATION_AREA_ROLES[number];
export const STATION_AREA_LABELS: Record<StationAreaRole, string> = { platform: "旅客ホーム", stabling: "留置線群", headshunt: "引上げ線", workshop: "検修・作業線群", maintenance: "保守用側線", throat: "分岐・咽喉部", transit: "入出庫・接続通路", unknown: "用途未確認" };
export interface StationComplex { id: string; name: string }
export interface StationAreaRange { trackId: string; startM: number; endM: number }
export interface StationArea { id: string; complexId: string; name: string; role: StationAreaRole; ranges: StationAreaRange[]; stationId?: string; basis: "source" | "layout"; note?: string }

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
  yard?: YardState;
  version: 15;
  clock: SimulationClock;
  tracks: Track[];
  trackGroups: TrackGroup[];
  junctions: TrackJunction[];
  turnouts: Turnout[];
  stations: Station[];
  stationComplexes: StationComplex[];
  stationAreas: StationArea[];
  nextStationComplexId: number;
  nextStationAreaId: number;
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
  nextTurnoutId: number;
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
    version: 15,
    clock: createInitialClock(),
    tracks: [],
    trackGroups: [],
    junctions: [],
    turnouts: [],
    stations: [],
    stationComplexes: [], stationAreas: [], nextStationComplexId: 1, nextStationAreaId: 1,
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
    nextTurnoutId: 1,
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
  const yardCut = state.yard?.cuts.find((c) => c.id === formationId);
  if (yardCut) return yardCut.move ? "operating" : "placed";
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

// 拡大率の範囲。1.0 = 1 px/m。
// 転てつ器や軌道の細部を見るため高倍率側を広く取り、
// 数十km規模の取り込みマップを俯瞰するため低倍率側も広げている。
export const CAMERA_MIN_ZOOM = 0.01;
export const CAMERA_MAX_ZOOM = 2000;

export function zoomAt(
  camera: Camera,
  screenPoint: Point,
  nextZoom: number,
  viewport: Viewport,
): Camera {
  const anchor = screenToWorld(screenPoint, camera, viewport);
  const zoom = Math.min(CAMERA_MAX_ZOOM, Math.max(CAMERA_MIN_ZOOM, nextZoom));
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
