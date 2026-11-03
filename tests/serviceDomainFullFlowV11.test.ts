import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/simulation/model";
import { executeCommand } from "../src/simulation/commands";
import { tickOperationExecutions } from "../src/simulation/trainRun";

describe("Service Domain Full Flow (v11 Integration)", () => {
  it("executes the complete planning and dispatch lifecycle with commands", () => {
    let state = createInitialState();

    // 1. Create track and stations
    state.tracks.push({
      id: "track-1",
      geometry: "straight",
      points: [{ x: 0, y: 0 }, { x: 2000, y: 0 }],
      resolvedPath: true,
      specification: { gaugeId: "gauge-1067", railProfileId: "rail-60kg", supportSystemId: "support-concrete", roadbedId: "roadbed-ballast" },
      engineering: { designSpeedKmh: 120, cantProfile: [], builtMinimumRadiusM: null },
    });
    state.stations.push(
      {
        id: "st-tokyo",
        name: "東京",
        position: { x: 100, y: 0 },
        stopPoints: [{ id: "sp-tokyo", trackId: "track-1", startDistanceM: 50, endDistanceM: 150, startPosition: { x: 50, y: 0 }, endPosition: { x: 150, y: 0 }, direction: "both" }],
      },
      {
        id: "st-yokohama",
        name: "横浜",
        position: { x: 1800, y: 0 },
        stopPoints: [{ id: "sp-yokohama", trackId: "track-1", startDistanceM: 1750, endDistanceM: 1850, startPosition: { x: 1750, y: 0 }, endPosition: { x: 1850, y: 0 }, direction: "both" }],
      }
    );

    // 2. Acquire a formation
    const rFormation = executeCommand(state, {
      type: "fleet.formation-template.acquire",
      templateId: "test-single-locomotive",
      name: "E231系 10両",
    });
    state = rFormation.state;
    const formation = state.fleet.formations.find((f) => f.name === "E231系 10両")!;
    expect(formation).toBeDefined();

    // Place formation at Tokyo
    state.vehiclePlacements.push({
      id: "vp-1",
      formationId: formation.id,
      stationId: "st-tokyo",
      trackId: "track-1",
      centerDistanceM: 100,
      occupiedStartDistanceM: 50,
      occupiedEndDistanceM: 150,
      orientation: "forward",
    });

    // 3. Create Line & ServiceSystem via commands
    const rLine = executeCommand(state, {
      type: "line.create",
      payload: { id: "line-jt", name: "東海道本線", code: "JT", color: "#f97316" },
    });
    state = rLine.state;
    expect(state.lines["line-jt"]).toBeDefined();

    const rSys = executeCommand(state, {
      type: "serviceSystem.create",
      payload: { lineId: "line-jt", name: "本線普通", shortName: "普通" },
    });
    state = rSys.state;
    const sysId = Object.keys(state.serviceSystems)[0];
    expect(sysId).toBeDefined();

    // 4. Create Route via commands (without lineSections)
    const rRoute = executeCommand(state, {
      type: "route.create",
      payload: {
        id: "route-tokyo-yokohama",
        name: "東海道本線 下り",
        directionName: "下り",
        stops: [
          { stationId: "st-tokyo", trackId: "track-1", commercialType: "stop", dwellSeconds: 30 },
          { stationId: "st-yokohama", trackId: "track-1", commercialType: "stop", dwellSeconds: 30 },
        ],
      },
    });
    state = rRoute.state;
    const route = state.routes["route-tokyo-yokohama"];
    expect(route).toBeDefined();
    expect(route.stops).toHaveLength(2);

    // 5. Create Operation with classification assignments and multi-day stop times
    const rOp = executeCommand(state, {
      type: "operation.create",
      payload: {
        id: "op-101m",
        name: "普通 101M",
        routeId: route.id,
        calendar: { weekdays: [1, 2, 3, 4, 5] },
        stopTimes: [
          { routeStopId: route.stops[0].id, departureTime: "08:00:00", dayOffset: 0 },
          { routeStopId: route.stops[1].id, arrivalTime: "08:30:00", dayOffset: 0 },
        ],
        lineAssignments: [
          { lineId: "line-jt", serviceSystemId: sysId },
        ],
      },
    });
    state = rOp.state;
    const op = state.operations["op-101m"];
    expect(op).toBeDefined();
    expect(op.lineAssignments).toEqual([{ lineId: "line-jt", serviceSystemId: sysId }]);

    // 6. Create VehicleDuty with continuity and default formation
    const rDuty = executeCommand(state, {
      type: "vehicleDuty.create",
      payload: {
        id: "duty-01",
        name: "運用01",
        defaultFormationId: formation.id,
        assignments: [
          { sequence: 1, operationId: op.id, serviceDayOffset: 0 },
        ],
      },
    });
    state = rDuty.state;
    expect(state.vehicleDuties["duty-01"]).toBeDefined();

    // 7. Replace formation on specific date via command
    const rReplace = executeCommand(state, {
      type: "vehicleDutyExecution.replaceFormation",
      payload: {
        vehicleDutyId: "duty-01",
        serviceDate: "2026-08-16",
        formationId: formation.id,
      },
    });
    state = rReplace.state;
    const execEntry = Object.values(state.vehicleDutyExecutions).find(
      (e) => e.vehicleDutyId === "duty-01" && e.serviceDate === "2026-08-16"
    );
    expect(execEntry).toBeDefined();
    expect(execEntry?.formationId).toBe(formation.id);

    // 8. Reserve execution and dispatch
    const rExec = executeCommand(state, {
      type: "execution.reserve",
      payload: {
        id: "exec-101m-01",
        operationId: op.id,
        formationId: formation.id,
        serviceDate: "2026-08-16",
        scheduledDepartureTimeMs: state.clock.currentTimeMs,
      },
    });
    state = rExec.state;
    expect(state.operationExecutions["exec-101m-01"]).toBeDefined();
    expect(state.operatingTrains).toHaveLength(1);

    // 9. Advance simulation tick
    tickOperationExecutions(state, 5);
    expect(state.operatingTrains).toHaveLength(1);
    expect(state.operatingTrains[0].state).toBeDefined();
  });
});
