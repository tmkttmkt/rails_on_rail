import { describe, expect, it } from "vitest";
import { executeCommand } from "../src/simulation/commands";
import { createLine, createServiceSystem } from "../src/simulation/lineServiceSystem";
import { createInitialState } from "../src/simulation/model";
import {
  createRoute,
  deleteRoute,
  duplicateReverseRoute,
  updateRoute,
} from "../src/simulation/routeDomain";

function setupTrackNetwork() {
  // Create 4 connected tracks: track-1 (0..200), track-2 (200..400), track-3 (400..600), track-4 (600..800)
  let state: any = createInitialState();
  state.lines = {};
  state.serviceSystems = {};
  state.routes = {};
  state.operations = {};
  state.nextLineId = 1;
  state.nextServiceSystemId = 1;
  state.nextRouteId = 1;

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
    type: "track.create",
    geometry: "straight",
    startConnectionTrackId: "track-3",
    points: [{ x: 600, y: 0 }, { x: 800, y: 0 }],
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

  // Station D at track-4 (620..680)
  state = executeCommand(state, {
    type: "station.createRange",
    name: "D駅",
    trackId: "track-4",
    startPosition: { x: 620, y: 0 },
    endPosition: { x: 680, y: 0 },
  }).state;

  // Create Line A and Line B
  const { line: lineA } = createLine(state, { id: "line-A", name: "A線", color: "#FF0000" });
  const { line: lineB } = createLine(state, { id: "line-B", name: "B線", color: "#0000FF" });

  // Create ServiceSystem A1 (belongs to line A) and ServiceSystem B1 (belongs to line B)
  const { serviceSystem: sysA1 } = createServiceSystem(state, { id: "sys-A1", lineId: lineA.id, name: "A本線系統" });
  const { serviceSystem: sysB1 } = createServiceSystem(state, { id: "sys-B1", lineId: lineB.id, name: "B本線系統" });

  return { state, lineA, lineB, sysA1, sysB1 };
}

describe("P2: 経路・物理経路 (Route & Physical Path) 単体・統合テスト", () => {
  it("UT-ROUTE-01: 経路の地点順・方向・legsが正常に構築・保存される（路線非依存）", () => {
    const { state } = setupTrackNetwork();

    const { route } = createRoute(state, {
      name: "A-C各駅停車",
      directionName: "下り",
      stops: [
        { stationId: "station-1", trackId: "track-1", commercialType: "stop", dwellSeconds: 20 },
        { stationId: "station-2", trackId: "track-2", commercialType: "stop", dwellSeconds: 15 },
        { stationId: "station-3", trackId: "track-3", commercialType: "stop", dwellSeconds: 30 },
      ],
    });

    expect(route.id).toBe("route-1");
    expect(route.name).toBe("A-C各駅停車");
    expect(route.directionName).toBe("下り");
    expect(route.stops).toHaveLength(3);
    expect(route.legs).toHaveLength(2);
    expect(route.totalDistanceM).toBeGreaterThan(0);
    expect(route.status).toBe("active");
  });

  it("UT-ROUTE-02: 経路作成は路線・系統が存在しなくても単独で実行できる", () => {
    let emptyState: any = createInitialState();
    emptyState.lines = {};
    emptyState.serviceSystems = {};
    emptyState.routes = {};
    emptyState.operations = {};
    emptyState = executeCommand(emptyState, {
      type: "track.create",
      geometry: "straight",
      points: [{ x: 0, y: 0 }, { x: 200, y: 0 }],
    }).state;
    emptyState = executeCommand(emptyState, {
      type: "track.create",
      geometry: "straight",
      startConnectionTrackId: "track-1",
      points: [{ x: 200, y: 0 }, { x: 400, y: 0 }],
    }).state;
    emptyState = executeCommand(emptyState, {
      type: "station.createRange",
      name: "X駅",
      trackId: "track-1",
      startPosition: { x: 20, y: 0 },
      endPosition: { x: 80, y: 0 },
    }).state;
    emptyState = executeCommand(emptyState, {
      type: "station.createRange",
      name: "Y駅",
      trackId: "track-2",
      startPosition: { x: 220, y: 0 },
      endPosition: { x: 280, y: 0 },
    }).state;

    const { route } = createRoute(emptyState, {
      name: "単独経路",
      directionName: "下り",
      stops: [
        { stationId: "station-1", trackId: "track-1" },
        { stationId: "station-2", trackId: "track-2" },
      ],
    });

    expect(route).toBeDefined();
    expect(route.name).toBe("単独経路");
    expect(route.stops).toHaveLength(2);
  });

  it("UT-ROUTE-03: 経路の連続同駅指定や2駅未満の指定を拒否する", () => {
    const { state } = setupTrackNetwork();

    // Less than 2 stops
    expect(() =>
      createRoute(state, {
        name: "1駅経路",
        directionName: "下り",
        stops: [{ stationId: "station-1", trackId: "track-1" }],
      })
    ).toThrow("2駅以上");

    // Same station consecutive
    expect(() =>
      createRoute(state, {
        name: "同駅連続経路",
        directionName: "下り",
        stops: [
          { stationId: "station-1", trackId: "track-1" },
          { stationId: "station-1", trackId: "track-1" },
        ],
      })
    ).toThrow("同じ駅を連続して指定");
  });

  it("IT-DIRECT-01: 4駅跨ぎの経路を正常に作成し、復路複製できる", () => {
    const { state } = setupTrackNetwork();

    const { route } = createRoute(state, {
      name: "直通快速",
      directionName: "下り",
      stops: [
        { stationId: "station-1", trackId: "track-1", commercialType: "stop" },
        { stationId: "station-2", trackId: "track-2", commercialType: "stop" },
        { stationId: "station-3", trackId: "track-3", commercialType: "pass" },
        { stationId: "station-4", trackId: "track-4", commercialType: "stop" },
      ],
    });

    expect(route.stops).toHaveLength(4);
    expect(route.stops[2].commercialType).toBe("pass");

    // Duplicate reverse route
    const { route: revRoute } = duplicateReverseRoute(state, {
      sourceRouteId: route.id,
      name: "直通快速 (上り)",
      directionName: "上り",
    });

    expect(revRoute.stops).toHaveLength(4);
    expect(revRoute.stops[0].stationId).toBe("station-4");
    expect(revRoute.stops[3].stationId).toBe("station-1");
    expect(revRoute.directionName).toBe("上り");
  });

  it("経路変更時に参照中の運行を「要確認 (requiresReview)」に設定する", () => {
    const { state } = setupTrackNetwork();

    const { route } = createRoute(state, {
      name: "本線経路",
      directionName: "下り",
      stops: [
        { stationId: "station-1", trackId: "track-1" },
        { stationId: "station-2", trackId: "track-2" },
      ],
    });

    // Mock dependent operation
    state.operations["op-1"] = {
      id: "op-1",
      name: "朝1号",
      routeId: route.id,
      calendar: { weekdays: [1, 2, 3, 4, 5] },
      stopTimes: [],
      requiresReview: false,
    };

    const { reviewRequiredOperationIds } = updateRoute(state, {
      id: route.id,
      stops: [
        { stationId: "station-1", trackId: "track-1" },
        { stationId: "station-2", trackId: "track-2" },
        { stationId: "station-3", trackId: "track-3" },
      ],
    });

    expect(reviewRequiredOperationIds).toContain("op-1");
    expect(state.operations["op-1"].requiresReview).toBe(true);

    // Cannot delete route if operation references it
    expect(() => deleteRoute(state, route.id)).toThrow("ERR_REFERENCED_BY_OPERATION");
  });
});
