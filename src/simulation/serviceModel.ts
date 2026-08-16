export interface Line {
  id: string;
  name: string;
  code?: string;
  color: string;
  displayOrder: number;
  createdAtGameTimeMs?: number;
  updatedAtGameTimeMs?: number;
}

export interface ServiceSystem {
  id: string;
  lineId: string;
  name: string;
  shortName?: string;
  color?: string; // If undefined, derived display color falls back to parent Line color
  description?: string;
  displayOrder: number;
  createdAtGameTimeMs?: number;
  updatedAtGameTimeMs?: number;
}

export type CommercialStopType = "stop" | "pass";

export interface RouteStop {
  id: string;
  sequence: number; // 1-indexed, sequential
  stationId: string;
  trackId: string;
  stopPointId?: string;
  stopPointIndex?: number;
  distanceM: number;
  commercialType: CommercialStopType;
  dwellSeconds?: number;
}

export interface RouteTraversalTrack {
  trackId: string;
  direction: "forward" | "reversed";
  startDistanceM: number;
  endDistanceM: number;
  lengthM: number;
}

export interface RouteTraversal {
  trackId: string;
  fromDistanceM: number;
  toDistanceM: number;
}

export interface RouteTraversalLeg {
  fromStopSequence: number;
  toStopSequence: number;
  tracks: RouteTraversalTrack[];
  junctionIds: string[];
  totalDistanceM: number;
}

export type RouteLeg = RouteTraversalLeg;

export interface RouteLineSection {
  id: string;
  fromStopId: string;
  toStopId: string;
  lineId: string;
  serviceSystemId?: string;
}

export interface Route {
  id: string;
  name: string;
  directionName: string; // e.g. "下り", "上り", or custom
  stops: RouteStop[];
  legs: RouteLeg[];
  lineSections: RouteLineSection[];
  totalDistanceM?: number;
  lengthM?: number;
  status?: "active" | "invalid";
  stationIds?: string[];
  servicePatternId?: string;
  directionId?: string;
  createdAtGameTimeMs?: number;
  updatedAtGameTimeMs?: number;
}

export interface ServiceCalendar {
  startDate?: string; // "YYYY-MM-DD"
  endDate?: string;   // "YYYY-MM-DD"
  weekdays: number[]; // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  includedDates?: string[]; // "YYYY-MM-DD"
  excludedDates?: string[]; // "YYYY-MM-DD"
}

export interface OperationStopTime {
  routeStopId: string;
  arrivalTime?: string;   // "HH:mm:ss" or "HH:mm"
  departureTime?: string; // "HH:mm:ss" or "HH:mm"
  dayOffset: number;      // 0 or positive integer, supports multi-day (>= 0)
}

export interface Operation {
  id: string;
  name: string;
  operationNumber?: string;
  routeId: string;
  calendar: ServiceCalendar;
  stopTimes: OperationStopTime[];
  description?: string;
  requiresReview?: boolean; // Set true when route stop topology changes
  createdAtGameTimeMs?: number;
  updatedAtGameTimeMs?: number;
}

export interface VehicleDutyAssignment {
  operationId: string;
  sequence: number; // 1-indexed, sequential
  serviceDayOffset: number; // 0 or positive integer (duty day offset)
}

export interface VehicleDuty {
  id: string;
  name: string;
  assignments: VehicleDutyAssignment[];
  defaultFormationId?: string;
  createdAtGameTimeMs?: number;
  updatedAtGameTimeMs?: number;
}

export interface VehicleDutyExecution {
  id: string;
  vehicleDutyId: string;
  serviceDate: string; // "YYYY-MM-DD"
  formationId?: string; // Per-date replacement formation (falls back to defaultFormationId)
  cancelledOperationIds?: string[];
  createdAtGameTimeMs?: number;
  updatedAtGameTimeMs?: number;
}

export type OperationExecutionStatus =
  | "planned"
  | "reserved"
  | "operating"
  | "completed"
  | "cancelled"
  | "failed";

export interface OperationExecution {
  id: string;
  operationId: string;
  vehicleDutyId?: string;
  vehicleDutyExecutionId?: string;
  formationId: string;
  serviceDate: string; // "YYYY-MM-DD"
  scheduledDepartureTimeMs: number;
  actualDepartureTimeMs?: number;
  completedTimeMs?: number;
  requestedSpeedKph: number;
  dwellSeconds?: number;
  status: OperationExecutionStatus;
  currentStopSequence: number;
  operatingTrainId?: string;
  failureReason?: string;
  createdAtGameTimeMs: number;
  updatedAtGameTimeMs: number;
}

/**
 * Derives the display color for a service system.
 * If system.color is not defined, inherits from parent line.
 */
export function getServiceSystemDisplayColor(system?: ServiceSystem, parentLine?: Line): string {
  return system?.color || parentLine?.color || "#E65A00";
}

/**
 * Parses time string (HH:mm:ss or HH:mm) into total seconds from midnight.
 */
export function parseTimeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(":").map((p) => Number(p));
  if (parts.some((p) => !Number.isFinite(p) || p < 0)) return 0;
  const hours = parts[0] || 0;
  const minutes = parts[1] || 0;
  const seconds = parts[2] || 0;
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Calculates absolute seconds from duty start considering dayOffset.
 */
export function getAbsoluteTimeSeconds(timeStr: string | undefined, dayOffset: number): number {
  if (!timeStr) return 0;
  return Math.max(0, dayOffset) * 86400 + parseTimeToSeconds(timeStr);
}

/**
 * Formats time in seconds from midnight with dayOffset label.
 * e.g. dayOffset=0: "08:30", dayOffset=1: "翌 00:20", dayOffset=2: "2日後 03:10"
 */
export function formatTimeWithDayOffset(timeStr: string | undefined, dayOffset: number = 0): string {
  if (!timeStr) return "—";
  const normTime = timeStr.slice(0, 5); // "HH:mm"
  if (dayOffset <= 0) return normTime;
  if (dayOffset === 1) return `翌 ${normTime}`;
  return `${dayOffset}日後 ${normTime}`;
}

/**
 * Converts date milliseconds to YYYY-MM-DD UTC date string.
 */
export function formatServiceDateUtc(timeMs: number): string {
  const date = new Date(timeMs);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Converts YYYY-MM-DD + timeStr + dayOffset to epoch ms in UTC.
 */
export function serviceTimeToEpochMs(serviceDate: string, timeStr: string, dayOffset: number = 0): number {
  const [year, month, day] = serviceDate.split("-").map(Number);
  const totalSeconds = getAbsoluteTimeSeconds(timeStr, dayOffset);
  const baseUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0);
  return baseUtcMs + totalSeconds * 1000;
}
