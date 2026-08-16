import { describe, expect, it } from "vitest";
import { executeCommand } from "../src/simulation/commands";
import { createLine } from "../src/simulation/lineServiceSystem";
import { createInitialState } from "../src/simulation/model";
import {
  createOperation,
  deleteOperation,
  duplicateOperation,
  updateOperation,
} from "../src/simulation/operationSchedule";
import { createRoute } from "../src/simulation/routeDomain";

function setupOperationTestEnvironment() {
  let state: any = createInitialState();
  state.lines = {};
  state.serviceSystems = {};
  state.routes = {};
  state.operations = {};
  state.vehicleDuties = {};
  state.nextLineId = 1;
  state.nextServiceSystemId = 1;
  state.nextRouteId = 1;
  state.nextOperationId = 1;

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
    type: "track.create",
    geometry: "straight",
    startConnectionTrackId: "track-2",
    points: [{ x: 400, y: 0 }, { x: 600, y: 0 }],
  }).state;

  state = executeCommand(state, {
    type: "station.createRange",
    name: "東京",
    trackId: "track-1",
    startPosition: { x: 20, y: 0 },
    endPosition: { x: 80, y: 0 },
  }).state;

  state = executeCommand(state, {
    type: "station.createRange",
    name: "横浜",
    trackId: "track-2",
    startPosition: { x: 220, y: 0 },
    endPosition: { x: 280, y: 0 },
  }).state;

  state = executeCommand(state, {
    type: "station.createRange",
    name: "小田原",
    trackId: "track-3",
    startPosition: { x: 420, y: 0 },
    endPosition: { x: 480, y: 0 },
  }).state;

  const { line } = createLine(state, { name: "東海道本線", color: "#E65A00" });

  const { route } = createRoute(state, {
    name: "東海道下り本線",
    directionName: "下り",
    stops: [
      { stationId: "station-1", trackId: "track-1", commercialType: "stop" },
      { stationId: "station-2", trackId: "track-2", commercialType: "stop" },
      { stationId: "station-3", trackId: "track-3", commercialType: "stop" },
    ],
    lineSections: [{ fromStopSequence: 1, toStopSequence: 3, lineId: line.id }],
  });

  return { state, route };
}

describe("P3: 運行・複数日ダイヤ (Operation & Multi-Day Scheduling) 単体・統合テスト", () => {
  it("UT-OP-01: 運行の経路参照、運行日条件 (カレンダー)、各地点着発時刻が正常に保存される", () => {
    const { state, route } = setupOperationTestEnvironment();

    const { operation } = createOperation(state, {
      name: "普通 101M",
      operationNumber: "101M",
      routeId: route.id,
      calendar: {
        weekdays: [1, 2, 3, 4, 5],
        startDate: "2026-04-01",
        endDate: "2027-03-31",
      },
      stopTimes: [
        { routeStopId: route.stops[0].id, departureTime: "07:00:00", dayOffset: 0 },
        { routeStopId: route.stops[1].id, arrivalTime: "07:30:00", departureTime: "07:32:00", dayOffset: 0 },
        { routeStopId: route.stops[2].id, arrivalTime: "08:15:00", dayOffset: 0 },
      ],
    });

    expect(operation.id).toBe("op-1");
    expect(operation.name).toBe("普通 101M");
    expect(operation.operationNumber).toBe("101M");
    expect(operation.calendar.weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(operation.stopTimes).toHaveLength(3);
    expect(operation.requiresReview).toBe(false);
  });

  it("UT-OP-02: 0日、1日(翌日)、2日以上を含む複数日越しの着発時刻順を検証できる", () => {
    const { state, route } = setupOperationTestEnvironment();

    // Night train spanning across 2 days (dayOffset 0, 1, 2)
    const { operation: nightTrain } = createOperation(state, {
      name: "夜行特快",
      routeId: route.id,
      calendar: { weekdays: [5, 6] },
      stopTimes: [
        { routeStopId: route.stops[0].id, departureTime: "23:50:00", dayOffset: 0 },
        { routeStopId: route.stops[1].id, arrivalTime: "00:40:00", departureTime: "00:45:00", dayOffset: 1 },
        { routeStopId: route.stops[2].id, arrivalTime: "01:20:00", dayOffset: 2 }, // 2 days later arrival
      ],
    });

    expect(nightTrain.stopTimes[1].dayOffset).toBe(1);
    expect(nightTrain.stopTimes[2].dayOffset).toBe(2);

    // Invalid time order: departure after midnight with dayOffset=0 while previous was 23:50 (dayOffset=0)
    expect(() =>
      createOperation(state, {
        name: "不正時刻運行",
        routeId: route.id,
        calendar: { weekdays: [1] },
        stopTimes: [
          { routeStopId: route.stops[0].id, departureTime: "23:50:00", dayOffset: 0 },
          { routeStopId: route.stops[1].id, arrivalTime: "00:20:00", departureTime: "00:25:00", dayOffset: 0 }, // Should be dayOffset=1!
          { routeStopId: route.stops[2].id, arrivalTime: "01:00:00", dayOffset: 1 },
        ],
      })
    ).toThrow("ERR_INVALID_STOP_TIME_ORDER");
  });

  it("IT-OP-01: 同一経路から朝便と夕便を独立して作成・複製できる", () => {
    const { state, route } = setupOperationTestEnvironment();

    const { operation: morningOp } = createOperation(state, {
      name: "朝便 1号",
      routeId: route.id,
      calendar: { weekdays: [1, 2, 3, 4, 5] },
      stopTimes: [
        { routeStopId: route.stops[0].id, departureTime: "06:00:00", dayOffset: 0 },
        { routeStopId: route.stops[1].id, arrivalTime: "06:30:00", departureTime: "06:32:00", dayOffset: 0 },
        { routeStopId: route.stops[2].id, arrivalTime: "07:10:00", dayOffset: 0 },
      ],
    });

    // Duplicate shifted by 10 hours (600 minutes) for evening run
    const { operation: eveningOp } = duplicateOperation(state, {
      sourceOperationId: morningOp.id,
      name: "夕便 5号",
      timeShiftMinutes: 600,
    });

    expect(eveningOp.routeId).toBe(route.id);
    expect(eveningOp.stopTimes[0].departureTime).toBe("16:00:00");
    expect(eveningOp.stopTimes[1].arrivalTime).toBe("16:30:00");
    expect(eveningOp.stopTimes[2].arrivalTime).toBe("17:10:00");

    // Both operations share the same route
    expect(morningOp.routeId).toBe(eveningOp.routeId);
  });

  it("運行の更新・レビュー確認と、運用参照中の削除保護が機能する", () => {
    const { state, route } = setupOperationTestEnvironment();

    const { operation } = createOperation(state, {
      name: "テスト運行",
      routeId: route.id,
      calendar: { weekdays: [0, 1, 2, 3, 4, 5, 6] },
      stopTimes: [
        { routeStopId: route.stops[0].id, departureTime: "10:00:00", dayOffset: 0 },
        { routeStopId: route.stops[1].id, arrivalTime: "10:30:00", departureTime: "10:32:00", dayOffset: 0 },
        { routeStopId: route.stops[2].id, arrivalTime: "11:10:00", dayOffset: 0 },
      ],
    });

    operation.requiresReview = true;
    updateOperation(state, {
      id: operation.id,
      markReviewed: true,
    });
    expect(state.operations[operation.id].requiresReview).toBe(false);

    // Mock duty referencing operation
    state.vehicleDuties["duty-1"] = {
      id: "duty-1",
      name: "運用01",
      assignments: [{ operationId: operation.id, sequence: 1, serviceDayOffset: 0 }],
    };

    expect(() => deleteOperation(state, operation.id)).toThrow("ERR_REFERENCED_BY_DUTY");
  });
});
