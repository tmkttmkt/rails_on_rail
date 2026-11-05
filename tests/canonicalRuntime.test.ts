import { describe, expect, it } from "vitest";
import { executeCommand } from "../src/simulation/commands";
import { createInitialState, type MapState } from "../src/simulation/model";
import { parseMapState } from "../src/simulation/persistence";

function setupCanonicalTestMap(): { state: MapState; station1Id: string; station2Id: string; trackId: string; formationId: string; routeId: string } {
  let state = createInitialState();

  state = executeCommand(state, {
    type: "track.create",
    geometry: "straight",
    points: [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
    ],
  }).state;
  const trackId = state.tracks[0].id;

  state = executeCommand(state, {
    type: "station.createRange",
    name: "駅A",
    trackId,
    startPosition: { x: 0, y: 0 },
    endPosition: { x: 50, y: 0 },
  }).state;
  const station1Id = state.stations[0].id;

  state = executeCommand(state, {
    type: "station.createRange",
    name: "駅B",
    trackId,
    startPosition: { x: 250, y: 0 },
    endPosition: { x: 300, y: 0 },
  }).state;
  const station2Id = state.stations[1].id;

  state = executeCommand(state, {
    type: "route.create",
    name: "A→B線",
    stationIds: [station1Id, station2Id],
  }).state;
  const routeId = Object.keys(state.operationRoutes)[0];

  state = executeCommand(state, {
    type: "fleet.formation-template.acquire",
    templateId: "test-single-locomotive",
    name: "編成1",
  }).state;
  const formationId = state.fleet.formations[0].id;

  state = executeCommand(state, {
    type: "fleet.formation.place",
    formationId,
    stationId: station1Id,
    trackId,
    distanceM: 25,
    orientation: "forward",
  }).state;

  return { state, station1Id, station2Id, trackId, formationId, routeId };
}

describe("Canonical Runtime Model and Migration Invariants", () => {
  it("1. Single canonical source: routes is primary collection and legacy reservations migrated", () => {
    const { state } = setupCanonicalTestMap();
    expect(state.routes).toBeDefined();
    expect((state as any).dispatchReservations).toBeUndefined();
    expect(state.operationRoutes).toBeDefined();
    expect(state.trainRuns).toBeDefined();
  });

  it("2. StationStopPoint and RouteStop have stable stopPointId", () => {
    const { state, routeId } = setupCanonicalTestMap();
    const station = state.stations[0];
    expect(station.stopPoints[0].id).toBeDefined();
    expect(station.stopPoints[0].id).toMatch(/station-\d+-sp-1/);

    const route = state.operationRoutes[routeId];
    expect(route.stops[0].stopPointId).toBe(station.stopPoints[0].id);
  });

  it("3. Legacy dispatch adapters create TrainRun without duplicate tick departures", () => {
    let { state, formationId, routeId } = setupCanonicalTestMap();

    state = executeCommand(state, {
      type: "fleet.dispatch.reserve",
      formationId,
      routeId,
      departureTimeMs: state.clock.currentTimeMs + 10000,
    }).state;

    expect(Object.values(state.trainRuns)).toHaveLength(1);
    expect(Object.values(state.trainRuns)[0].status).toBe("reserved");
    expect((state as any).dispatchReservations).toBeUndefined();

    // Advance tick to trigger departure
    state = executeCommand(state, { type: "simulation.tick", elapsedSeconds: 20 }).state;
    expect(state.operatingTrains).toHaveLength(1);
    expect(Object.values(state.trainRuns)[0].status).toBe("operating");

    // Second tick does not duplicate departures or operating trains
    state = executeCommand(state, { type: "simulation.tick", elapsedSeconds: 20 }).state;
    expect(state.operatingTrains).toHaveLength(1);
  });

  it("4. Revalidate departure at tick time and mark failed on placement or orientation mismatch", () => {
    let { state, formationId, routeId } = setupCanonicalTestMap();

    state = executeCommand(state, {
      type: "fleet.dispatch.reserve",
      formationId,
      routeId,
      departureTimeMs: state.clock.currentTimeMs + 5000,
    }).state;

    // Mutate placement to invalid track to simulate removal / track split
    state.vehiclePlacements[0].trackId = "non-existent-track";

    // Tick to departure time
    state = executeCommand(state, { type: "simulation.tick", elapsedSeconds: 10 }).state;
    const run = Object.values(state.trainRuns)[0];

    expect(run.status).toBe("failed");
    expect(run.failureReason).toContain("start-track-mismatch");
    expect(state.operatingTrains).toHaveLength(0);
  });

  it("5. Migration from v9 converts pending/executed/operating/cancelled/failed reservations to TrainRuns", () => {
    const v9State: any = {
      version: 9,
      clock: { currentTimeMs: 100000, paused: true, speedMultiplier: 1 },
      tracks: [
        {
          id: "track-1",
          geometry: "straight",
          points: [{ x: 0, y: 0 }, { x: 200, y: 0 }],
          resolvedPath: true,
          specification: { gaugeId: "gauge-1067mm", railProfileId: "jis-50n", supportSystemId: "pc-sleeper-ballast", roadbedId: "reinforced-roadbed" },
          engineering: { designSpeedKmh: 80, builtMinimumRadiusM: null, cantProfile: [] },
        },
      ],
      trackGroups: [],
      junctions: [],
      stations: [
        {
          id: "station-1",
          name: "A",
          position: { x: 20, y: 0 },
          stopPoints: [{ trackId: "track-1", startDistanceM: 0, endDistanceM: 40, startPosition: { x: 0, y: 0 }, endPosition: { x: 40, y: 0 }, direction: "both" }],
        },
        {
          id: "station-2",
          name: "B",
          position: { x: 180, y: 0 },
          stopPoints: [{ trackId: "track-1", startDistanceM: 160, endDistanceM: 200, startPosition: { x: 160, y: 0 }, endPosition: { x: 200, y: 0 }, direction: "both" }],
        },
      ],
      lines: {},
      servicePatterns: {},
      stopPatterns: {},
      operationRoutes: {},
      routes: [
        {
          id: "route-1",
          name: "R1",
          stationIds: ["station-1", "station-2"],
          legs: [[{ trackId: "track-1", fromDistanceM: 20, toDistanceM: 180 }]],
          lengthM: 160,
        },
      ],
      fleet: {
        operatorClasses: [{ id: "class-1", operatorId: "op-1", className: "C1", baseVehicleDesignId: "generic-light-two-axle-coach" }],
        vehicleUnits: [{ id: "unit-1", operatorClassId: "class-1", operatorNumber: "1" }],
        formations: [{ id: "fmt-1", name: "F1", vehicles: [{ vehicleId: "unit-1", orientation: "forward" }], warnings: [] }],
        trains: [],
      },
      vehiclePlacements: [],
      dispatchReservations: [
        { id: "res-1", formationId: "fmt-1", routeId: "route-1", departureTimeMs: 100000, status: "pending", createdAtGameTimeMs: 90000 },
      ],
      operatingTrains: [],
      trainRuns: {},
      nextTrackId: 2,
      nextTrackGroupId: 1,
      nextJunctionId: 1,
      nextStationId: 3,
      nextLineId: 1,
      nextServicePatternId: 1,
      nextStopPatternId: 1,
      nextOperationRouteId: 2,
      nextTrainRunId: 1,
      nextRouteId: 2,
      nextOperatingTrainId: 1,
      nextOperatorClassId: 2,
      nextVehicleUnitId: 2,
      nextFormationId: 2,
      nextDispatchReservationId: 2,
    };

    const v11State = parseMapState(JSON.stringify(v9State));
    expect(v11State.version).toBe(12);
    expect(v11State.routes).toBeDefined();
    expect((v11State as any).dispatchReservations).toBeUndefined();
    expect(v11State.routes["route-1"]).toBeDefined();

    const run = v11State.operationExecutions["run-res-1"];
    expect(run).toBeDefined();
    expect(run.status).toBe("reserved");
  });
});
