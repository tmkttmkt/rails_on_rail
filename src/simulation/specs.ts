// 鉄道規格の型定義。
// 実際の規格値は data/ 以下の YAML 原本で定義し、ここでは型のみを置く。
// Phase 1 で必要な範囲を定義し、Phase 3 以降で詳細化する。

// 軌間（mm）。互換性チェックは数値比較で行う。
export type TrackGaugeMm = number;

// 路線側の電化方式
export type ElectrificationSpec =
  | { type: "none" }
  | { type: "dc"; voltageV: number }
  | { type: "ac"; voltageV: number; frequencyHz: 50 | 60 };

// 車両側の動力源。ElectrificationSpec とは別型にして "none" の混入を防ぐ。
export type TractionSpec =
  | { type: "dc"; voltageV: number }
  | { type: "ac"; voltageV: number; frequencyHz: 50 | 60 }
  | { type: "diesel" }
  | { type: "steam" };

// 保安装置ID。実体は将来 data/train-protection/ で定義する。
export type SafetySystemId = string;

// 線路側の規格（1区間または線路全体に設定する）
export interface LineSpec {
  gauge: TrackGaugeMm;
  electrification: ElectrificationSpec;
  maxAxleLoadT: number;  // 最大許容軸重（トン）
  maxSpeedKmh: number;   // 設計最高速度
  safetySystem: SafetySystemId | null;
  availableYear: number | null; // null = ゲーム開始時から使用可
}

// 車両側の規格（入線可否の判定に使う）
export interface VehicleSpec {
  gauge: TrackGaugeMm;
  traction: TractionSpec;
  axleLoadT: number;      // 実軸重（トン）
  maxSpeedKmh: number;    // 車両最高速度
  requiredSafetySystem: SafetySystemId | null; // null = 要件なし（地上側に依存）
  availableYear: number | null; // null = ゲーム開始時から使用可
  retiredYear: number | null;   // null = 退役しない
}

// 路線と車両の互換性チェック結果
export interface CompatibilityResult {
  compatible: boolean;
  reasons: CompatibilityViolation[];
}

export type CompatibilityViolation =
  | { type: "gauge_mismatch"; lineGauge: TrackGaugeMm; vehicleGauge: TrackGaugeMm }
  | { type: "electrification_mismatch" }
  | { type: "axle_load_exceeded"; maxT: number; vehicleT: number }
  | { type: "safety_system_missing"; required: SafetySystemId };

export function checkCompatibility(line: LineSpec, vehicle: VehicleSpec): CompatibilityResult {
  const violations: CompatibilityViolation[] = [];

  if (line.gauge !== vehicle.gauge) {
    violations.push({ type: "gauge_mismatch", lineGauge: line.gauge, vehicleGauge: vehicle.gauge });
  }

  if (!isTractionCompatible(line.electrification, vehicle.traction)) {
    violations.push({ type: "electrification_mismatch" });
  }

  if (vehicle.axleLoadT > line.maxAxleLoadT) {
    violations.push({ type: "axle_load_exceeded", maxT: line.maxAxleLoadT, vehicleT: vehicle.axleLoadT });
  }

  if (vehicle.requiredSafetySystem !== null && vehicle.requiredSafetySystem !== line.safetySystem) {
    violations.push({ type: "safety_system_missing", required: vehicle.requiredSafetySystem });
  }

  return { compatible: violations.length === 0, reasons: violations };
}

function isTractionCompatible(line: ElectrificationSpec, traction: TractionSpec): boolean {
  // ディーゼル・蒸気は架線不要なので路線電化方式を問わない
  if (traction.type === "diesel" || traction.type === "steam") return true;

  // 電動車は電化路線が必要
  if (line.type === "none") return false;

  if (traction.type === "dc") return line.type === "dc" && traction.voltageV === line.voltageV;

  // ac
  return (
    line.type === "ac" &&
    traction.voltageV === line.voltageV &&
    traction.frequencyHz === line.frequencyHz
  );
}
