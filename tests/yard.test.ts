import { describe, expect, it } from "vitest";
import { executeCommand, type MapCommand } from "../src/simulation/commands";
import { createInitialState, type MapState } from "../src/simulation/model";
import { createSaveFile, parseSaveFile, serializeSaveFile } from "../src/simulation/persistence";
import { prepareYardScenario } from "../src/simulation/yardScenario";
import { cutLength, findYardPath, validateYard } from "../src/simulation/yard";

import { createYardFormation, yardVehicle, yardVehicleIds } from "../src/simulation/yardFleet";

function base(): MapState {
  return executeCommand(createInitialState(), { type: "track.create", geometry: "straight", points: [{ x: 0, y: 0 }, { x: 2000, y: 0 }] }).state;
}
const car = (id: string, powered = true) => ({ id, name: id, designId: powered ? "prototype-yard-locomotive-1520" : "prototype-yard-wagon-1520", destination: "A方面" });
function deploy(state: MapState, id: string, headM: number, vehicles = [car(id)]): MapState {
  const next = structuredClone(state);
  createYardFormation(next, id, id, vehicles);
  return executeCommand(next, { type: "yard.place", cutId: id, trackId: "track-1", headM, direction: 1 }).state;
}
const run = (s: MapState, c: MapCommand) => executeCommand(s, c).state;

describe("操車・入換", () => {
  it("大きなtickでも停止車両をすり抜けず、待機理由を保持する", () => {
    let state = deploy(deploy(base(), "one", 30), "two", 100);
    state = run(state, { type: "yard.move", cutId: "one", trackId: "track-1", distanceM: 200 });
    state = run(state, { type: "simulation.tick", elapsedSeconds: 600 });
    expect(state.yard!.cuts[0].spans[0].toM).toBe(30);
    expect(state.yard!.cuts[0].waiting).toMatch(/占有/);
  });
  it("接触まで接近して連結し、車両境界で解結しても位置・個体・長さを維持する", () => {
    let state = deploy(deploy(base(), "one", 30), "two", 100, [car("wagon", false)]);
    state = run(state, { type: "yard.move", cutId: "one", trackId: "track-1", distanceM: 88, couplingTarget: "two" });
    state = run(state, { type: "simulation.tick", elapsedSeconds: 100 });
    state = run(state, { type: "yard.couple", cutId: "one", otherCutId: "two" });
    expect(yardVehicleIds(state, state.yard!.cuts[0])).toEqual(["one", "wagon"]);
    expect(state.fleet.formations.find((f) => f.id === "two")).toBeUndefined();
    expect(state.fleet.formations.find((f) => f.id === "one")!.vehicles.map((v) => v.vehicleId)).toEqual(["wagon", "one"]);
    expect(cutLength(state, state.yard!.cuts[0])).toBe(28);
    expect(state.yard!.cuts[0].spans).toEqual([{ trackId: "track-1", fromM: 72, toM: 100 }]);
    state = run(state, { type: "yard.split", cutId: "one", rearCount: 1, newCutId: "loco" });
    expect(state.yard!.cuts.find((c) => c.id === "loco")!.spans[0]).toEqual({ trackId: "track-1", fromM: 72, toM: 88 });
    expect(() => run(state, { type: "yard.move", cutId: "one", trackId: "track-1", distanceM: 150 })).toThrow(/動力/);
    validateYard(state);
  });
  it("同一tick中は先行列の予約を解放せず、次tickで後続列を進める", () => {
    let state = deploy(deploy(base(), "lead", 100), "follow", 50);
    state = run(state, { type: "yard.move", cutId: "lead", trackId: "track-1", distanceM: 300, speedKph: 25 });
    state = run(state, { type: "yard.move", cutId: "follow", trackId: "track-1", distanceM: 200 });
    state = run(state, { type: "simulation.tick", elapsedSeconds: 60 });
    expect(state.yard!.cuts[1].spans.at(-1)!.toM).toBe(50);
    state = run(state, { type: "simulation.tick", elapsedSeconds: 60 });
    expect(state.yard!.cuts[0].spans.at(-1)!.toM).toBe(300);
    expect(state.yard!.cuts[1].spans.at(-1)!.toM).toBe(200);
  });
  it("暗黙の方向転換・離れた車両の連結・走行中解結・線路撤去を拒否する", () => {
    let state = deploy(deploy(base(), "one", 30, [car("loco"), car("wagon", false)]), "two", 100);
    expect(() => run(state, { type: "yard.move", cutId: "one", trackId: "track-1", distanceM: 5 })).toThrow(/向き/);
    expect(() => run(state, { type: "yard.couple", cutId: "one", otherCutId: "two" })).toThrow(/接触/);
    expect(() => run(state, { type: "track.delete", trackId: "track-1" })).toThrow(/操車/);
    state = run(state, { type: "yard.move", cutId: "one", trackId: "track-1", distanceM: 60 });
    expect(() => run(state, { type: "yard.split", cutId: "one", rearCount: 1, newCutId: "split" })).toThrow(/移動/);
  });
  it("途中保存から同じ移動を再開し、反転して同じ線路を戻れる", () => {
    let state = deploy(base(), "one", 100);
    state = run(state, { type: "yard.move", cutId: "one", trackId: "track-1", distanceM: 200 });
    state = run(state, { type: "simulation.tick", elapsedSeconds: 10 });
    const saved = parseSaveFile(serializeSaveFile(createSaveFile("途中", state))).state;
    expect(run(saved, { type: "simulation.tick", elapsedSeconds: 100 })).toEqual(run(state, { type: "simulation.tick", elapsedSeconds: 100 }));
    state = run(saved, { type: "yard.cancel", cutId: "one" });
    state = run(state, { type: "yard.reverse", cutId: "one" });
    state = run(state, { type: "yard.move", cutId: "one", trackId: "track-1", distanceM: 50 });
    state = run(state, { type: "simulation.tick", elapsedSeconds: 100 });
    expect(state.yard!.cuts[0].spans[0]).toEqual({ trackId: "track-1", fromM: 66, toM: 50 });
  });
  it("車両の重複・占有長の破損・不正速度を読込時に拒否する", () => {
    const state = deploy(base(), "one", 100);
    const save = createSaveFile("不正", state);
    save.state.yard!.cuts[0].spans[0].fromM = 50;
    expect(() => parseSaveFile(JSON.stringify(save))).toThrow(/車両長/);
    expect(() => run(state, { type: "yard.move", cutId: "one", trackId: "track-1", distanceM: 200, speedKph: Infinity })).toThrow(/速度/);
    const disconnected = createSaveFile("不連続", state);
    disconnected.state.yard!.cuts[0].spans = [{ trackId: "track-1", fromM: 84, toM: 92 }, { trackId: "track-1", fromM: 100, toM: 108 }];
    expect(() => parseSaveFile(JSON.stringify(disconnected))).toThrow(/不連続/);
    const invalidPlan = createSaveFile("不正計画", state);
    invalidPlan.state.yard!.planLabels = ["不正"];
    invalidPlan.state.yard!.plan = [{ type: "yard.move", cutId: "one", trackId: "track-1", distanceM: -1 }];
    expect(() => parseSaveFile(JSON.stringify(invalidPlan))).toThrow(/計画/);
  });
  it("平面交差に接続を捏造しない", () => {
    const state = run(base(), { type: "track.create", geometry: "straight", points: [{ x: 500, y: -100 }, { x: 500, y: 100 }] });
    expect(() => findYardPath(state, { trackId: "track-1", distanceM: 100, direction: 1 }, { trackId: "track-2", distanceM: 100 })).toThrow(/到達/);
  });
  it("本体は試作専用の転走命令を含むセーブを拒否する", () => {
    const save = createSaveFile("試作計画", deploy(base(), "one", 100));
    const raw = JSON.parse(JSON.stringify(save));
    raw.state.yard.plan = [{ type: "yard.roll", cutId: "one", trackId: "track-1", distanceM: 200 }];
    raw.state.yard.planLabels = ["試作転走"];
    expect(() => parseSaveFile(JSON.stringify(raw))).toThrow(/試作専用/);
  });
  it("旧独立yard状態は明示的に再生成を要求する", () => {
    const save = createSaveFile("旧状態", base());
    const raw = JSON.parse(JSON.stringify(save));
    raw.state.yard = { vehicles: [], cuts: [], plan: [], planIndex: 0, roles: [], automatic: false };
    expect(() => parseSaveFile(JSON.stringify(raw))).toThrow(/再生成/);
  });
  it("二つの実分岐を通って仕分・再連結・出発まで完走し、途中の複数線路占有を保持する", () => {
    let original = base();
    for (const x of [500, 800]) original = run(original, { type: "turnout.create", trackId: "track-1", position: { x, y: 0 }, typeId: "turnout-no12", side: "right" });
    let state = prepareYardScenario(original);
    state = run(state, { type: "yard.automatic", running: true });
    let across = false;
    for (let n = 0; n < 5000 && (state.yard!.automatic || state.yard!.cuts.some((c) => c.move)); n++) {
      state = run(state, { type: "simulation.tick", elapsedSeconds: 5 });
      across ||= state.yard!.cuts.some((c) => c.spans.length > 1);
      validateYard(state);
      if (n % 20 === 0) state = parseSaveFile(serializeSaveFile(createSaveFile("途中", state))).state;
    }
    expect(state.yard!.error).toBeUndefined();
    expect(state.yard!.planIndex).toBe(state.yard!.plan.length);
    expect(state.yard!.cuts.some((c) => c.move)).toBe(false);
    expect(across).toBe(true);
    expect(state.yard!.cuts.flatMap((c) => yardVehicleIds(state, c)).sort()).toEqual(state.fleet.vehicleUnits.map((v) => v.id).sort());
    expect(state.yard!.cuts).toHaveLength(2);
    for (const cut of state.yard!.cuts) {
      const destinations = new Set(yardVehicleIds(state, cut).map((id) => yardVehicle(state, id).destination).filter(Boolean));
      expect(destinations.size).toBe(1);
    }
    expect(state.tracks).toEqual(original.tracks);
    expect(state.junctions).toEqual(original.junctions);
  });
});
