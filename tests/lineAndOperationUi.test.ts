import { describe, expect, it } from "vitest";
import { createInitialState, type MapState } from "../src/simulation/model";
import { executeCommand } from "../src/simulation/commands";
import {
  addStopPatternEntry,
  buildRouteStopsInput,
  getExactStopPointOptions,
  getPreflightInspectionResult,
  removeStopPatternEntry,
  reorderStopPatternEntries,
  toggleLineMembership,
  updateStopPatternEntry,
} from "../src/ui/uiHelpers";

function createTestTopology(): MapState {
  let state = createInitialState();

  // Create 2 lines
  state = executeCommand(state, { type: "line.create", payload: { id: "line-1", name: "中央線", code: "JC", color: "#E65A00" } }).state;
  state = executeCommand(state, { type: "line.create", payload: { id: "line-2", name: "山手線", code: "JY", color: "#009933" } }).state;

  // Create 2 straight tracks end-to-end
  state = executeCommand(state, {
    type: "track.create",
    geometry: "straight",
    points: [
      { x: 0, y: 0 },
      { x: 500, y: 0 },
    ],
  }).state;

  state = executeCommand(state, {
    type: "track.create",
    geometry: "straight",
    points: [
      { x: 500, y: 0 },
      { x: 1000, y: 0 },
    ],
    startConnectionTrackId: "track-1",
  }).state;

  // Create Station A on track-1, Station B on track-2
  state = executeCommand(state, {
    type: "station.createRange",
    name: "東京駅",
    trackId: "track-1",
    startPosition: { x: 100, y: 0 },
    endPosition: { x: 200, y: 0 },
  }).state;

  state = executeCommand(state, {
    type: "station.createRange",
    name: "神田駅",
    trackId: "track-2",
    startPosition: { x: 600, y: 0 },
    endPosition: { x: 700, y: 0 },
  }).state;

  return state;
}

describe("Line and Operation UI Helpers & Direction Commands", () => {
  it("toggles multi-line memberships correctly", () => {
    let lineIds = ["line-1"];
    lineIds = toggleLineMembership(lineIds, "line-2", true);
    expect(lineIds).toEqual(["line-1", "line-2"]);

    lineIds = toggleLineMembership(lineIds, "line-2", true);
    expect(lineIds).toEqual(["line-1", "line-2"]);

    lineIds = toggleLineMembership(lineIds, "line-1", false);
    expect(lineIds).toEqual(["line-2"]);
  });

  it("adds, reorders, updates, and removes StopPattern entries", () => {
    let entries: Array<{ stationId: string; commercialType: "stop" | "pass"; dwellSeconds: number }> = [];

    entries = addStopPatternEntry(entries, "station-1", "stop", 45);
    entries = addStopPatternEntry(entries, "station-2", "pass", 0);
    expect(entries).toHaveLength(2);
    expect(entries[0].stationId).toBe("station-1");
    expect(entries[0].dwellSeconds).toBe(45);
    expect(entries[1].commercialType).toBe("pass");

    // Move Down station-1
    entries = reorderStopPatternEntries(entries, 0, "down");
    expect(entries[0].stationId).toBe("station-2");
    expect(entries[1].stationId).toBe("station-1");

    // Move Up station-1
    entries = reorderStopPatternEntries(entries, 1, "up");
    expect(entries[0].stationId).toBe("station-1");

    // Update commercialType to pass on station-1
    entries = updateStopPatternEntry(entries, 0, { commercialType: "pass" });
    expect(entries[0].commercialType).toBe("pass");
    expect(entries[0].dwellSeconds).toBe(0);

    // Remove entry
    entries = removeStopPatternEntry(entries, 0);
    expect(entries).toHaveLength(1);
    expect(entries[0].stationId).toBe("station-2");
  });

  it("executes servicePattern.addDirection, updateDirection, and deleteDirection commands", () => {
    let state = createTestTopology();

    // Create ServicePattern
    state = executeCommand(state, {
      type: "servicePattern.create",
      payload: { id: "sp-1", name: "快速", type: "rapid", lineIds: ["line-1", "line-2"] },
    }).state;

    expect(state.servicePatterns["sp-1"].lineIds).toEqual(["line-1", "line-2"]);

    // Add Direction
    state = executeCommand(state, {
      type: "servicePattern.addDirection",
      payload: {
        servicePatternId: "sp-1",
        directionName: "下り",
        stopPatternStops: [
          { stationId: "station-1", commercialType: "stop", dwellSeconds: 30 },
          { stationId: "station-2", commercialType: "stop", dwellSeconds: 20 },
        ],
      },
    }).state;

    const sp = state.servicePatterns["sp-1"];
    expect(sp.directions).toHaveLength(1);
    const dir = sp.directions[0];
    expect(dir.name).toBe("下り");

    const spat = state.stopPatterns[dir.stopPatternId];
    expect(spat.stops).toHaveLength(2);

    // Update Direction (rename & update stop pattern entries)
    state = executeCommand(state, {
      type: "servicePattern.updateDirection",
      payload: {
        servicePatternId: "sp-1",
        directionId: dir.id,
        directionName: "下り (高尾方面)",
        stopPatternStops: [
          { stationId: "station-1", commercialType: "stop", dwellSeconds: 45 },
          { stationId: "station-2", commercialType: "pass", dwellSeconds: 0 },
        ],
      },
    }).state;

    expect(state.servicePatterns["sp-1"].directions[0].name).toBe("下り (高尾方面)");
    const updatedSpat = state.stopPatterns[dir.stopPatternId];
    expect(updatedSpat.stops[0].defaultDwellSeconds).toBe(45);
    expect(updatedSpat.stops[1].commercialType).toBe("pass");

    // Delete Direction
    state = executeCommand(state, {
      type: "servicePattern.deleteDirection",
      payload: {
        servicePatternId: "sp-1",
        directionId: dir.id,
      },
    }).state;

    expect(state.servicePatterns["sp-1"].directions).toHaveLength(0);
    expect(state.stopPatterns[dir.stopPatternId]).toBeUndefined();
  });

  it("generates exact stopPoint options and evaluates preflight inspection", () => {
    let state = createTestTopology();

    // Create ServicePattern & Direction
    state = executeCommand(state, {
      type: "servicePattern.create",
      payload: { id: "sp-1", name: "各停", type: "local", lineIds: ["line-1"] },
    }).state;

    state = executeCommand(state, {
      type: "servicePattern.addDirection",
      payload: {
        servicePatternId: "sp-1",
        directionName: "下り",
        stopPatternStops: [
          { stationId: "station-1", commercialType: "stop", dwellSeconds: 30 },
          { stationId: "station-2", commercialType: "stop", dwellSeconds: 30 },
        ],
      },
    }).state;

    const dir = state.servicePatterns["sp-1"].directions[0];

    const optionsSt1 = getExactStopPointOptions(state, "station-1");
    expect(optionsSt1).toHaveLength(1);
    expect(optionsSt1[0].trackId).toBe("track-1");
    expect(optionsSt1[0].label).toContain("東京駅");

    const stopsInput = buildRouteStopsInput(
      {
        "station-1": { trackId: "track-1", stopPointId: optionsSt1[0].id, commercialType: "stop", dwellSeconds: 30 },
        "station-2": { trackId: "track-2", commercialType: "stop", dwellSeconds: 30 },
      },
      [
        { stationId: "station-1", commercialType: "stop", defaultDwellSeconds: 30 },
        { stationId: "station-2", commercialType: "stop", defaultDwellSeconds: 30 },
      ]
    );

    const inspection = getPreflightInspectionResult(state, {
      servicePatternId: "sp-1",
      directionId: dir.id,
      stops: stopsInput,
    });

    expect(inspection.valid).toBe(true);
    expect(inspection.summary?.totalDistanceM).toBeGreaterThan(0);
  });
});
