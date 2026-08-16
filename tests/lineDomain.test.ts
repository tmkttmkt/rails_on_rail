import { describe, expect, it } from "vitest";
import { executeCommand } from "../src/simulation/commands";
import { inspectOperationRoute, inspectTrainRun } from "../src/simulation/inspection";
import { createInitialState } from "../src/simulation/model";
import {
  getEligibleRoutesForPlacement,
  getIneligibleRouteReasons,
  getLines,
  getServicePatternsByLine,
} from "../src/simulation/selectors";

function setupTestNetwork() {
  // Create 3 connected track segments: track-1 (0-200), track-2 (200-400), track-3 (400-600)
  let state = executeCommand(createInitialState(), {
    type: "track.create",
    geometry: "straight",
    points: [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ],
  }).state;

  state = executeCommand(state, {
    type: "track.create",
    geometry: "straight",
    startConnectionTrackId: "track-1",
    points: [
      { x: 200, y: 0 },
      { x: 400, y: 0 },
    ],
  }).state;

  state = executeCommand(state, {
    type: "track.create",
    geometry: "straight",
    startConnectionTrackId: "track-2",
    points: [
      { x: 400, y: 0 },
      { x: 600, y: 0 },
    ],
  }).state;

  // Station A at track-1 (20..80)
  state = executeCommand(state, {
    type: "station.createRange",
    name: "A駅",
    trackId: "track-1",
    startPosition: { x: 20, y: 0 },
    endPosition: { x: 80, y: 0 },
  }).state;

  // Station B at track-2 (220..280)
  state = executeCommand(state, {
    type: "station.createRange",
    name: "B駅",
    trackId: "track-2",
    startPosition: { x: 220, y: 0 },
    endPosition: { x: 280, y: 0 },
  }).state;

  // Station C at track-3 (420..480)
  state = executeCommand(state, {
    type: "station.createRange",
    name: "C駅",
    trackId: "track-3",
    startPosition: { x: 420, y: 0 },
    endPosition: { x: 480, y: 0 },
  }).state;

  return state;
}

describe("路線・運行系統・物理運行経路・個別運行 ドメインテスト", () => {
  it("PT-DOM-01: Line groups ServicePatterns and open ServiceDirections", () => {
    let state = setupTestNetwork();

    // Create Line
    state = executeCommand(state, {
      type: "line.create",
      payload: { id: "line-main", name: "本線", code: "MN", color: "#FF0000" },
    }).state;

    // Create ServicePattern
    state = executeCommand(state, {
      type: "servicePattern.create",
      payload: { id: "sp-local", name: "各駅停車", type: "local", lineIds: ["line-main"] },
    }).state;

    // Add directions
    state = executeCommand(state, {
      type: "servicePattern.addDirection",
      payload: {
        servicePatternId: "sp-local",
        directionId: "dir-down",
        directionName: "下り",
        stopPatternStops: [
          { stationId: "station-1", commercialType: "stop" },
          { stationId: "station-2", commercialType: "stop" },
          { stationId: "station-3", commercialType: "stop" },
        ],
      },
    }).state;

    const lines = getLines(state);
    expect(lines).toHaveLength(1); // line-main
    const mainLine = lines.find((l) => l.id === "line-main");
    expect(mainLine?.name).toBe("本線");
    expect(mainLine?.servicePatternIds).toContain("sp-local");

    const sps = getServicePatternsByLine(state, "line-main");
    expect(sps).toHaveLength(1);
    expect(sps[0].directions[0].name).toBe("下り");
  });

  it("PT-PAT-01: OperationRoute pathfinding with station stop tracks and tangent connectivity", () => {
    let state = setupTestNetwork();

    state = executeCommand(state, {
      type: "line.create",
      payload: { id: "line-main", name: "本線", code: "MN", color: "#FF0000" },
    }).state;

    state = executeCommand(state, {
      type: "servicePattern.create",
      payload: { id: "sp-local", name: "各停", type: "local", lineIds: ["line-main"] },
    }).state;

    state = executeCommand(state, {
      type: "servicePattern.addDirection",
      payload: {
        servicePatternId: "sp-local",
        directionId: "dir-down",
        directionName: "下り",
        stopPatternStops: [
          { stationId: "station-1", commercialType: "stop" },
          { stationId: "station-3", commercialType: "stop" },
        ],
      },
    }).state;

    // Create OperationRoute connecting Station A -> Station C
    state = executeCommand(state, {
      type: "operationRoute.create",
      payload: {
        id: "route-ac",
        servicePatternId: "sp-local",
        directionId: "dir-down",
        name: "A-C各停経路",
        stops: [
          { stationId: "station-1", trackId: "track-1" },
          { stationId: "station-3", trackId: "track-3" },
        ],
      },
    }).state;

    const route = state.operationRoutes["route-ac"];
    expect(route).toBeDefined();
    expect(route.stationIds).toEqual(["station-1", "station-3"]);
    expect(route.stops).toHaveLength(2);
    expect(route.legs).toHaveLength(1);
    // Traversal should span track-1, track-2, track-3 via junctions
    expect(route.legs[0].tracks.map((t: any) => t.trackId)).toEqual(["track-1", "track-2", "track-3"]);
  });

  it("PT-RUN-01: TrainRun lifecycle under a single run ID", () => {
    let state = setupTestNetwork();

    // Create Line, ServicePattern, Direction, Route
    state = executeCommand(state, {
      type: "line.create",
      payload: { id: "line-main", name: "本線", code: "MN", color: "#FF0000" },
    }).state;

    state = executeCommand(state, {
      type: "servicePattern.create",
      payload: { id: "sp-local", name: "各停", type: "local", lineIds: ["line-main"] },
    }).state;

    state = executeCommand(state, {
      type: "servicePattern.addDirection",
      payload: {
        servicePatternId: "sp-local",
        directionId: "dir-down",
        directionName: "下り",
        stopPatternStops: [
          { stationId: "station-1", commercialType: "stop" },
          { stationId: "station-2", commercialType: "stop" },
        ],
      },
    }).state;

    state = executeCommand(state, {
      type: "operationRoute.create",
      payload: {
        id: "route-ab",
        servicePatternId: "sp-local",
        directionId: "dir-down",
        name: "A-B各停",
        stops: [
          { stationId: "station-1", trackId: "track-1" },
          { stationId: "station-2", trackId: "track-2" },
        ],
      },
    }).state;

    // Acquire vehicle and place at Station A
    state = executeCommand(state, {
      type: "fleet.formation-template.acquire",
      templateId: "test-single-locomotive",
      name: "101編成",
    }).state;
    const fId = state.fleet.formations.at(-1)!.id;

    state = executeCommand(state, {
      type: "fleet.formation.place",
      formationId: fId,
      stationId: "station-1",
      trackId: "track-1",
      distanceM: 50,
      orientation: "forward",
    }).state;

    // Create scheduled TrainRun in future (+60 seconds)
    const futureTime = state.clock.currentTimeMs + 60_000;
    state = executeCommand(state, {
      type: "trainRun.create",
      payload: {
        id: "tr-101",
        servicePatternId: "sp-local",
        directionId: "dir-down",
        routeId: "route-ab",
        formationId: fId,
        scheduledDepartureTimeMs: futureTime,
        requestedSpeedKph: 72,
      },
    }).state;

    let run = state.trainRuns["tr-101"];
    expect(run.status).toBe("reserved");

    // Tick simulation by 60s -> transitions to operating under same ID
    state = executeCommand(state, { type: "simulation.tick", elapsedSeconds: 60 }).state;
    run = state.trainRuns["tr-101"];
    expect(run.status).toBe("operating");
    expect(run.operatingTrainId).toBeDefined();

    // Tick simulation until completed
    state = executeCommand(state, { type: "simulation.tick", elapsedSeconds: 60 }).state;
    run = state.trainRuns["tr-101"];
    expect(run.status).toBe("completed");
  });

  it("PT-GRD-01 & PT-GRD-02: Reference protection guards on station and track deletion", () => {
    let state = setupTestNetwork();

    state = executeCommand(state, {
      type: "line.create",
      payload: { id: "line-main", name: "本線", code: "MN", color: "#FF0000" },
    }).state;

    state = executeCommand(state, {
      type: "servicePattern.create",
      payload: { id: "sp-local", name: "各停", type: "local", lineIds: ["line-main"] },
    }).state;

    state = executeCommand(state, {
      type: "servicePattern.addDirection",
      payload: {
        servicePatternId: "sp-local",
        directionId: "dir-down",
        directionName: "下り",
        stopPatternStops: [
          { stationId: "station-1", commercialType: "stop" },
          { stationId: "station-2", commercialType: "stop" },
        ],
      },
    }).state;

    state = executeCommand(state, {
      type: "operationRoute.create",
      payload: {
        id: "route-ab",
        servicePatternId: "sp-local",
        directionId: "dir-down",
        name: "A-B各停",
        stops: [
          { stationId: "station-1", trackId: "track-1" },
          { stationId: "station-2", trackId: "track-2" },
        ],
      },
    }).state;

    // Station deletion guard
    expect(() =>
      executeCommand(state, { type: "station.delete", stationId: "station-1" })
    ).toThrow("ERR_REFERENCED_BY_ROUTE");

    // Track deletion guard
    expect(() =>
      executeCommand(state, { type: "track.delete", trackId: "track-1" })
    ).toThrow("ERR_TRACK_REFERENCED");
  });

  it("PT-GRD-03: Active run protection guard on Line / ServicePattern deletion", () => {
    let state = setupTestNetwork();

    state = executeCommand(state, {
      type: "line.create",
      payload: { id: "line-main", name: "本線", code: "MN", color: "#FF0000" },
    }).state;

    state = executeCommand(state, {
      type: "servicePattern.create",
      payload: { id: "sp-local", name: "各停", type: "local", lineIds: ["line-main"] },
    }).state;

    state = executeCommand(state, {
      type: "servicePattern.addDirection",
      payload: {
        servicePatternId: "sp-local",
        directionId: "dir-down",
        directionName: "下り",
        stopPatternStops: [
          { stationId: "station-1", commercialType: "stop" },
          { stationId: "station-2", commercialType: "stop" },
        ],
      },
    }).state;

    state = executeCommand(state, {
      type: "operationRoute.create",
      payload: {
        id: "route-ab",
        servicePatternId: "sp-local",
        directionId: "dir-down",
        name: "A-B各停",
        stops: [
          { stationId: "station-1", trackId: "track-1" },
          { stationId: "station-2", trackId: "track-2" },
        ],
      },
    }).state;

    state = executeCommand(state, {
      type: "fleet.formation-template.acquire",
      templateId: "test-single-locomotive",
      name: "101編成",
    }).state;
    const fId = state.fleet.formations.at(-1)!.id;

    state = executeCommand(state, {
      type: "fleet.formation.place",
      formationId: fId,
      stationId: "station-1",
      trackId: "track-1",
      distanceM: 50,
      orientation: "forward",
    }).state;

    state = executeCommand(state, {
      type: "trainRun.create",
      payload: {
        id: "tr-101",
        servicePatternId: "sp-local",
        directionId: "dir-down",
        routeId: "route-ab",
        formationId: fId,
        scheduledDepartureTimeMs: state.clock.currentTimeMs + 1000,
        requestedSpeedKph: 80,
      },
    }).state;

    // Line deletion should be blocked
    expect(() =>
      executeCommand(state, { type: "line.delete", payload: { id: "line-main" } })
    ).toThrow("ERR_REFERENCED_BY_ACTIVE_RUN");

    // ServicePattern deletion should be blocked
    expect(() =>
      executeCommand(state, { type: "servicePattern.delete", payload: { id: "sp-local" } })
    ).toThrow("ERR_REFERENCED_BY_ACTIVE_RUN");
  });

  it("PT-AI-01 & PT-AI-02: Preflight inspection functions", () => {
    let state = setupTestNetwork();

    state = executeCommand(state, {
      type: "line.create",
      payload: { id: "line-main", name: "本線", code: "MN", color: "#FF0000" },
    }).state;

    state = executeCommand(state, {
      type: "servicePattern.create",
      payload: { id: "sp-local", name: "各停", type: "local", lineIds: ["line-main"] },
    }).state;

    state = executeCommand(state, {
      type: "servicePattern.addDirection",
      payload: {
        servicePatternId: "sp-local",
        directionId: "dir-down",
        directionName: "下り",
        stopPatternStops: [
          { stationId: "station-1", commercialType: "stop" },
          { stationId: "station-2", commercialType: "stop" },
        ],
      },
    }).state;

    // Test inspectOperationRoute
    const routeInspect = inspectOperationRoute(state, {
      servicePatternId: "sp-local",
      directionId: "dir-down",
      stops: [
        { stationId: "station-1", trackId: "track-1" },
        { stationId: "station-2", trackId: "track-2" },
      ],
    });
    expect(routeInspect.valid).toBe(true);
    expect(routeInspect.summary?.tangentValid).toBe(true);

    // Create route
    state = executeCommand(state, {
      type: "operationRoute.create",
      payload: {
        id: "route-ab",
        servicePatternId: "sp-local",
        directionId: "dir-down",
        name: "A-B各停",
        stops: [
          { stationId: "station-1", trackId: "track-1" },
          { stationId: "station-2", trackId: "track-2" },
        ],
      },
    }).state;

    // Acquire vehicle, place at Station A
    state = executeCommand(state, {
      type: "fleet.formation-template.acquire",
      templateId: "test-single-locomotive",
      name: "101編成",
    }).state;
    const fId = state.fleet.formations.at(-1)!.id;

    state = executeCommand(state, {
      type: "fleet.formation.place",
      formationId: fId,
      stationId: "station-1",
      trackId: "track-1",
      distanceM: 50,
      orientation: "forward",
    }).state;

    // Test inspectTrainRun
    const runInspect = inspectTrainRun(state, {
      routeId: "route-ab",
      formationId: fId,
    });
    expect(runInspect.valid).toBe(true);
    expect(runInspect.eligibility.stationMatched).toBe(true);
    expect(runInspect.eligibility.orientationMatched).toBe(true);
  });

  it("PT-UI-01: Eligible route filtering and reason reporting for vehicle placement", () => {
    let state = setupTestNetwork();

    state = executeCommand(state, {
      type: "line.create",
      payload: { id: "line-main", name: "本線", code: "MN", color: "#FF0000" },
    }).state;

    state = executeCommand(state, {
      type: "servicePattern.create",
      payload: { id: "sp-local", name: "各停", type: "local", lineIds: ["line-main"] },
    }).state;

    state = executeCommand(state, {
      type: "servicePattern.addDirection",
      payload: {
        servicePatternId: "sp-local",
        directionId: "dir-down",
        directionName: "下り",
        stopPatternStops: [
          { stationId: "station-1", commercialType: "stop" },
          { stationId: "station-2", commercialType: "stop" },
        ],
      },
    }).state;

    state = executeCommand(state, {
      type: "operationRoute.create",
      payload: {
        id: "route-ab",
        servicePatternId: "sp-local",
        directionId: "dir-down",
        name: "A-B各停",
        stops: [
          { stationId: "station-1", trackId: "track-1" },
          { stationId: "station-2", trackId: "track-2" },
        ],
      },
    }).state;

    state = executeCommand(state, {
      type: "fleet.formation-template.acquire",
      templateId: "test-single-locomotive",
      name: "101編成",
    }).state;
    const fId = state.fleet.formations.at(-1)!.id;

    // Place vehicle at Station B (track-2) - station mismatch with route starting at Station A
    state = executeCommand(state, {
      type: "fleet.formation.place",
      formationId: fId,
      stationId: "station-2",
      trackId: "track-2",
      distanceM: 50,
      orientation: "forward",
    }).state;

    const eligible = getEligibleRoutesForPlacement(state, fId);
    expect(eligible).toHaveLength(0);

    const reasons = getIneligibleRouteReasons(state, fId, "route-ab");
    expect(reasons.some((r) => r.includes("配置駅と経路始発駅"))).toBe(true);
  });
});
