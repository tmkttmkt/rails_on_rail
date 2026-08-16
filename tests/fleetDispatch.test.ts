import { describe, expect, it } from "vitest";
import { createInitialState, getFormationOperationalStatus, type MapState } from "../src/simulation/model";
import { executeCommand } from "../src/simulation/commands";

function setupPlacedState(): { state: MapState; formationId: string; routeId: string; stationId: string } {
  let state = createInitialState();

  // Create a straight track of length 200m
  state = executeCommand(state, {
    type: "track.create",
    geometry: "straight",
    points: [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ],
  }).state;
  const trackId = state.tracks[0].id;

  // Create two stations along track: station-1 at 0-50m, station-2 at 150-200m
  state = executeCommand(state, {
    type: "station.createRange",
    name: "東京駅",
    trackId,
    startPosition: { x: 0, y: 0 },
    endPosition: { x: 50, y: 0 },
  }).state;
  const station1Id = state.stations[0].id;

  state = executeCommand(state, {
    type: "station.createRange",
    name: "品川駅",
    trackId,
    startPosition: { x: 150, y: 0 },
    endPosition: { x: 200, y: 0 },
  }).state;
  const station2Id = state.stations[1].id;

  // Create route from station1 to station2
  state = executeCommand(state, {
    type: "route.create",
    name: "東京→品川",
    stationIds: [station1Id, station2Id],
  }).state;
  const routeId = Object.values(state.operationRoutes)[0].id;

  // Acquire test formation
  state = executeCommand(state, {
    type: "fleet.formation-template.acquire",
    templateId: "test-passenger-3car",
    name: "テスト編成A",
  }).state;
  const formationId = state.fleet.formations[0].id;

  // Place formation at station 1 center (25m)
  state = executeCommand(state, {
    type: "fleet.formation.place",
    formationId,
    stationId: station1Id,
    trackId,
    distanceM: 25,
    orientation: "forward",
  }).state;

  return { state, formationId, routeId, stationId: station1Id };
}

describe("Scheduled Dispatch and Legacy Command Cleanup", () => {
  it("executes immediate dispatch when departureTimeMs equals current time", () => {
    let { state, formationId, routeId } = setupPlacedState();
    expect(getFormationOperationalStatus(state, formationId)).toBe("placed");

    const result = executeCommand(state, {
      type: "fleet.dispatch.reserve",
      formationId,
      routeId,
      departureTimeMs: state.clock.currentTimeMs,
      dwellSeconds: 5,
      requestedSpeedKph: 80,
    });
    state = result.state;

    expect(result.message).toContain("即時発車しました");
    expect(getFormationOperationalStatus(state, formationId)).toBe("operating");
    expect(state.operatingTrains.length).toBe(1);
    expect(state.vehiclePlacements.length).toBe(0);
  });

  it("creates scheduled reservation and fires when clock reaches departure time", () => {
    let { state, formationId, routeId } = setupPlacedState();
    const futureTimeMs = state.clock.currentTimeMs + 120 * 1000; // 2 minutes later

    state = executeCommand(state, {
      type: "fleet.dispatch.reserve",
      formationId,
      routeId,
      departureTimeMs: futureTimeMs,
      dwellSeconds: 10,
      requestedSpeedKph: 60,
    }).state;

    expect(getFormationOperationalStatus(state, formationId)).toBe("reserved");
    const runs = Object.values(state.trainRuns);
    expect(runs.length).toBe(1);
    expect(runs[0].status).toBe("reserved");
    expect(state.operatingTrains.length).toBe(0);

    // Advance clock by 60 seconds (not due yet)
    state = executeCommand(state, { type: "simulation.tick", elapsedSeconds: 60 }).state;
    expect(getFormationOperationalStatus(state, formationId)).toBe("reserved");
    expect(state.operatingTrains.length).toBe(0);

    // Advance clock across scheduled time (another 60 seconds)
    state = executeCommand(state, { type: "simulation.tick", elapsedSeconds: 60 }).state;
    expect(getFormationOperationalStatus(state, formationId)).toBe("operating");
    expect(state.operatingTrains.length).toBe(1);
    expect(Object.values(state.trainRuns)[0].status).toBe("operating");
  });

  it("allows cancelling pending reservations", () => {
    let { state, formationId, routeId } = setupPlacedState();
    const futureTimeMs = state.clock.currentTimeMs + 300 * 1000;

    state = executeCommand(state, {
      type: "fleet.dispatch.reserve",
      formationId,
      routeId,
      departureTimeMs: futureTimeMs,
    }).state;

    const resId = Object.values(state.trainRuns)[0].id;
    expect(getFormationOperationalStatus(state, formationId)).toBe("reserved");

    state = executeCommand(state, { type: "fleet.dispatch.cancel", reservationId: resId }).state;
    expect(Object.values(state.trainRuns)[0].status).toBe("cancelled");
    expect(getFormationOperationalStatus(state, formationId)).toBe("placed");
  });

  it("legacy train.dispatch rejects non-existent, empty, or unplaced formations", () => {
    let { state, routeId } = setupPlacedState();

    // 1. Non-existent formation
    expect(() =>
      executeCommand(state, {
        type: "train.dispatch",
        routeId,
        formationId: "non-existent",
        name: "テスト",
      })
    ).toThrow("指定された編成が存在しません");

    // 2. Unplaced formation
    state = executeCommand(state, { type: "fleet.formation.create", name: "空編成" }).state;
    const emptyId = state.fleet.formations.at(-1)!.id;

    expect(() =>
      executeCommand(state, {
        type: "train.dispatch",
        routeId,
        formationId: emptyId,
        name: "空発車",
      })
    ).toThrow("空の編成は発車できません");
  });

  it("handles train completion and awaiting-placement status when destination is occupied", () => {
    let { state, formationId, routeId } = setupPlacedState();

    // Create second formation placed at destination station (station-2) to cause occupation
    const trackId = state.tracks[0].id;
    const station2Id = state.stations[1].id;

    state = executeCommand(state, {
      type: "fleet.formation.create",
      name: "障害編成",
    }).state;
    const obstacleId = state.fleet.formations.at(-1)!.id;

    // Acquire vehicle and add to obstacle
    state = executeCommand(state, { type: "fleet.vehicle.acquire", designId: "test-virtual-locomotive" }).state;
    const vId = state.fleet.vehicleUnits.at(-1)!.id;
    state = executeCommand(state, { type: "fleet.formation.vehicle.add", formationId: obstacleId, vehicleId: vId, orientation: "forward" }).state;

    // Place obstacle at destination station center (175m)
    state = executeCommand(state, {
      type: "fleet.formation.place",
      formationId: obstacleId,
      stationId: station2Id,
      trackId,
      distanceM: 175,
      orientation: "forward",
    }).state;

    // Dispatch first formation
    state = executeCommand(state, {
      type: "fleet.dispatch.reserve",
      formationId,
      routeId,
      departureTimeMs: state.clock.currentTimeMs,
      dwellSeconds: 1,
      requestedSpeedKph: 500, // fast to reach destination quickly
    }).state;

    expect(state.operatingTrains.length).toBe(1);

    // Tick simulation to complete the journey
    for (let i = 0; i < 20; i++) {
      state = executeCommand(state, { type: "simulation.tick", elapsedSeconds: 5 }).state;
    }

    const train = state.operatingTrains.find((t) => t.formationId === formationId);
    expect(train?.state).toBe("completed");

    // Since destination track was occupied by obstacleId, auto-placement failed!
    // Formation status must be 'awaiting-placement'
    const status = getFormationOperationalStatus(state, formationId);
    expect(status).toBe("awaiting-placement");

    // Formation should be locked for editing
    expect(() =>
      executeCommand(state, { type: "fleet.formation.vehicle.add", formationId, vehicleId: "dummy", orientation: "forward" })
    ).toThrow("編集できません");

    // Now unplace the obstacle and manually place the awaiting formation
    state = executeCommand(state, { type: "fleet.formation.unplace", formationId: obstacleId }).state;

    // Place the awaiting formation
    state = executeCommand(state, {
      type: "fleet.formation.place",
      formationId,
      stationId: station2Id,
      trackId,
      distanceM: 175,
      orientation: "forward",
    }).state;

    expect(getFormationOperationalStatus(state, formationId)).toBe("placed");
  });
});
