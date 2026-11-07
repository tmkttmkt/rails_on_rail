import { describe, expect, it } from "vitest";
import { executeCommand, type MapCommand } from "../src/simulation/commands";
import { createInitialState, type MapState } from "../src/simulation/model";
import { getUsableStablingSpans } from "../src/simulation/stabling";

function setup(turnout = false, side: "left" | "right" = "right"): MapState {
  let state = createInitialState();
  const run = (command: MapCommand) => { state = executeCommand(state, command).state; };
  run({ type: "track.create", kind: "side", geometry: "straight", points: [{ x: 0, y: 0 }, { x: 1000, y: 0 }] });
  if (turnout) run({ type: "turnout.create", trackId: "track-1", position: { x: 300, y: 0 }, typeId: "turnout-no12", side });
  run({ type: "station.createRange", name: "留置試験", kind: "depot", trackId: "track-1", startPosition: { x: 20, y: 0 }, endPosition: { x: 980, y: 0 }, includeTrackGroup: false });
  run({ type: "fleet.formation-template.acquire", templateId: "test-single-locomotive" });
  return state;
}

function place(state: MapState, distanceM: number, trackId = "track-1", stationId = state.stations[0].id) {
  return executeCommand(state, { type: "fleet.formation.place", formationId: state.fleet.formations[0].id, stationId, trackId, distanceM });
}

describe("留置配置の安全範囲", () => {
  it("保存済み範囲を分岐の両側へ分割し、返した区間は配置検査を通る", () => {
    const state = setup(true);
    const spans = getUsableStablingSpans(state, state.tracks[0], 20, 980);
    expect(spans).toHaveLength(2);
    expect(spans[0].startM).toBe(20);
    expect(spans[0].endM).toBeLessThan(300);
    expect(spans[1].startM).toBeGreaterThan(310);
    expect(spans[1].endM).toBe(980);
    for (const span of spans) {
      expect(place(state, span.startM + 4).state.vehiclePlacements).toHaveLength(1);
      expect(place(state, span.endM - 4).state.vehiclePlacements).toHaveLength(1);
    }
  });

  it("分岐線の表示範囲も近接区間を除き、継目のない線路は変更しない", () => {
    const state = setup(true);
    const branch = state.tracks.find((t) => t.id === state.turnouts[0].divergingTrackId)!;
    const spans = getUsableStablingSpans(state, branch, 0, 80);
    expect(spans).toHaveLength(1);
    expect(spans[0].startM).toBeGreaterThan(10);
    expect(spans[0].endM).toBe(80);
    const plain = setup();
    expect(getUsableStablingSpans(plain, plain.tracks[0], 20, 980)).toEqual([{ startM: 20, endM: 980 }]);
  });
  it("中心が範囲内でも編成の両端のはみ出しを拒否する", () => {
    const state = setup();
    expect(() => place(state, 21)).toThrow(/編成全体/);
    expect(() => place(state, 979)).toThrow(/編成全体/);
    expect(state.vehiclePlacements).toHaveLength(0);
  });

  it("8 m編成が境界まで収まれば配置できる", () => {
    expect(place(setup(), 24).state.vehiclePlacements[0].occupiedStartDistanceM).toBe(20);
    expect(place(setup(), 976).state.vehiclePlacements[0].occupiedEndDistanceM).toBe(980);
  });

  it.each(["left", "right"] as const)("%s分岐の真上と分岐直後を拒否し、離れた位置は許可する", (side) => {
    const state = setup(true, side);
    expect(() => place(state, 300)).toThrow(/分岐/);
    expect(() => place(state, 310)).toThrow(/必要間隔/);
    expect(place(state, 600).state.vehiclePlacements).toHaveLength(1);
    expect(place(state, 100).state.vehiclePlacements).toHaveLength(1);
  });

  it("分岐線側でも近接区間を拒否し、離れた位置は許可する", () => {
    let state = setup(true);
    const track = state.tracks.find((t) => t.id === state.turnouts[0].divergingTrackId)!;
    state = executeCommand(state, { type: "station.createRange", name: "分岐側", kind: "depot", trackId: track.id,
      startPosition: track.points[0], endPosition: track.points[track.points.length - 1], includeTrackGroup: false }).state;
    const stationId = state.stations[state.stations.length - 1].id;
    expect(() => place(state, 10, track.id, stationId)).toThrow(/必要間隔/);
    expect(place(state, 80, track.id, stationId).state.vehiclePlacements).toHaveLength(1);
  });

  it("端点どうしの継目は分岐として扱わない", () => {
    const state = setup();
    state.junctions.push({ id: "joint-test", position: { x: 0, y: 0 }, ports: [
      { trackId: "track-1", location: "start", distanceM: 0 },
      { trackId: "other", location: "end", distanceM: 20 },
    ] });
    expect(place(state, 24).state.vehiclePlacements).toHaveLength(1);
  });
});
