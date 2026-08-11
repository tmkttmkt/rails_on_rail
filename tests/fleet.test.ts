import { describe, expect, it } from "vitest";
import { createInitialFleetState, executeFleetCommand, type FleetCommand, type FleetState } from "../src/simulation/fleet";

function executeAll(commands: FleetCommand[]): FleetState {
  return commands.reduce((state, command) => executeFleetCommand(state, command).state, createInitialFleetState());
}

const lightClass: FleetCommand = {
  type: "operator-class.create",
  operatorClass: {
    id: "class-light-steam",
    operatorId: "operator-1",
    className: "1形蒸気機関車",
    baseVehicleDesignId: "generic-light-steam-0-4-0",
  },
};

const coachClass: FleetCommand = {
  type: "operator-class.create",
  operatorClass: {
    id: "class-light-coach",
    operatorId: "operator-1",
    className: "ハ1形客車",
    baseVehicleDesignId: "generic-light-two-axle-coach",
  },
};

const wagonClass: FleetCommand = {
  type: "operator-class.create",
  operatorClass: {
    id: "class-light-wagon",
    operatorId: "operator-1",
    className: "チ1形貨車",
    baseVehicleDesignId: "generic-light-two-axle-flat-wagon",
  },
};

describe("車両個体・編成・列車", () => {
  it("メーカー設計から運行会社形式と車両個体を作る", () => {
    const state = executeAll([
      coachClass,
      { type: "vehicle-unit.create", vehicleUnit: { id: "coach-1", operatorClassId: "class-light-coach", operatorNumber: "ハ1" } },
    ]);
    expect(state.operatorClasses[0].className).toBe("ハ1形客車");
    expect(state.vehicleUnits[0].operatorNumber).toBe("ハ1");
  });

  it("車両を順序と向き付きで編成へ追加する", () => {
    const state = executeAll([
      coachClass,
      { type: "vehicle-unit.create", vehicleUnit: { id: "coach-1", operatorClassId: "class-light-coach", operatorNumber: "ハ1" } },
      { type: "vehicle-unit.create", vehicleUnit: { id: "coach-2", operatorClassId: "class-light-coach", operatorNumber: "ハ2" } },
      { type: "formation.create", formationId: "formation-a", name: "A行き" },
      { type: "formation.vehicle.add", formationId: "formation-a", vehicleId: "coach-1", orientation: "forward" },
      { type: "formation.vehicle.add", formationId: "formation-a", vehicleId: "coach-2", orientation: "reversed", placement: "front" },
    ]);
    expect(state.formations[0].vehicles).toEqual([
      { vehicleId: "coach-2", orientation: "reversed" },
      { vehicleId: "coach-1", orientation: "forward" },
    ]);
  });

  it("同じ車両を複数編成へ所属させない", () => {
    const state = executeAll([
      coachClass,
      { type: "vehicle-unit.create", vehicleUnit: { id: "coach-1", operatorClassId: "class-light-coach", operatorNumber: "ハ1" } },
      { type: "formation.create", formationId: "formation-a", name: "A" },
      { type: "formation.create", formationId: "formation-b", name: "B" },
      { type: "formation.vehicle.add", formationId: "formation-a", vehicleId: "coach-1", orientation: "forward" },
    ]);
    expect(() => executeFleetCommand(state, {
      type: "formation.vehicle.add",
      formationId: "formation-b",
      vehicleId: "coach-1",
      orientation: "forward",
    })).toThrow("既にformation-aへ所属しています");
  });

  it("連結器不適合の車両追加を拒否する", () => {
    const state = executeAll([
      coachClass,
      {
        type: "operator-class.create",
        operatorClass: {
          id: "class-diesel",
          operatorId: "operator-1",
          className: "キハ1形",
          baseVehicleDesignId: "generic-light-diesel-railcar",
        },
      },
      { type: "vehicle-unit.create", vehicleUnit: { id: "coach-1", operatorClassId: "class-light-coach", operatorNumber: "ハ1" } },
      { type: "vehicle-unit.create", vehicleUnit: { id: "diesel-1", operatorClassId: "class-diesel", operatorNumber: "キハ1" } },
      { type: "formation.create", formationId: "formation-a", name: "不適合試験" },
      { type: "formation.vehicle.add", formationId: "formation-a", vehicleId: "coach-1", orientation: "forward" },
    ]);
    expect(() => executeFleetCommand(state, {
      type: "formation.vehicle.add",
      formationId: "formation-a",
      vehicleId: "diesel-1",
      orientation: "forward",
    })).toThrow("連結器は互換ではありません");
  });

  it("車両の向きに応じて接続端を入れ替える", () => {
    const state = executeAll([
      coachClass,
      {
        type: "operator-class.create",
        operatorClass: {
          id: "class-asymmetric",
          operatorId: "operator-1",
          className: "変換客車",
          baseVehicleDesignId: "generic-light-two-axle-coach",
          connectionOverrides: {
            front: { couplerSystemId: "knuckle", throughBrakeSystemIds: ["air-automatic"] },
            rear: { couplerSystemId: "center-buffer-light", throughBrakeSystemIds: ["vacuum-automatic"] },
          },
        },
      },
      { type: "vehicle-unit.create", vehicleUnit: { id: "coach-1", operatorClassId: "class-light-coach", operatorNumber: "ハ1" } },
      { type: "vehicle-unit.create", vehicleUnit: { id: "adapter-1", operatorClassId: "class-asymmetric", operatorNumber: "ハ2" } },
      { type: "formation.create", formationId: "formation-a", name: "向き試験" },
      { type: "formation.vehicle.add", formationId: "formation-a", vehicleId: "coach-1", orientation: "forward" },
    ]);
    expect(() => executeFleetCommand(state, {
      type: "formation.vehicle.add",
      formationId: "formation-a",
      vehicleId: "adapter-1",
      orientation: "forward",
    })).toThrow("連結器は互換ではありません");

    const reversed = executeFleetCommand(state, {
      type: "formation.vehicle.add",
      formationId: "formation-a",
      vehicleId: "adapter-1",
      orientation: "reversed",
    });
    expect(reversed.state.formations[0].vehicles[1].orientation).toBe("reversed");
    expect(reversed.warnings).toEqual([]);
  });

  it("ブレーキなし貨車は追加し、警告を保持する", () => {
    let state = executeAll([
      lightClass,
      wagonClass,
      { type: "vehicle-unit.create", vehicleUnit: { id: "loco-1", operatorClassId: "class-light-steam", operatorNumber: "1" } },
      { type: "vehicle-unit.create", vehicleUnit: { id: "wagon-1", operatorClassId: "class-light-wagon", operatorNumber: "チ1" } },
      { type: "formation.create", formationId: "mixed", name: "混合編成" },
      { type: "formation.vehicle.add", formationId: "mixed", vehicleId: "loco-1", orientation: "forward" },
    ]);
    const result = executeFleetCommand(state, {
      type: "formation.vehicle.add",
      formationId: "mixed",
      vehicleId: "wagon-1",
      orientation: "forward",
    });
    state = result.state;
    expect(result.warnings).toEqual([{ type: "through-brake-discontinuity", firstId: "loco-1", secondId: "wagon-1" }]);
    expect(state.formations[0].vehicles).toHaveLength(2);
  });

  it("A・B・C行き編成を1本の列車へ追加する", () => {
    const commands: FleetCommand[] = [coachClass];
    for (const suffix of ["a", "b", "c"]) {
      commands.push(
        { type: "vehicle-unit.create", vehicleUnit: { id: `coach-${suffix}`, operatorClassId: "class-light-coach", operatorNumber: `ハ${suffix.toUpperCase()}` } },
        { type: "formation.create", formationId: `formation-${suffix}`, name: `${suffix.toUpperCase()}行き編成` },
        { type: "formation.vehicle.add", formationId: `formation-${suffix}`, vehicleId: `coach-${suffix}`, orientation: "forward" },
      );
    }
    commands.push(
      { type: "train.create", trainId: "train-101", name: "第101列車" },
      { type: "train.formation.add", trainId: "train-101", formationId: "formation-a", destinationStationId: "station-a", orientation: "forward" },
      { type: "train.formation.add", trainId: "train-101", formationId: "formation-b", destinationStationId: "station-b", orientation: "forward" },
      { type: "train.formation.add", trainId: "train-101", formationId: "formation-c", destinationStationId: "station-c", orientation: "forward" },
    );
    const state = executeAll(commands);
    expect(state.trains[0].formations.map((item) => item.destinationStationId)).toEqual(["station-a", "station-b", "station-c"]);
  });

  it("同じ編成を複数列車へ所属させない", () => {
    const state = executeAll([
      coachClass,
      { type: "vehicle-unit.create", vehicleUnit: { id: "coach-1", operatorClassId: "class-light-coach", operatorNumber: "ハ1" } },
      { type: "formation.create", formationId: "formation-a", name: "A" },
      { type: "formation.vehicle.add", formationId: "formation-a", vehicleId: "coach-1", orientation: "forward" },
      { type: "train.create", trainId: "train-1", name: "1列車" },
      { type: "train.create", trainId: "train-2", name: "2列車" },
      { type: "train.formation.add", trainId: "train-1", formationId: "formation-a", destinationStationId: "station-a", orientation: "forward" },
    ]);
    expect(() => executeFleetCommand(state, {
      type: "train.formation.add",
      trainId: "train-2",
      formationId: "formation-a",
      destinationStationId: "station-b",
      orientation: "forward",
    })).toThrow("既にtrain-1へ所属しています");
  });
});
