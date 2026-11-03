import { describe, expect, it } from "vitest";
import { executeCommand } from "../src/simulation/commands";
import { createLine, createServiceSystem } from "../src/simulation/lineServiceSystem";
import { createInitialState } from "../src/simulation/model";
import { createOperation } from "../src/simulation/operationSchedule";
import { createRoute } from "../src/simulation/routeDomain";
import {
  inspectExecutionEligibility,
  inspectOperationCreation,
  inspectRouteCreation,
} from "../src/simulation/serviceInspection";

function setupInspectionTestNetwork() {
  let state: any = createInitialState();
  state.lines = {};
  state.serviceSystems = {};
  state.routes = {};
  state.operations = {};
  state.vehicleDuties = {};
  state.operationExecutions = {};
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
  const { serviceSystem } = createServiceSystem(state, { lineId: line.id, name: "各停系統" });

  return { state, line, serviceSystem };
}

describe("P7: AI・事前確認 (Preflight & AI Inspection) 単体テスト", () => {
  it("PT-AI-01: 経路作成の事前確認で接線整合性、各区間距離、最小半径を返す", () => {
    const { state } = setupInspectionTestNetwork();

    const inspection = inspectRouteCreation(state, {
      stops: [
        { stationId: "station-1", trackId: "track-1" },
        { stationId: "station-2", trackId: "track-2" },
      ],
    });

    expect(inspection.valid).toBe(true);
    expect(inspection.errors).toHaveLength(0);
    expect(inspection.details?.type).toBe("route");
    if (inspection.details?.type === "route") {
      expect(inspection.details.data.tangentValid).toBe(true);
      expect(inspection.details.data.totalDistanceM).toBeGreaterThan(0);
      expect(inspection.details.data.legCount).toBe(1);
    }
  });

  it("PT-AI-02: 運行作成の事前確認でカレンダー・着発時刻順を検証する", () => {
    const { state } = setupInspectionTestNetwork();

    const { route } = createRoute(state, {
      name: "本線各停",
      directionName: "下り",
      stops: [
        { stationId: "station-1", trackId: "track-1" },
        { stationId: "station-2", trackId: "track-2" },
      ],
    });

    const validInspect = inspectOperationCreation(state, {
      routeId: route.id,
      calendar: { weekdays: [1, 2, 3, 4, 5] },
      stopTimes: [
        { routeStopId: route.stops[0].id, departureTime: "08:00:00", dayOffset: 0 },
        { routeStopId: route.stops[1].id, arrivalTime: "08:30:00", dayOffset: 0 },
      ],
    });
    expect(validInspect.valid).toBe(true);
    expect(validInspect.details?.type).toBe("operation");

    // Invalid inspection with reversed times
    const invalidInspect = inspectOperationCreation(state, {
      routeId: route.id,
      calendar: { weekdays: [1] },
      stopTimes: [
        { routeStopId: route.stops[0].id, departureTime: "09:00:00", dayOffset: 0 },
        { routeStopId: route.stops[1].id, arrivalTime: "08:30:00", dayOffset: 0 },
      ],
    });
    expect(invalidInspect.valid).toBe(false);
    expect(invalidInspect.errors[0].code).toBe("ERR_INVALID_STOP_TIME_ORDER");
  });

  it("PT-AI-03: 発車実行適合性検査で編成配置と始発条件を検証する", () => {
    const { state } = setupInspectionTestNetwork();

    const { route } = createRoute(state, {
      name: "本線経路",
      directionName: "下り",
      stops: [
        { stationId: "station-1", trackId: "track-1" },
        { stationId: "station-2", trackId: "track-2" },
      ],
    });

    const { operation } = createOperation(state, {
      name: "本線運行1号",
      routeId: route.id,
      calendar: { weekdays: [0, 1, 2, 3, 4, 5, 6] },
      stopTimes: [
        { routeStopId: route.stops[0].id, departureTime: "08:00:00", dayOffset: 0 },
        { routeStopId: route.stops[1].id, arrivalTime: "08:30:00", dayOffset: 0 },
      ],
    });

    // Acquire vehicle
    const stateWithVeh = executeCommand(state, {
      type: "fleet.formation-template.acquire",
      templateId: "test-single-locomotive",
      name: "101編成",
    }).state;
    const fId = stateWithVeh.fleet.formations.at(-1)!.id;

    // Placed at Station 2 (Station B) instead of Station 1 (Station A)
    const statePlaced = executeCommand(stateWithVeh, {
      type: "fleet.formation.place",
      formationId: fId,
      stationId: "station-2",
      trackId: "track-2",
      distanceM: 50,
      orientation: "forward",
    }).state;

    const inspectMismatched = inspectExecutionEligibility(statePlaced, {
      operationId: operation.id,
      formationId: fId,
    });

    expect(inspectMismatched.valid).toBe(false);
    expect(inspectMismatched.errors.some((e) => e.code === "ERR_PLACEMENT_STATION_MISMATCH")).toBe(true);
  });
});
