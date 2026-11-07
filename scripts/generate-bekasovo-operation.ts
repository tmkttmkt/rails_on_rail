import fs from "node:fs";
import path from "node:path";
import { parseSaveFile, createSaveFile, serializeSaveFile } from "../src/simulation/persistence";
import { prepareYardScenario } from "../src/simulation/yardScenario";
import { executeCommand } from "../src/simulation/commands";
import { validateYard } from "../src/simulation/yard";

const source = process.argv[2] ?? "saves/osm-bekasovo-split.json";
const output = process.argv[3] ?? "saves/osm-bekasovo-operation.json";
if (path.resolve(source).toLowerCase() === path.resolve(output).toLowerCase()) throw new Error("入力と出力は別ファイルにする");
const original = parseSaveFile(fs.readFileSync(source, "utf8"));
const initial = prepareYardScenario(original.state);
console.log("試験上の役割:", JSON.stringify(initial.yard!.roles));
let state = executeCommand(initial, { type: "yard.automatic", running: true }).state;
let elapsed = 0;
while ((state.yard!.automatic || state.yard!.cuts.some((c) => c.move)) && elapsed < 3600) {
  state = executeCommand(state, { type: "simulation.tick", elapsedSeconds: 1 }).state; elapsed++;
  validateYard(state);
  if (elapsed % 60 === 0) state = parseSaveFile(serializeSaveFile(createSaveFile("検証", state))).state;
  if (state.yard!.error) throw new Error(state.yard!.error);
}
if (state.yard!.planIndex !== state.yard!.plan.length || state.yard!.cuts.some((c) => c.move)) throw new Error(`計画が完了しない: ${JSON.stringify(state.yard)}`);
for (const dest of ["A方面", "B方面"]) {
  const cut = state.yard!.cuts.find((c) => c.vehicleIds.some((id) => state.yard!.vehicles.find((v) => v.id === id)!.destination === dest));
  const wagons = cut?.vehicleIds.map((id) => state.yard!.vehicles.find((v) => v.id === id)!).filter((v) => !v.powered);
  if (!wagons || wagons.length !== 3 || !wagons.every((v) => v.destination === dest)) throw new Error("仕分結果が不正");
}
if (JSON.stringify(initial.tracks) !== JSON.stringify(original.state.tracks) || JSON.stringify(initial.junctions) !== JSON.stringify(original.state.junctions)) throw new Error("元配線が変更された");
fs.writeFileSync(output, serializeSaveFile(createSaveFile("ベカソヴォ (OSM・入換試験)", initial)), "utf8");
console.log(`完走: ${elapsed}秒 / ${state.yard!.planIndex}工程 / 車両${state.yard!.vehicles.length}両 / ${output}`);
