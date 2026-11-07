import { executeCommand, type MapCommand } from "../src/simulation/commands";
import { createInitialState } from "../src/simulation/model";

let state = createInitialState();
const run = (c: MapCommand) => { state = executeCommand(state, c).state; };
const spec = { gaugeId: "gauge-1067mm", railProfileId: "jis-50n", supportSystemId: "pc-sleeper-ballast", roadbedId: "reinforced-roadbed" };

run({ type: "track.create", kind: "side", geometry: "straight", points: [{ x: 0, y: 0 }, { x: 600, y: 0 }], specification: spec, designSpeedKmh: 45 });
// 300m地点に12番分岐器を設置
run({ type: "turnout.create", trackId: "track-1", position: { x: 300, y: 0 }, typeId: "turnout-no12", side: "right" });
// 線路全体を車両基地にする（取り込みがやっているのと同じ）
run({ type: "station.createRange", kind: "depot", name: "試験車両基地", trackId: "track-1",
      startPosition: { x: 5, y: 0 }, endPosition: { x: 595, y: 0 }, includeTrackGroup: false });
run({ type: "fleet.formation-template.acquire", templateId: "test-single-locomotive" });

const stationId = state.stations[0].id;
const formationId = state.fleet.formations[0].id;
const junction = state.junctions[0];
const port = junction.ports.find((p) => p.trackId === "track-1")!;
console.log(`分岐器の位置: track-1 の ${port.distanceM.toFixed(1)} m地点`);

// まさに分岐器の真上へ置いてみる
try {
  run({ type: "fleet.formation.place", formationId, stationId, trackId: "track-1", distanceM: port.distanceM });
  const p = state.vehiclePlacements[0];
  console.log(`結果: 配置できてしまった（占有 ${p.occupiedStartDistanceM.toFixed(1)}〜${p.occupiedEndDistanceM.toFixed(1)} m）`);
  console.log(`      → 分岐器 ${port.distanceM.toFixed(1)} m をまたいでいる: ${p.occupiedStartDistanceM <= port.distanceM && port.distanceM <= p.occupiedEndDistanceM}`);
} catch (e) {
  console.log("結果: 拒否された —", (e as Error).message);
}
