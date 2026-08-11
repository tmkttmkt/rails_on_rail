import { describe, expect, it } from "vitest";
import { checkCompatibility, type LineSpec, type VehicleSpec } from "../src/simulation/specs";

const narrowGaugeElectricLine: LineSpec = {
  gauge: 1067,
  electrification: { type: "dc", voltageV: 1500 },
  maxAxleLoadT: 14,
  maxSpeedKmh: 120,
  safetySystem: null,
  availableYear: null,
};

describe("線路と車両の互換性チェック", () => {
  it("軌間・電化・軸重・保安装置がすべて適合する場合は互換", () => {
    const vehicle: VehicleSpec = {
      gauge: 1067,
      traction: { type: "dc", voltageV: 1500 },
      axleLoadT: 12,
      maxSpeedKmh: 120,
      requiredSafetySystem: null,
      availableYear: null,
      retiredYear: null,
    };
    const result = checkCompatibility(narrowGaugeElectricLine, vehicle);
    expect(result.compatible).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("軌間が異なる場合は不適合", () => {
    const vehicle: VehicleSpec = {
      gauge: 1435,
      traction: { type: "dc", voltageV: 1500 },
      axleLoadT: 12,
      maxSpeedKmh: 120,
      requiredSafetySystem: null,
      availableYear: null,
      retiredYear: null,
    };
    const result = checkCompatibility(narrowGaugeElectricLine, vehicle);
    expect(result.compatible).toBe(false);
    expect(result.reasons).toContainEqual({ type: "gauge_mismatch", lineGauge: 1067, vehicleGauge: 1435 });
  });

  it("非電化路線に電車は入線不可", () => {
    const nonElectricLine: LineSpec = { ...narrowGaugeElectricLine, electrification: { type: "none" } };
    const vehicle: VehicleSpec = {
      gauge: 1067,
      traction: { type: "dc", voltageV: 1500 },
      axleLoadT: 12,
      maxSpeedKmh: 120,
      requiredSafetySystem: null,
      availableYear: null,
      retiredYear: null,
    };
    const result = checkCompatibility(nonElectricLine, vehicle);
    expect(result.compatible).toBe(false);
    expect(result.reasons.some((r) => r.type === "electrification_mismatch")).toBe(true);
  });

  it("ディーゼル車は電化方式を問わず入線可", () => {
    const diesel: VehicleSpec = {
      gauge: 1067,
      traction: { type: "diesel" },
      axleLoadT: 12,
      maxSpeedKmh: 100,
      requiredSafetySystem: null,
      availableYear: null,
      retiredYear: null,
    };
    expect(checkCompatibility(narrowGaugeElectricLine, diesel).compatible).toBe(true);
    const nonElectricLine: LineSpec = { ...narrowGaugeElectricLine, electrification: { type: "none" } };
    expect(checkCompatibility(nonElectricLine, diesel).compatible).toBe(true);
  });

  it("軸重超過は不適合", () => {
    const vehicle: VehicleSpec = {
      gauge: 1067,
      traction: { type: "dc", voltageV: 1500 },
      axleLoadT: 16,
      maxSpeedKmh: 120,
      requiredSafetySystem: null,
      availableYear: null,
      retiredYear: null,
    };
    const result = checkCompatibility(narrowGaugeElectricLine, vehicle);
    expect(result.compatible).toBe(false);
    expect(result.reasons).toContainEqual({ type: "axle_load_exceeded", maxT: 14, vehicleT: 16 });
  });

  it("保安装置が必要な車両は対応路線のみ入線可", () => {
    const vehicle: VehicleSpec = {
      gauge: 1067,
      traction: { type: "dc", voltageV: 1500 },
      axleLoadT: 12,
      maxSpeedKmh: 120,
      requiredSafetySystem: "ats-p",
      availableYear: null,
      retiredYear: null,
    };
    expect(checkCompatibility(narrowGaugeElectricLine, vehicle).compatible).toBe(false);
    const lineWithAts: LineSpec = { ...narrowGaugeElectricLine, safetySystem: "ats-p" };
    expect(checkCompatibility(lineWithAts, vehicle).compatible).toBe(true);
  });

  it("複数の違反をすべて報告する", () => {
    const vehicle: VehicleSpec = {
      gauge: 1435,
      traction: { type: "dc", voltageV: 600 },
      axleLoadT: 20,
      maxSpeedKmh: 80,
      requiredSafetySystem: "ats-p",
      availableYear: null,
      retiredYear: null,
    };
    const result = checkCompatibility(narrowGaugeElectricLine, vehicle);
    expect(result.compatible).toBe(false);
    expect(result.reasons.length).toBeGreaterThanOrEqual(3);
  });
});
