import { describe, expect, it } from "vitest";
import { vehicleCatalog } from "../src/data/vehicleCatalog";

describe("車両接続互換性", () => {
  it("4種類の車両カタログを分離して読み込む", () => {
    expect(vehicleCatalog.locomotives).toHaveLength(4);
    expect(vehicleCatalog.poweredCars).toHaveLength(1);
    expect(vehicleCatalog.coaches).toHaveLength(1);
    expect(vehicleCatalog.wagons).toHaveLength(2);
    expect(vehicleCatalog.vehicleDesigns).toHaveLength(8);
  });

  it("同じ連結器と真空ブレーキを持つ機関車・客車を接続できる", () => {
    const result = vehicleCatalog.checkConnection(
      "generic-light-steam-0-4-0",
      "rear",
      "generic-light-two-axle-coach",
      "front",
      { requireThroughBrake: true },
    );
    expect(result.compatible).toBe(true);
    expect(result.mechanicallyCompatible).toBe(true);
    expect(result.throughBrakeCompatible).toBe(true);
    expect(result.commonThroughBrakeSystemIds).toEqual(["vacuum-automatic"]);
  });

  it("ブレーキなし貨車は機械連結できるが貫通ブレーキ必須運用に適合しない", () => {
    const permissive = vehicleCatalog.checkConnection(
      "generic-light-steam-0-4-0",
      "rear",
      "generic-light-two-axle-flat-wagon",
      "front",
      { requireThroughBrake: false },
    );
    expect(permissive.compatible).toBe(true);
    expect(permissive.mechanicallyCompatible).toBe(true);
    expect(permissive.throughBrakeCompatible).toBe(false);

    const required = vehicleCatalog.checkConnection(
      "generic-light-steam-0-4-0",
      "rear",
      "generic-light-two-axle-flat-wagon",
      "front",
      { requireThroughBrake: true },
    );
    expect(required.compatible).toBe(false);
    expect(required.violations).toContainEqual({ type: "through-brake-incompatible" });
  });

  it("異なる連結器の車両は機械連結できない", () => {
    const result = vehicleCatalog.checkConnection(
      "generic-light-diesel-railcar",
      "rear",
      "generic-light-two-axle-coach",
      "front",
      { requireThroughBrake: false },
    );
    expect(result.compatible).toBe(false);
    expect(result.mechanicallyCompatible).toBe(false);
    expect(result.violations[0]?.type).toBe("coupler-incompatible");
  });
});
