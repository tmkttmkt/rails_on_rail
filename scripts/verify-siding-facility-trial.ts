import fs from "node:fs";
import { executeCommand } from "../src/simulation/commands";
import { parseSaveFile, createSaveFile, serializeSaveFile } from "../src/simulation/persistence";
import { facilityTrialAtHome } from "../src/simulation/facilities";
const input = "saves/osm-tobu-tojo-depots.json";
let state = parseSaveFile(fs.readFileSync(input, "utf8")).state;
const original = JSON.stringify([state.tracks, state.junctions, state.turnouts]);
const station = state.stations.find((s) => s.name === "上福岡留置線")!;
if (!station) throw new Error("上福岡留置線がない");
state = executeCommand(state, { type: "facility.setUse", stationId: station.id, use: "maintenance" }).state;
state = executeCommand(state, { type: "facility.prepareTrial", stationId: station.id }).state;
const trial = state.yard!.facilityTrial!;
const startingFleet = JSON.stringify(state.fleet);
fs.writeFileSync("saves/osm-tojo-siding-trial.json", serializeSaveFile(createSaveFile("上福岡｜小側線の保守車往復試験", state)));
state = executeCommand(state, { type: "facility.runTrial" }).state;
let enteredMainline = false, resumedFromSave = false, ticks = 0;
for (; ticks < 500; ticks++) {
  state = executeCommand(state, { type: "simulation.tick", elapsedSeconds: 2 }).state;
  if (state.yard!.cuts.some((c) => c.spans.some((s) => s.trackId === trial.mainline.trackId))) enteredMainline = true;
  if (enteredMainline && !resumedFromSave) { state = parseSaveFile(serializeSaveFile(createSaveFile("途中保存検証", state))).state; resumedFromSave = true; }
  if (state.yard!.error) throw new Error(state.yard!.error);
  if (state.yard!.planIndex === state.yard!.plan.length && !state.yard!.cuts.some((c) => c.move)) break;
}
if (!enteredMainline || !resumedFromSave || !facilityTrialAtHome(state) || ticks >= 500 || state.yard!.automatic) throw new Error("本線往復試験が完走しなかった");
if (JSON.stringify(state.fleet) !== startingFleet) throw new Error("往復後のfleet・車両順が変わった");
if (JSON.stringify([state.tracks, state.junctions, state.turnouts]) !== original) throw new Error("元の線路・接続が変わった");
parseSaveFile(serializeSaveFile(createSaveFile("完了検証", state)));
fs.writeFileSync("saves/osm-tojo-siding-trial.report", JSON.stringify({ input, station: station.name, trial, simulatedSeconds: (ticks + 1) * 2, enteredMainline, resumedFromSave, returnedHome: true, fleetUnchanged: true, geometryUnchanged: true }, null, 2));
console.log(fs.readFileSync("saves/osm-tojo-siding-trial.report", "utf8"));
