import { describe, expect, it } from "vitest";
import { executeCommand } from "../src/simulation/commands";
import { createLine } from "../src/simulation/lineServiceSystem";
import { createInitialState } from "../src/simulation/model";
import { createOperation } from "../src/simulation/operationSchedule";
import { createRoute, duplicateReverseRoute } from "../src/simulation/routeDomain";
import {
  createVehicleDuty,
  getEffectiveFormationForDutyDate,
  replaceDutyExecutionFormation,
} from "../src/simulation/vehicleDuty";

function setupDutyTestEnvironment() {
  let state: any = createInitialState();
  state.lines = {};
  state.serviceSystems = {};
  state.routes = {};
  state.operations = {};
  state.vehicleDuties = {};
  state.vehicleDutyExecutions = {};
  state.nextLineId = 1;
  state.nextServiceSystemId = 1;
  state.nextRouteId = 1;
  state.nextOperationId = 1;
  state.nextVehicleDutyId = 1;
  state.nextVehicleDutyExecutionId = 1;

  state = executeCommand(state, {
    type: "track.create",
    geometry: "straight",
    points: [{ x: 0, y: 0 }, { x: 200, y: 0 }],
  }).state;

  state = executeCommand(state, {
    type: "track.create",
    geometry: "straight",
    startConnectionTrackId: "track-1",
    points: [{ x: 200, y: 0 }, { x: 400, y: 0 }],
  }).state;

  state = executeCommand(state, {
    type: "station.createRange",
    name: "A駅",
    trackId: "track-1",
    startPosition: { x: 20, y: 0 },
    endPosition: { x: 80, y: 0 },
  }).state;

  state = executeCommand(state, {
    type: "station.createRange",
    name: "B駅",
    trackId: "track-2",
    startPosition: { x: 220, y: 0 },
    endPosition: { x: 280, y: 0 },
  }).state;

  const { line } = createLine(state, { name: "本線", color: "#FF0000" });

  const { route: routeDown } = createRoute(state, {
    name: "下り本線",
    directionName: "下り",
    stops: [
      { stationId: "station-1", trackId: "track-1", commercialType: "stop" },
      { stationId: "station-2", trackId: "track-2", commercialType: "stop" },
    ],
    lineSections: [{ fromStopSequence: 1, toStopSequence: 2, lineId: line.id }],
  });

  const { route: routeUp } = duplicateReverseRoute(state, {
    sourceRouteId: routeDown.id,
    name: "上り本線",
    directionName: "上り",
  });

  // Acquire test formations
  state = executeCommand(state, {
    type: "fleet.formation-template.acquire",
    templateId: "test-single-locomotive",
    name: "101編成",
  }).state;
  const formation1Id = state.fleet.formations.at(-1)!.id;

  state = executeCommand(state, {
    type: "fleet.formation-template.acquire",
    templateId: "test-single-locomotive",
    name: "102編成",
  }).state;
  const formation2Id = state.fleet.formations.at(-1)!.id;

  return { state, routeDown, routeUp, formation1Id, formation2Id };
}

describe("P4: 運用・編成差し替え (VehicleDuty & Duty Execution) 単体・統合テスト", () => {
  it("UT-DUTY-01: 複数運行の順序と編成割り当てを保存できる", () => {
    const { state, routeDown, routeUp, formation1Id } = setupDutyTestEnvironment();

    const { operation: op1 } = createOperation(state, {
      name: "1号 (下り)",
      routeId: routeDown.id,
      calendar: { weekdays: [1, 2, 3, 4, 5] },
      stopTimes: [
        { routeStopId: routeDown.stops[0].id, departureTime: "08:00:00", dayOffset: 0 },
        { routeStopId: routeDown.stops[1].id, arrivalTime: "08:30:00", dayOffset: 0 },
      ],
    });

    const { operation: op2 } = createOperation(state, {
      name: "2号 (上り)",
      routeId: routeUp.id,
      calendar: { weekdays: [1, 2, 3, 4, 5] },
      stopTimes: [
        { routeStopId: routeUp.stops[0].id, departureTime: "09:00:00", dayOffset: 0 },
        { routeStopId: routeUp.stops[1].id, arrivalTime: "09:30:00", dayOffset: 0 },
      ],
    });

    const { vehicleDuty: duty } = createVehicleDuty(state, {
      name: "運用01",
      defaultFormationId: formation1Id,
      assignments: [
        { operationId: op1.id, sequence: 1, serviceDayOffset: 0 },
        { operationId: op2.id, sequence: 2, serviceDayOffset: 0 },
      ],
    });

    expect(duty.id).toBe("duty-1");
    expect(duty.name).toBe("運用01");
    expect(duty.defaultFormationId).toBe(formation1Id);
    expect(duty.assignments).toHaveLength(2);
  });

  it("UT-DUTY-02: 終始発の駅・番線不一致および時間重複を検出して拒否する", () => {
    const { state, routeDown, formation1Id } = setupDutyTestEnvironment();

    const { operation: op1 } = createOperation(state, {
      name: "1号 (下り)",
      routeId: routeDown.id,
      calendar: { weekdays: [1, 2, 3, 4, 5] },
      stopTimes: [
        { routeStopId: routeDown.stops[0].id, departureTime: "08:00:00", dayOffset: 0 },
        { routeStopId: routeDown.stops[1].id, arrivalTime: "08:30:00", dayOffset: 0 },
      ],
    });

    // op2 is also down (A->B). But op1 ends at B and op2 starts at A! Discontinuity!
    const { operation: op2 } = createOperation(state, {
      name: "3号 (下り)",
      routeId: routeDown.id,
      calendar: { weekdays: [1, 2, 3, 4, 5] },
      stopTimes: [
        { routeStopId: routeDown.stops[0].id, departureTime: "09:00:00", dayOffset: 0 },
        { routeStopId: routeDown.stops[1].id, arrivalTime: "09:30:00", dayOffset: 0 },
      ],
    });

    expect(() =>
      createVehicleDuty(state, {
        name: "不連続運用",
        defaultFormationId: formation1Id,
        assignments: [
          { operationId: op1.id, sequence: 1, serviceDayOffset: 0 },
          { operationId: op2.id, sequence: 2, serviceDayOffset: 0 },
        ],
      })
    ).toThrow("ERR_DUTY_LOCATION_DISCONTINUITY");
  });

  it("UT-DUTY-04: 通常編成を特定日の編成差し替え指定で上書きできる (VehicleDutyExecution)", () => {
    const { state, routeDown, formation1Id, formation2Id } = setupDutyTestEnvironment();

    const { operation: op1 } = createOperation(state, {
      name: "単発運行",
      routeId: routeDown.id,
      calendar: { weekdays: [0, 1, 2, 3, 4, 5, 6] },
      stopTimes: [
        { routeStopId: routeDown.stops[0].id, departureTime: "08:00:00", dayOffset: 0 },
        { routeStopId: routeDown.stops[1].id, arrivalTime: "08:30:00", dayOffset: 0 },
      ],
    });

    const { vehicleDuty: duty } = createVehicleDuty(state, {
      name: "本線運用",
      defaultFormationId: formation1Id,
      assignments: [{ operationId: op1.id, sequence: 1, serviceDayOffset: 0 }],
    });

    // Default formation is 101編成 on normal days
    expect(getEffectiveFormationForDutyDate(state, duty.id, "2026-08-16")).toBe(formation1Id);

    // Replace formation on 2026-08-17 with 102編成
    replaceDutyExecutionFormation(state, duty.id, "2026-08-17", formation2Id);

    // Normal day remains default
    expect(getEffectiveFormationForDutyDate(state, duty.id, "2026-08-16")).toBe(formation1Id);
    // Replacement date uses formation2
    expect(getEffectiveFormationForDutyDate(state, duty.id, "2026-08-17")).toBe(formation2Id);
  });

  it("IT-DUTY-02: 3日間にまたがる複数日運行と運用を正常に検証・保存できる", () => {
    const { state, routeDown, routeUp, formation1Id } = setupDutyTestEnvironment();

    const { operation: opDay1 } = createOperation(state, {
      name: "1日目 下り夜行",
      routeId: routeDown.id,
      calendar: { weekdays: [1] },
      stopTimes: [
        { routeStopId: routeDown.stops[0].id, departureTime: "22:00:00", dayOffset: 0 },
        { routeStopId: routeDown.stops[1].id, arrivalTime: "02:00:00", dayOffset: 1 },
      ],
    });

    const { operation: opDay2 } = createOperation(state, {
      name: "2日目 上り昼行",
      routeId: routeUp.id,
      calendar: { weekdays: [2] },
      stopTimes: [
        { routeStopId: routeUp.stops[0].id, departureTime: "12:00:00", dayOffset: 0 },
        { routeStopId: routeUp.stops[1].id, arrivalTime: "15:00:00", dayOffset: 0 },
      ],
    });

    const { operation: opDay3 } = createOperation(state, {
      name: "3日目 下り朝行",
      routeId: routeDown.id,
      calendar: { weekdays: [3] },
      stopTimes: [
        { routeStopId: routeDown.stops[0].id, departureTime: "06:00:00", dayOffset: 0 },
        { routeStopId: routeDown.stops[1].id, arrivalTime: "07:30:00", dayOffset: 0 },
      ],
    });

    // 3-day multi-day vehicle duty
    const { vehicleDuty: multiDayDuty } = createVehicleDuty(state, {
      name: "3日行程広域運用",
      defaultFormationId: formation1Id,
      assignments: [
        { operationId: opDay1.id, sequence: 1, serviceDayOffset: 0 },
        { operationId: opDay2.id, sequence: 2, serviceDayOffset: 1 },
        { operationId: opDay3.id, sequence: 3, serviceDayOffset: 2 },
      ],
    });

    expect(multiDayDuty.assignments).toHaveLength(3);
    expect(multiDayDuty.assignments[0].serviceDayOffset).toBe(0);
    expect(multiDayDuty.assignments[1].serviceDayOffset).toBe(1);
    expect(multiDayDuty.assignments[2].serviceDayOffset).toBe(2);
  });
});
