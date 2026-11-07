import type { MapState } from "./model";
import { yardConfig as config } from "../data/yardConfig";
import { executeYardCommand, findYardPath, trackLength, yardPoint, type YardAction } from "./yard";

/** 実配線から二つの仕分線と共通の引上げ位置を選ぶ。線路・接続は追加しない。 */
export function prepareYardScenario(original: MapState): MapState {
  if (original.yard?.cuts.length) throw new Error("操車車両は既に配置済み。試験開始前のセーブを読み込む");
  if (original.vehiclePlacements.length || original.operatingTrains.some((t) => t.state !== "completed")) throw new Error("既存の配置・運転があるマップには試験車両を追加しない");
  const groups = new Map<string, { baseM: number; trackId: string; junctionM: number; direction: 1 | -1; leadDir: 1 | -1 }[]>();
  const groupLength = config.wagonLengthM * config.wagonsPerDestination;
  const totalLength = groupLength * 2 + config.locomotiveLengthM;
  const branchHead = totalLength + config.branchClearanceM;
  for (const turnout of original.turnouts) {
    const j = original.junctions.find((j) => j.id === turnout.junctionId)!;
    const base = j.ports.find((p) => p.trackId === turnout.throughTrackId), branch = j.ports.find((p) => p.trackId === turnout.divergingTrackId);
    if (!base || !branch || branch.location === "interior") continue;
    const direction = branch.location === "start" ? 1 : -1;
    const length = trackLength(original, branch.trackId), head = branch.distanceM + direction * branchHead;
    if (head < 0 || head > length) continue;
    if (original.junctions.some((other) => other.id !== j.id && other.ports.some((p) => p.trackId === branch.trackId && (p.distanceM - branch.distanceM) * direction > 0 && (p.distanceM - branch.distanceM) * direction < branchHead + config.junctionClearanceM))) continue;
    const a = yardPoint(original, base.trackId, Math.max(0, base.distanceM - 2)), b = yardPoint(original, base.trackId, Math.min(trackLength(original, base.trackId), base.distanceM + 2));
    const c = yardPoint(original, branch.trackId, branch.distanceM), d = yardPoint(original, branch.trackId, branch.distanceM + direction * 2);
    const leadDir: 1 | -1 = (b.x - a.x) * (d.x - c.x) + (b.y - a.y) * (d.y - c.y) > 0 ? -1 : 1;
    const key = `${base.trackId}:${leadDir}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ baseM: base.distanceM, trackId: branch.trackId, junctionM: branch.distanceM, direction, leadDir });
  }
  const failures: string[] = [];
  for (const [key, branches] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    const baseId = key.slice(0, key.lastIndexOf(":"));
    for (let i = 0; i < branches.length; i++) for (let k = i + 1; k < branches.length; k++) {
      const a = branches[i], b = branches[k]; if (a.trackId === b.trackId) continue;
      const leadDir = a.leadDir;
      const junctionM = leadDir === 1 ? Math.max(a.baseM, b.baseM) : Math.min(a.baseM, b.baseM);
      const leadM = junctionM + leadDir * (totalLength + config.leadClearanceM);
      if (leadM < 0 || leadM > trackLength(original, baseId)) continue;
      const aM = a.junctionM + a.direction * branchHead, bM = b.junctionM + b.direction * branchHead;
      try {
        // 実際の有向経路がある候補だけ採用する。
        findYardPath(original, { trackId: baseId, distanceM: leadM, direction: -leadDir }, { trackId: a.trackId, distanceM: aM });
        findYardPath(original, { trackId: a.trackId, distanceM: aM - a.direction * groupLength, direction: -a.direction }, { trackId: baseId, distanceM: leadM });
        findYardPath(original, { trackId: baseId, distanceM: leadM, direction: -leadDir }, { trackId: b.trackId, distanceM: bM });
        const state = structuredClone(original);
        const vehicles = [...Array.from({ length: config.wagonsPerDestination * 2 }, (_, n) => ({ id: `yard-wagon-${n + 1}`, name: `試験貨車${n + 1}`, lengthM: config.wagonLengthM, powered: false, destination: n < config.wagonsPerDestination ? "A方面" : "B方面" })), { id: "yard-locomotive", name: "試験入換機", lengthM: config.locomotiveLengthM, powered: true, destination: "" }];
        executeYardCommand(state, { type: "yard.deploy", cutId: "arrival", name: "到着編成", vehicles, trackId: baseId, headM: leadM, direction: leadDir });
        const move = (cutId: string, trackId: string, distanceM: number): Extract<YardAction, { type: "yard.move" }> => ({ type: "yard.move", cutId, trackId, distanceM, speedKph: config.defaultSpeedKph });
        state.yard!.roles = [{ name: "到着・引上げ（試験指定）", trackId: baseId, distanceM: leadM }, { name: "A方面 仕分・出発（試験指定）", trackId: a.trackId, distanceM: aM }, { name: "B方面 仕分・出発（試験指定）", trackId: b.trackId, distanceM: bM }];
        state.yard!.plan = [
          { type: "yard.reverse", cutId: "arrival" }, move("arrival", a.trackId, aM),
          { type: "yard.split", cutId: "arrival", rearCount: config.wagonsPerDestination + 1, newCutId: "engine-B" },
          { type: "yard.reverse", cutId: "engine-B" }, move("engine-B", baseId, leadM),
          { type: "yard.reverse", cutId: "engine-B" }, move("engine-B", b.trackId, bM),
          { type: "yard.split", cutId: "engine-B", rearCount: 1, newCutId: "locomotive" },
          { type: "yard.reverse", cutId: "locomotive" }, move("locomotive", baseId, leadM),
          { type: "yard.reverse", cutId: "locomotive" },
          { ...move("locomotive", b.trackId, bM - b.direction * groupLength), couplingTarget: "engine-B" },
          { type: "yard.couple", cutId: "locomotive", otherCutId: "engine-B" },
          { type: "yard.reverse", cutId: "locomotive" }, move("locomotive", baseId, leadM),
        ];
        state.clock.paused = true; state.clock.speedMultiplier = 1;
        return state;
      } catch (error) { failures.push((error as Error).message); }
    }
  }
  throw new Error(`仕分試験用の接続・有効長を確保できない。${failures[0] ?? "同方向の二つの分岐と引上げ線が必要"}`);
}
