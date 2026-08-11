import type { TrackSpecification } from "../data/trackCatalog";

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

export interface RouteTraversal {
  trackId: string;
  fromDistanceM: number;
  toDistanceM: number;
}

export interface OperationRoute {
  id: string;
  name: string;
  stationIds: string[];
  legs: RouteTraversal[][];
  lengthM: number;
}

export interface OperatingTrain {
  id: string;
  name: string;
  formationId: string;
  routeId: string;
  speedKph: number;
  dwellSeconds: number;
  state: "running" | "dwelling" | "completed";
  legIndex: number;
  traversalIndex: number;
  distanceOnTraversalM: number;
  remainingDwellSeconds: number;
  position: Point;
}

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
  version: 8;
  clock: SimulationClock;
  tracks: Track[];
  trackGroups: TrackGroup[];
  junctions: TrackJunction[];
  stations: Station[];
  routes: OperationRoute[];
  operatingTrains: OperatingTrain[];
  nextTrackId: number;
  nextTrackGroupId: number;
  nextJunctionId: number;
  nextStationId: number;
  nextRouteId: number;
  nextOperatingTrainId: number;
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
  return { version: 8, clock: createInitialClock(), tracks: [], trackGroups: [], junctions: [], stations: [], routes: [], operatingTrains: [], nextTrackId: 1, nextTrackGroupId: 1, nextJunctionId: 1, nextStationId: 1, nextRouteId: 1, nextOperatingTrainId: 1 };
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
