import { describe, expect, it } from "vitest";
import { executeCommand } from "../src/simulation/commands";
import { createInitialState } from "../src/simulation/model";
import { parseMapState, serializeMapState, validateMapState } from "../src/simulation/persistence";

describe("P5: 保存形式 v11 および v10 からの移行テスト", () => {
  it("v11 MapStateをJSONで往復保存・復元できる", () => {
    let state = createInitialState();
    state = executeCommand(state, {
      type: "track.create",
      geometry: "straight",
      points: [{ x: 0, y: 0 }, { x: 200, y: 0 }],
    }).state;

    state = executeCommand(state, {
      type: "station.createRange",
      name: "東京",
      trackId: "track-1",
      startPosition: { x: 20, y: 0 },
      endPosition: { x: 80, y: 0 },
    }).state;

    const json = serializeMapState(state);
    const restored = parseMapState(json);
    expect(restored.version).toBe(11);
    expect(restored).toEqual(state);
  });

  it("v10 形式のセーブデータを v11 の路線・系統・経路・運行・運用モデルへ決定論的に移行する", () => {
    const v10Data = {
      version: 10,
      clock: { currentTimeMs: 1600000000000, paused: true, speedMultiplier: 1 },
      tracks: [
        {
          id: "track-1",
          geometry: "straight",
          points: [{ x: 0, y: 0 }, { x: 200, y: 0 }],
          resolvedPath: true,
          specification: {
            gaugeId: "gauge-1067mm",
            railProfileId: "jis-50n",
            supportSystemId: "pc-sleeper-ballast",
            roadbedId: "reinforced-roadbed",
          },
          engineering: { designSpeedKmh: 80, builtMinimumRadiusM: null, cantProfile: [] },
        },
        {
          id: "track-2",
          geometry: "straight",
          points: [{ x: 200, y: 0 }, { x: 400, y: 0 }],
          resolvedPath: true,
          specification: {
            gaugeId: "gauge-1067mm",
            railProfileId: "jis-50n",
            supportSystemId: "pc-sleeper-ballast",
            roadbedId: "reinforced-roadbed",
          },
          startConnection: { trackId: "track-1", junctionId: "junction-1" },
          engineering: { designSpeedKmh: 80, builtMinimumRadiusM: null, cantProfile: [] },
        },
      ],
      trackGroups: [],
      junctions: [
        {
          id: "junction-1",
          position: { x: 200, y: 0 },
          ports: [
            { trackId: "track-1", location: "end", distanceM: 200 },
            { trackId: "track-2", location: "start", distanceM: 0 },
          ],
        },
      ],
      stations: [
        {
          id: "station-1",
          name: "A駅",
          position: { x: 50, y: 0 },
          stopPoints: [
            {
              id: "station-1-sp-1",
              trackId: "track-1",
              startDistanceM: 20,
              endDistanceM: 80,
              startPosition: { x: 20, y: 0 },
              endPosition: { x: 80, y: 0 },
              direction: "both",
            },
          ],
        },
        {
          id: "station-2",
          name: "B駅",
          position: { x: 250, y: 0 },
          stopPoints: [
            {
              id: "station-2-sp-1",
              trackId: "track-2",
              startDistanceM: 20,
              endDistanceM: 80,
              startPosition: { x: 220, y: 0 },
              endPosition: { x: 280, y: 0 },
              direction: "both",
            },
          ],
        },
      ],
      lines: {
        "line-1": {
          id: "line-1",
          name: "東海道線",
          code: "JT",
          color: "#E65A00",
          servicePatternIds: ["sp-1"],
          createdAtGameTimeMs: 1600000000000,
          updatedAtGameTimeMs: 1600000000000,
        },
      },
      servicePatterns: {
        "sp-1": {
          id: "sp-1",
          name: "快速アクティー",
          type: "rapid",
          lineIds: ["line-1"],
          directions: [
            {
              id: "dir-1",
              name: "下り",
              stopPatternId: "spat-1",
              routeIds: ["route-1"],
            },
          ],
          createdAtGameTimeMs: 1600000000000,
          updatedAtGameTimeMs: 1600000000000,
        },
      },
      stopPatterns: {
        "spat-1": {
          id: "spat-1",
          servicePatternId: "sp-1",
          directionId: "dir-1",
          stops: [
            { sequence: 1, stationId: "station-1", commercialType: "stop", defaultDwellSeconds: 5 },
            { sequence: 2, stationId: "station-2", commercialType: "stop", defaultDwellSeconds: 5 },
          ],
        },
      },
      operationRoutes: {
        "route-1": {
          id: "route-1",
          servicePatternId: "sp-1",
          directionId: "dir-1",
          name: "東海道下り快速",
          stationIds: ["station-1", "station-2"],
          stops: [
            {
              id: "station-1-sp-1",
              sequence: 1,
              stationId: "station-1",
              trackId: "track-1",
              stopPointId: "station-1-sp-1",
              stopPointIndex: 0,
              distanceM: 50,
              commercialType: "stop",
              dwellSeconds: 5,
            },
            {
              id: "station-2-sp-1",
              sequence: 2,
              stationId: "station-2",
              trackId: "track-2",
              stopPointId: "station-2-sp-1",
              stopPointIndex: 0,
              distanceM: 50,
              commercialType: "stop",
              dwellSeconds: 5,
            },
          ],
          legs: [
            {
              fromStopSequence: 1,
              toStopSequence: 2,
              tracks: [
                { trackId: "track-1", direction: "forward", startDistanceM: 50, endDistanceM: 200, lengthM: 150 },
                { trackId: "track-2", direction: "forward", startDistanceM: 0, endDistanceM: 50, lengthM: 50 },
              ],
              junctionIds: ["junction-1"],
              totalDistanceM: 200,
            },
          ],
          totalDistanceM: 200,
          lengthM: 200,
          status: "active",
          createdAtGameTimeMs: 1600000000000,
        },
      },
      trainRuns: {
        "run-1": {
          id: "run-1",
          servicePatternId: "sp-1",
          directionId: "dir-1",
          stopPatternId: "spat-1",
          routeId: "route-1",
          formationId: "formation-1",
          scheduledDepartureTimeMs: 1600000000000 + 3600000,
          requestedSpeedKph: 80,
          status: "reserved",
          currentStopSequence: 1,
          createdAtGameTimeMs: 1600000000000,
          updatedAtGameTimeMs: 1600000000000,
        },
      },
      operatingTrains: [],
      fleet: {
        operatorClasses: [
          { id: "class-1", operatorId: "op-default", className: "標準電車", baseVehicleDesignId: "generic-light-two-axle-coach" },
        ],
        vehicleUnits: [
          { id: "vehicle-1", operatorClassId: "class-1", operatorNumber: "101" },
        ],
        formations: [
          { id: "formation-1", name: "101編成", vehicles: [{ vehicleId: "vehicle-1", orientation: "forward" }], warnings: [] },
        ],
        trains: [],
      },
      vehiclePlacements: [
        {
          id: "placement-1",
          formationId: "formation-1",
          stationId: "station-1",
          trackId: "track-1",
          centerDistanceM: 50,
          occupiedStartDistanceM: 40,
          occupiedEndDistanceM: 60,
          orientation: "forward",
        },
      ],
      nextTrackId: 3,
      nextTrackGroupId: 1,
      nextJunctionId: 2,
      nextStationId: 3,
      nextLineId: 2,
      nextServicePatternId: 2,
      nextStopPatternId: 2,
      nextOperationRouteId: 2,
      nextTrainRunId: 2,
      nextRouteId: 2,
      nextOperatingTrainId: 1,
      nextOperatorClassId: 2,
      nextVehicleUnitId: 2,
      nextFormationId: 2,
    };

    const migrated = parseMapState(JSON.stringify(v10Data));
    expect(migrated.version).toBe(11);
    expect(migrated.lines["line-1"]).toBeDefined();
    expect(migrated.lines["line-1"].name).toBe("東海道線");

    // ServiceSystems migrated
    expect(migrated.serviceSystems["sp-1"]).toBeDefined();
    expect(migrated.serviceSystems["sp-1"].lineId).toBe("line-1");
    expect(migrated.serviceSystems["sp-1"].name).toBe("快速アクティー");

    // Routes migrated with lineSections
    expect(migrated.routes["route-1"]).toBeDefined();
    expect(migrated.routes["route-1"].stops).toHaveLength(2);
    expect(migrated.routes["route-1"].lineSections).toHaveLength(1);
    expect(migrated.routes["route-1"].lineSections[0].lineId).toBe("line-1");
    expect(migrated.routes["route-1"].lineSections[0].serviceSystemId).toBe("sp-1");

    // Operations migrated
    expect(migrated.operations["op-1"]).toBeDefined();
    expect(migrated.operations["op-1"].routeId).toBe("route-1");

    // VehicleDuties migrated
    expect(migrated.vehicleDuties["duty-1"]).toBeDefined();
    expect(migrated.vehicleDuties["duty-1"].defaultFormationId).toBe("formation-1");

    // OperationExecutions migrated
    expect(migrated.operationExecutions["run-1"]).toBeDefined();
    expect(migrated.operationExecutions["run-1"].formationId).toBe("formation-1");

    // v10 obsolete keys removed
    expect((migrated as any).servicePatterns).toBeUndefined();
    expect((migrated as any).stopPatterns).toBeUndefined();
    expect((migrated as any).operationRoutes).toBeUndefined();
    expect((migrated as any).trainRuns).toBeUndefined();

    // Roundtrip validation
    validateMapState(migrated);
  });
});
