import { describe, expect, it } from "vitest";
import { createInitialState, type MapState } from "../src/simulation/model";
import { executeCommand } from "../src/simulation/commands";
import { parseMapState, validateMapState } from "../src/simulation/persistence";

function mapWithDepot(): MapState {
  let state = createInitialState();
  // 留置線（側線）を1本敷く
  state = executeCommand(state, {
    type: "track.create", kind: "side", geometry: "straight",
    points: [{ x: 0, y: 0 }, { x: 400, y: 0 }],
  }).state;
  // そこへ車両基地を置く
  state = executeCommand(state, {
    type: "station.createRange", kind: "depot", name: "森林公園検修区",
    trackId: "track-1", startPosition: { x: 20, y: 0 }, endPosition: { x: 380, y: 0 },
  }).state;
  return state;
}

describe("停車場と線路の運転上の区分", () => {
  it("種類を指定して作成でき、後から変更できる", () => {
    let state = mapWithDepot();
    expect(state.tracks[0].kind).toBe("side");
    expect(state.stations[0].kind).toBe("depot");

    state = executeCommand(state, { type: "track.setKind", trackId: "track-1", kind: "main" }).state;
    state = executeCommand(state, { type: "station.setKind", stationId: state.stations[0].id, kind: "yard" }).state;
    expect(state.tracks[0].kind).toBe("main");
    expect(state.stations[0].kind).toBe("yard");
    validateMapState(state);
  });

  it("既定は本線と駅になる", () => {
    let state = createInitialState();
    state = executeCommand(state, {
      type: "track.create", geometry: "straight", points: [{ x: 0, y: 0 }, { x: 200, y: 0 }],
    }).state;
    state = executeCommand(state, {
      type: "station.createRange", name: "中央", trackId: "track-1",
      startPosition: { x: 20, y: 0 }, endPosition: { x: 180, y: 0 },
    }).state;
    expect(state.tracks[0].kind).toBe("main");
    expect(state.stations[0].kind).toBe("station");
  });

  it("正しくない種類を拒否する", () => {
    const state = mapWithDepot();
    expect(() => executeCommand(state, { type: "track.setKind", trackId: "track-1", kind: "bogus" as never }))
      .toThrow(/線路の区分/);
    expect(() => executeCommand(state, { type: "station.setKind", stationId: state.stations[0].id, kind: "bogus" as never }))
      .toThrow(/停車場の種類/);
  });

  it("車両基地の停車地点へ編成を配置でき、同一線路へ複数編成を留置できる", () => {
    let state = mapWithDepot();
    for (let i = 0; i < 2; i += 1) {
      state = executeCommand(state, { type: "fleet.formation-template.acquire", templateId: "test-single-locomotive" }).state;
    }
    const [first, second] = state.fleet.formations;
    const stationId = state.stations[0].id;

    state = executeCommand(state, {
      type: "fleet.formation.place", formationId: first.id, stationId, trackId: "track-1", distanceM: 60,
    }).state;
    state = executeCommand(state, {
      type: "fleet.formation.place", formationId: second.id, stationId, trackId: "track-1", distanceM: 300,
    }).state;

    expect(state.vehiclePlacements).toHaveLength(2);
    expect(new Set(state.vehiclePlacements.map((p) => p.trackId))).toEqual(new Set(["track-1"]));
    validateMapState(state);
  });

  it("version 12 のセーブを本線・駅として読み込む", () => {
    const state = mapWithDepot();
    const raw: Record<string, unknown> = JSON.parse(JSON.stringify(state));
    raw.version = 12;
    for (const track of raw.tracks as Record<string, unknown>[]) delete track.kind;
    for (const station of raw.stations as Record<string, unknown>[]) delete station.kind;

    const migrated = parseMapState(JSON.stringify(raw));
    expect(migrated.version).toBe(13);
    expect(migrated.tracks[0].kind).toBe("main");
    expect(migrated.stations[0].kind).toBe("station");
  });
});
