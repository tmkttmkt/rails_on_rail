import { describe, expect, it } from "vitest";
import { executeCommand, type MapCommand } from "../src/simulation/commands";
import { createInitialState, type MapState } from "../src/simulation/model";
import { getFacilityUsableRanges, facilityTrialAtHome } from "../src/simulation/facilities";
import { parseMapState, serializeMapState } from "../src/simulation/persistence";
const run = (state: MapState, command: MapCommand) => executeCommand(state, command).state;
function setup(gaugeId = "gauge-1067mm") {
  let state = run(createInitialState(), { type: "track.create", geometry: "straight", points: [{ x: 0, y: 0 }, { x: 2000, y: 0 }] });
  state = run(state, { type: "turnout.create", trackId: "track-1", position: { x: 800, y: 0 }, typeId: "turnout-no12", side: "left", divergingLengthM: 300 });
  for (const track of state.tracks) track.specification.gaugeId = gaugeId;
  const branchId = state.turnouts[0].divergingTrackId;
  state = run(state, { type: "track.setKind", trackId: branchId, kind: "side" });
  state = run(state, { type: "facility.registerTrack", trackId: branchId, name: "試験側線" });
  return state;
}
function prepare() { let state = setup(); state = run(state, { type: "facility.setUse", stationId: state.stations[0].id, use: "maintenance" }); return run(state, { type: "facility.prepareTrial", stationId: state.stations[0].id }); }
describe("小側線施設の操作試験", () => {
  it("登録時は用途未確認とし、分岐支障を引いた範囲を保存する", () => {
    const state = setup(), station = state.stations[0];
    expect(station.facilityUse).toBe("unknown"); expect(station.stopPoints[0].startDistanceM).toBeGreaterThan(0);
    expect(parseMapState(serializeMapState(state))).toEqual(state);
    expect(() => run(state, { type: "facility.registerTrack", trackId: station.stopPoints[0].trackId, name: "重複" })).toThrow("登録可能な範囲");
    expect(() => run(state, { type: "facility.registerTrack", trackId: "track-1", name: "本線" })).toThrow("側線");
  });
  it("既存施設の範囲が旅客ホームと重なっていても留置位置として使わない", () => {
    let state = setup(); const station = state.stations[0], span = station.stopPoints[0];
    state = run(state, { type: "station.createRange", name: "旅客ホーム", trackId: span.trackId, startPosition: span.startPosition, endPosition: span.endPosition });
    expect(getFacilityUsableRanges(state, state.stations[0])).toEqual([]);
    state = run(state, { type: "facility.setUse", stationId: station.id, use: "maintenance" });
    expect(() => run(state, { type: "facility.prepareTrial", stationId: station.id })).toThrow("留置範囲");
  });
  it("用途未確認・引上げ線への試験車配置を拒否する", () => {
    let state = setup(), id = state.stations[0].id;
    expect(() => run(state, { type: "facility.prepareTrial", stationId: id })).toThrow("用途");
    state = run(state, { type: "facility.setUse", stationId: id, use: "headshunt" });
    expect(() => run(state, { type: "facility.prepareTrial", stationId: id })).toThrow("用途");
  });
  it("通常の編成配置でも引上げ線への留置を拒否し、旅客駅の用途変更を拒否する", () => {
    let state = setup(); state = run(state, { type: "facility.setUse", stationId: state.stations[0].id, use: "headshunt" });
    state = run(state, { type: "fleet.formation-template.acquire", templateId: "test-single-locomotive" });
    expect(() => run(state, { type: "fleet.formation.place", formationId: state.fleet.formations[0].id, stationId: state.stations[0].id, trackId: state.stations[0].stopPoints[0].trackId, distanceM: 100 })).toThrow("引上げ線");
    state = run(state, { type: "station.createRange", name: "旅客駅", trackId: "track-1", startPosition: { x: 100, y: 0 }, endPosition: { x: 300, y: 0 } });
    expect(() => run(state, { type: "facility.setUse", stationId: state.stations[1].id, use: "maintenance" })).toThrow("旅客駅");
  });
  it("軌間不一致・車長不足を原子的に拒否する", () => {
    let state = setup("gauge-1435mm"), id = state.stations[0].id;
    state = run(state, { type: "facility.setUse", stationId: id, use: "stabling" });
    expect(() => run(state, { type: "facility.prepareTrial", stationId: id })).toThrow("軌間"); expect(state.fleet.formations).toHaveLength(0);
    state = setup(); state = run(state, { type: "facility.setUse", stationId: id, use: "maintenance" });
    state.stations[0].stopPoints[0].endDistanceM = state.stations[0].stopPoints[0].startDistanceM + 5;
    expect(() => run(state, { type: "facility.prepareTrial", stationId: id })).toThrow("車長");
  });
  it("本線へ出て保存・再読込後も側線へ戻り、車両個体と向きを保持する", () => {
    let state = prepare(); const initial = JSON.stringify(state.fleet), trial = state.yard!.facilityTrial!;
    state = run(state, { type: "facility.runTrial" });
    let enteredMain = false;
    for (let i = 0; i < 100; i++) {
      state = run(state, { type: "simulation.tick", elapsedSeconds: 5 });
      if (state.yard!.cuts[0].spans.some((s) => s.trackId === trial.mainline.trackId)) enteredMain = true;
      state = parseMapState(serializeMapState(state));
      if (state.yard!.planIndex === 4 && !state.yard!.cuts[0].move) break;
    }
    expect(enteredMain).toBe(true); expect(state.yard!.error).toBeUndefined(); expect(state.yard!.automatic).toBe(false);
    expect(facilityTrialAtHome(state)).toBe(true); expect(JSON.stringify(state.fleet)).toBe(initial);
    state = run(state, { type: "facility.removeTrial" }); expect(state.yard).toBeUndefined(); expect(state.fleet.vehicleUnits).toHaveLength(0);
  });
  it("配置中の用途変更・削除・重複配置と本線走行中の撤収を拒否する", () => {
    let state = prepare(), id = state.stations[0].id;
    expect(() => run(state, { type: "facility.setUse", stationId: id, use: "headshunt" })).toThrow("撤収");
    expect(() => run(state, { type: "station.delete", stationId: id })).toThrow("撤収");
    expect(() => run(state, { type: "facility.prepareTrial", stationId: id })).toThrow("既存車両");
    state = run(state, { type: "facility.runTrial" }); state = run(state, { type: "simulation.tick", elapsedSeconds: 3 });
    expect(() => run(state, { type: "facility.removeTrial" })).toThrow("側線へ戻って");
  });
  it("保存データの未知用途・壊れた試験位置・施設参照を拒否する", () => {
    const state = prepare(); const invalid = JSON.parse(serializeMapState(state));
    invalid.stations[0].facilityUse = "fake"; expect(() => parseMapState(JSON.stringify(invalid))).toThrow("用途");
    invalid.stations[0].facilityUse = "maintenance"; invalid.yard.facilityTrial.home.toM = NaN;
    expect(() => parseMapState(JSON.stringify(invalid))).toThrow("停車位置");
    invalid.yard.facilityTrial.stationId = "missing"; expect(() => parseMapState(JSON.stringify(invalid))).toThrow("側線施設");
  });
});
