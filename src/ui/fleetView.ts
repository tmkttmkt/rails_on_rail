import type { FormationOperationalStatus } from "../simulation/model";

export type LeftSubTab = "formations" | "vehicles" | "acquire";
export type AcquireCategory = "units" | "templates";
export type FormationFilter = "all" | "unplaced" | "placed" | "reserved" | "operating" | "awaiting-placement";
export type DispatchMode = "immediate" | "scheduled";

export interface FleetUiState {
  selectedFormationId: string | null;
  selectedVehicleId: string | null;
  leftSubTab: LeftSubTab;
  acquireCategory: AcquireCategory;
  formationFilter: FormationFilter;
  dispatchMode: DispatchMode;
  scheduledTimeText: string;
}

export function createInitialFleetUiState(): FleetUiState {
  return {
    selectedFormationId: null,
    selectedVehicleId: null,
    leftSubTab: "formations",
    acquireCategory: "templates",
    formationFilter: "all",
    dispatchMode: "immediate",
    scheduledTimeText: "",
  };
}

export function formatGameTime(timeMs: number): string {
  const date = new Date(timeMs);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${y}/${m}/${d} ${hh}:${mm}`;
}

export function parseGameTimeText(text: string): number | null {
  const trimmed = text.trim();
  const match = trimmed.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}))?$/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);
  const hour = match[4] ? parseInt(match[4], 10) : 0;
  const minute = match[5] ? parseInt(match[5], 10) : 0;
  if (month < 0 || month > 11 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return Date.UTC(year, month, day, hour, minute, 0);
}

export function getStatusLabel(status: FormationOperationalStatus): string {
  switch (status) {
    case "unplaced":
      return "未配置";
    case "placed":
      return "駅配置";
    case "reserved":
      return "予約済み";
    case "operating":
      return "運行中";
    case "awaiting-placement":
      return "配置回収待ち";
  }
}

export function getStatusBadgeClass(status: FormationOperationalStatus): string {
  switch (status) {
    case "unplaced":
      return "badge-unplaced";
    case "placed":
      return "badge-placed";
    case "reserved":
      return "badge-reserved";
    case "operating":
      return "badge-operating";
    case "awaiting-placement":
      return "badge-awaiting";
  }
}
