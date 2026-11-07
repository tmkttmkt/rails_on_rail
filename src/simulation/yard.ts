import { analyzeLine, sampleTrack, getTrackPortTangent, TURNOUT_TANGENT_BASELINE_M } from "./geometry";
import type { MapState, Point } from "./model";
import { yardConfig } from "../data/yardConfig";
import { yardFormation, yardVehicle, yardVehicleIds } from "./yardFleet";
import { assertMechanicalConnection, formationWarnings, getFormationLengthM, type Formation } from "./fleet";

export interface YardSpan { trackId: string; fromM: number; toM: number }
export interface YardCut { id: string; spans: YardSpan[]; move?: { spans: YardSpan[]; speedKph: number; couplingTarget?: string }; waiting?: string }
export type YardAction =
  | { type: "yard.move"; cutId: string; trackId: string; distanceM: number; speedKph?: number; couplingTarget?: string }
  | { type: "yard.reverse"; cutId: string }
  | { type: "yard.split"; cutId: string; rearCount: number; newCutId: string }
  | { type: "yard.couple"; cutId: string; otherCutId: string };
export interface YardState { formatVersion: 2; cuts: YardCut[]; plan: YardAction[]; planLabels: string[]; planIndex: number; automatic: boolean; error?: string; roles: { name: string; trackId: string; distanceM: number }[] }
export type YardCommand = YardAction
  | { type: "yard.place"; cutId: string; trackId: string; headM: number; direction: 1 | -1 }
  | { type: "yard.automatic"; running: boolean }
  | { type: "yard.cancel"; cutId: string };
const EPS = 0.01;
export const spanLength = (s: YardSpan): number => Math.abs(s.toM - s.fromM);
export const cutLength = (state: MapState, cut: YardCut): number => getFormationLengthM(state.fleet, yardFormation(state, cut)).lengthM;
export const trackLength = (state: MapState, id: string): number => {
  const track = state.tracks.find((t) => t.id === id);
  if (!track) throw new Error(`線路がない: ${id}`);
  return analyzeLine(sampleTrack(track)).lengthM;
};
export function yardPoint(state: MapState, trackId: string, distanceM: number): Point {
  const track = state.tracks.find((t) => t.id === trackId);
  if (!track) throw new Error(`線路がない: ${trackId}`);
  const points = sampleTrack(track);
  let rest = distanceM;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], length = Math.hypot(b.x - a.x, b.y - a.y);
    if (rest <= length && length > 0) return { x: a.x + (b.x - a.x) * rest / length, y: a.y + (b.y - a.y) * rest / length };
    rest -= length;
  }
  return points.at(-1)!;
}
function tangent(state: MapState, id: string, m: number, dir: number, turnout = false): Point {
  const length = trackLength(state, id);
  const track = state.tracks.find((t) => t.id === id)!;
  const tangent = getTrackPortTangent(track, m <= EPS ? "start" : m >= length - EPS ? "end" : "interior", m, turnout ? TURNOUT_TANGENT_BASELINE_M : 0);
  return { x: tangent.x * dir, y: tangent.y * dir };
}

/** 探索の向きを状態に含め、暗黙の折返しや分岐の鋭角な渡りを防ぐ。 */
export function findYardPath(state: MapState, start: { trackId: string; distanceM: number; direction: number }, target: { trackId: string; distanceM: number }): YardSpan[] {
  const cuts = new Map<string, number[]>();
  for (const track of state.tracks) cuts.set(track.id, [0, trackLength(state, track.id)]);
  const add = (id: string, m: number) => { const list = cuts.get(id); if (!list || !Number.isFinite(m) || m < -EPS || m > list[1] + EPS) throw new Error(`線路距離が不正: ${id} ${m}`); list.push(m); };
  for (const j of state.junctions) for (const p of j.ports) add(p.trackId, p.distanceM);
  add(start.trackId, start.distanceM); add(target.trackId, target.distanceM);
  for (const [id, list] of cuts) cuts.set(id, [...new Set(list)].sort((a, b) => a - b));
  interface Node { trackId: string; m: number; dir: number }
  const key = (n: Node) => `${n.trackId}:${n.m}:${n.dir}`;
  const first: Node = { trackId: start.trackId, m: start.distanceM, dir: start.direction };
  const pending = new Map([[key(first), first]]), costs = new Map([[key(first), 0]]);
  const previous = new Map<string, { from: string; span?: YardSpan }>();
  let reached: string | undefined;
  while (pending.size) {
    const currentKey = [...pending.keys()].reduce((a, b) => costs.get(a)! < costs.get(b)! ? a : b);
    const node = pending.get(currentKey)!; pending.delete(currentKey);
    if (node.trackId === target.trackId && Math.abs(node.m - target.distanceM) < EPS) { reached = currentKey; break; }
    const offer = (next: Node, cost: number, span?: YardSpan) => {
      const id = key(next), total = costs.get(currentKey)! + cost;
      if (total + 1e-8 >= (costs.get(id) ?? Infinity)) return;
      costs.set(id, total); pending.set(id, next); previous.set(id, { from: currentKey, span });
    };
    const list = cuts.get(node.trackId)!;
    const idx = list.indexOf(node.m), m = list[idx + node.dir];
    if (m !== undefined) offer({ ...node, m }, Math.abs(m - node.m), { trackId: node.trackId, fromM: node.m, toM: m });
    for (const junction of state.junctions) {
      if (!junction.ports.some((p) => p.trackId === node.trackId && Math.abs(p.distanceM - node.m) < EPS)) continue;
      for (const port of junction.ports) {
        if (port.trackId === node.trackId) continue;
        const turnout = state.turnouts.find((t) => t.junctionId === junction.id && [t.throughTrackId, t.divergingTrackId].includes(node.trackId) && [t.throughTrackId, t.divergingTrackId].includes(port.trackId));
        const threshold = Math.cos(turnout ? Math.atan(1 / 6) + Math.PI / 36 : Math.PI / 36);
        for (const dir of [1, -1]) {
          const nextList = cuts.get(port.trackId)!;
          if (nextList[nextList.indexOf(port.distanceM) + dir] === undefined) continue;
          const a = tangent(state, node.trackId, node.m, node.dir, !!turnout), b = tangent(state, port.trackId, port.distanceM, dir, !!turnout);
          if (a.x * b.x + a.y * b.y >= threshold) offer({ trackId: port.trackId, m: port.distanceM, dir }, 0.001);
        }
      }
    }
  }
  if (!reached) throw new Error("この向きでは到達できない。引上げ位置まで移動して反転するか、接続を確認する");
  const result: YardSpan[] = [];
  let cursor: string = reached;
  while (previous.has(cursor)) { const step: { from: string; span?: YardSpan } = previous.get(cursor)!; if (step.span) result.unshift(step.span); cursor = step.from; }
  return mergeSpans(result);
}
function mergeSpans(spans: YardSpan[]): YardSpan[] {
  const out: YardSpan[] = [];
  for (const s of spans) {
    if (spanLength(s) < 1e-8) continue;
    const last = out.at(-1);
    if (last && last.trackId === s.trackId && Math.abs(last.toM - s.fromM) < EPS && Math.sign(last.toM - last.fromM) === Math.sign(s.toM - s.fromM)) last.toM = s.toM;
    else out.push({ ...s });
  }
  return out;
}
/** 後端側を指定長で切る。車両列を分割・移動する際に同じ演算を使う。 */
function splitSpans(spans: YardSpan[], length: number): [YardSpan[], YardSpan[]] {
  const rear: YardSpan[] = [], front: YardSpan[] = [];
  for (const s of spans) {
    const len = spanLength(s);
    if (length >= len - 1e-8) { rear.push({ ...s }); length -= len; }
    else if (length <= 1e-8) front.push({ ...s });
    else { const m = s.fromM + Math.sign(s.toM - s.fromM) * length; rear.push({ ...s, toM: m }); front.push({ ...s, fromM: m }); length = 0; }
  }
  return [rear, front];
}
function overlaps(a: YardSpan, b: YardSpan, margin = 0): boolean {
  return a.trackId === b.trackId && Math.min(Math.max(a.fromM, a.toM), Math.max(b.fromM, b.toM)) - Math.max(Math.min(a.fromM, a.toM), Math.min(b.fromM, b.toM)) > -margin + EPS;
}
function conflict(state: MapState, cut: YardCut, path: YardSpan[], snapshot = state.yard!.cuts): string | undefined {
  for (const other of snapshot) {
    if (other.id === cut.id) continue;
    // 予約競合は配列順の優先権で解決する。後からの要求で先行要求も待つ相互待ちを避ける。
    const priority = snapshot.findIndex((c) => c.id === other.id) < snapshot.findIndex((c) => c.id === cut.id);
    const reserved = [...other.spans, ...(priority ? other.move?.spans ?? [] : [])];
    if (path.some((a) => reserved.some((b) => overlaps(a, b)))) return `${yardFormation(state, other).name}の占有・予約待ち`;
    // 異なる線路でも、同じ分岐の近傍を同時に使用させない。
    for (const j of state.junctions) {
      const near = (spans: YardSpan[]) => j.ports.some((p) => spans.some((s) => s.trackId === p.trackId && Math.min(s.fromM, s.toM) < p.distanceM + yardConfig.junctionClearanceM && Math.max(s.fromM, s.toM) > p.distanceM - yardConfig.junctionClearanceM));
      if (near(path) && near(reserved)) return `${j.id}: ${yardFormation(state, other).name}の分岐使用待ち`;
    }
  }
  return undefined;
}
function getCut(state: MapState, id: string): YardCut { const cut = state.yard?.cuts.find((c) => c.id === id); if (!cut) throw new Error(`車両列がない: ${id}`); return cut; }
function stopped(cut: YardCut): void { if (cut.move) throw new Error("移動を完了または取消してから操作する"); }
export function executeYardCommand(state: MapState, command: YardCommand, fromPlan = false): string {
  if (state.operatingTrains.some((t) => t.state !== "completed") || state.vehiclePlacements.length || Object.values(state.operationExecutions).some((e) => !["completed", "cancelled"].includes(e.status))) throw new Error("操車試験と既存fleetの運転・配置は同時に行えない");
  state.yard ??= { formatVersion: 2, cuts: [], plan: [], planLabels: [], planIndex: 0, automatic: false, roles: [] };
  const yard = state.yard;
  if (command.type === "yard.automatic") { yard.automatic = command.running; yard.error = undefined; return command.running ? "仕分計画を開始" : "仕分計画を中断"; }
  if (!fromPlan) yard.automatic = false;
  if (command.type === "yard.place") {
    const formation = yardFormation(state, { id: command.cutId });
    if (yard.cuts.some((c) => c.id === command.cutId) || !formation.vehicles.length) throw new Error("編成の重複配置または車両なし");
    if (state.fleet.trains.some((t) => t.formations.some((f) => f.formationId === formation.id)) || state.operatingTrains.some((t) => t.formationId === formation.id) || Object.values(state.vehicleDuties).some((d) => d.defaultFormationId === formation.id) || Object.values(state.operationExecutions).some((e) => e.formationId === formation.id)) throw new Error("列車・運用から参照中の編成を先に解除する");
    if (![1, -1].includes(command.direction) || !Number.isFinite(command.headM)) throw new Error("配置位置・方向が不正");
    const length = getFormationLengthM(state.fleet, formation).lengthM;
    const span = { trackId: command.trackId, fromM: command.headM - command.direction * length, toM: command.headM };
    if (Math.min(span.fromM, span.toM) < 0 || Math.max(span.fromM, span.toM) > trackLength(state, span.trackId)) throw new Error("線路長に収まらない");
    if (state.junctions.some((j) => j.ports.some((p) => p.trackId === span.trackId && p.distanceM > Math.min(span.fromM, span.toM) - yardConfig.junctionClearanceM && p.distanceM < Math.max(span.fromM, span.toM) + yardConfig.junctionClearanceM))) throw new Error("分岐付近へ初期配置できない");
    const cut: YardCut = { id: command.cutId, spans: [span] };
    const reason = conflict(state, cut, cut.spans); if (reason) throw new Error(reason);
    yard.cuts.push(cut); return "fleetの編成を線路上へ配置";
  }
  const cut = getCut(state, command.cutId);
  if (command.type === "yard.cancel") { cut.move = undefined; cut.waiting = undefined; yard.automatic = false; return "入換を停止"; }
  stopped(cut);
  if (command.type === "yard.reverse") {
    const formation = yardFormation(state, cut);
    formation.vehicles.reverse(); for (const vehicle of formation.vehicles) vehicle.orientation = vehicle.orientation === "forward" ? "reversed" : "forward";
    formation.warnings = formationWarnings(state.fleet, formation);
    cut.spans = cut.spans.reverse().map((s) => ({ ...s, fromM: s.toM, toM: s.fromM })); return "進行方向を反転";
  }
  if (command.type === "yard.split") {
    const formation = yardFormation(state, cut), vehicleIds = yardVehicleIds(state, cut);
    if (!Number.isInteger(command.rearCount) || command.rearCount < 1 || command.rearCount >= vehicleIds.length || state.fleet.formations.some((f) => f.id === command.newCutId)) throw new Error("解結位置または新しい編成IDが不正");
    const ids = vehicleIds.slice(0, command.rearCount), length = ids.reduce((n, id) => n + yardVehicle(state, id).lengthM, 0);
    const [rear, front] = splitSpans(cut.spans, length);
    const vehicles = formation.vehicles.splice(formation.vehicles.length - command.rearCount);
    const detached: Formation = { id: command.newCutId, name: "入換編成", vehicles, warnings: [] };
    state.fleet.formations.push(detached);
    detached.warnings = formationWarnings(state.fleet, detached);
    formation.warnings = formationWarnings(state.fleet, formation);
    formation.name = yardVehicleIds(state, cut).map((id) => yardVehicle(state, id)).some((v) => v.powered) ? "入換編成" : `${yardVehicle(state, vehicleIds.at(-1)!).destination} 出発待ち`;
    yard.cuts.push({ id: command.newCutId, spans: rear });
    cut.spans = front; return "同じfleet個体を線路上で解結";
  }
  if (command.type === "yard.couple") {
    const other = getCut(state, command.otherCutId); stopped(other);
    if (cut === other) throw new Error("同じ車両列は連結できない");
    const a = cut.spans.at(-1)!, b = other.spans[0];
    if (a.trackId !== b.trackId || Math.abs(a.toM - b.fromM) > 0.1 || Math.sign(a.toM - a.fromM) !== Math.sign(b.toM - b.fromM)) throw new Error("先端と相手の後端を同じ線路上で接触させ、向きを合わせる");
    const formation = yardFormation(state, cut), otherFormation = yardFormation(state, other);
    assertMechanicalConnection(state.fleet, formation.vehicles[0], "front", otherFormation.vehicles.at(-1)!, "rear");
    formation.vehicles = [...otherFormation.vehicles, ...formation.vehicles];
    formation.warnings = formationWarnings(state.fleet, formation);
    formation.name = "機関車＋貨車";
    state.fleet.formations = state.fleet.formations.filter((f) => f.id !== other.id);
    cut.spans = mergeSpans([...cut.spans, ...other.spans]); yard.cuts = yard.cuts.filter((c) => c !== other); return "同じfleet個体を線路上で連結";
  }
  if (!yardVehicleIds(state, cut).some((id) => yardVehicle(state, id).powered)) throw new Error("動力車がない。機関車を連結する必要がある");
  const speedKph = command.speedKph ?? yardConfig.defaultSpeedKph;
  if (!Number.isFinite(speedKph) || speedKph <= 0 || speedKph > yardConfig.maximumSpeedKph) throw new Error(`入換速度は0超${yardConfig.maximumSpeedKph} km/h以下`);
  const head = cut.spans.at(-1)!;
  const spans = findYardPath(state, { trackId: head.trackId, distanceM: head.toM, direction: Math.sign(head.toM - head.fromM) }, command);
  if (!spans.length) throw new Error("既に指定位置にいる");
  if (spans.some((a) => cut.spans.some((b) => overlaps(a, b)))) throw new Error("移動経路が自列の占有と重なる");
  if (command.couplingTarget) {
    const target = getCut(state, command.couplingTarget); stopped(target);
    const end = spans.at(-1)!, tail = target.spans[0];
    if (end.trackId !== tail.trackId || Math.abs(end.toM - tail.fromM) > 0.1 || Math.sign(end.toM - end.fromM) !== Math.sign(tail.toM - tail.fromM)) throw new Error("連結先の後端と一致しない");
  }
  cut.move = { spans, speedKph, couplingTarget: command.couplingTarget }; cut.waiting = undefined; return "入換経路を設定";
}

export function advanceYard(state: MapState, seconds: number): void {
  const yard = state.yard; if (!yard) return;
  if (yard.automatic && !yard.cuts.some((c) => c.move)) {
    try {
      // 同一tickで瞬間的に完了する反転・解結は処理し、次の移動で止まる。
      while (yard.planIndex < yard.plan.length && !yard.cuts.some((c) => c.move)) {
        executeYardCommand(state, yard.plan[yard.planIndex], true); yard.planIndex++;
      }
      if (yard.planIndex === yard.plan.length && !yard.cuts.some((c) => c.move)) yard.automatic = false;
    } catch (error) { yard.error = (error as Error).message; yard.automatic = false; }
  }
  // 同一tick中に先行列が到着しても予約を早期解放しない。
  const reservationSnapshot = structuredClone(yard.cuts);
  for (const cut of yard.cuts) {
    if (!cut.move) continue;
    const reason = conflict(state, cut, cut.move.spans, reservationSnapshot);
    if (reason) { cut.waiting = reason; continue; }
    cut.waiting = undefined;
    const distance = Math.min(seconds * cut.move.speedKph / 3.6, cut.move.spans.reduce((n, s) => n + spanLength(s), 0));
    const [travelled, remaining] = splitSpans(cut.move.spans, distance);
    const [, occupied] = splitSpans(mergeSpans([...cut.spans, ...travelled]), distance);
    cut.spans = occupied; cut.move.spans = remaining;
    if (!remaining.length) { cut.move = undefined; }
  }

}

export function validateYard(state: MapState): void {
  const yard = state.yard; if (!yard) return;
  if (yard.formatVersion !== 2) throw new Error("旧操車試験セーブは再生成が必要（npm run generate:bekasovo-operation）");
  if (state.vehiclePlacements?.length || state.operatingTrains?.some((t) => t.state !== "completed") || Object.values(state.operationExecutions ?? {}).some((e) => !["completed", "cancelled"].includes(e.status))) throw new Error("操車状態と既存fleetの運転・配置が競合");
  if (!Array.isArray(yard.cuts) || !Array.isArray(yard.plan) || !Array.isArray(yard.planLabels) || yard.planLabels.length !== yard.plan.length || yard.planLabels.some((s) => typeof s !== "string") || !Array.isArray(yard.roles) || !Number.isInteger(yard.planIndex) || yard.planIndex < 0 || yard.planIndex > yard.plan.length || typeof yard.automatic !== "boolean") throw new Error("操車状態が不正");
  const assigned = new Set<string>(), cuts = new Set<string>();
  const assertChain = (spans: YardSpan[]) => {
    for (let i = 1; i < spans.length; i++) {
      const a = spans[i - 1], b = spans[i];
      if (a.trackId === b.trackId) {
        if (Math.abs(a.toM - b.fromM) > EPS || Math.sign(a.toM - a.fromM) !== Math.sign(b.toM - b.fromM)) throw new Error("操車経路が不連続");
      } else {
        const junction = state.junctions.find((j) => j.ports.some((p) => p.trackId === a.trackId && Math.abs(p.distanceM - a.toM) < EPS) && j.ports.some((p) => p.trackId === b.trackId && Math.abs(p.distanceM - b.fromM) < EPS));
        if (!junction) throw new Error("操車経路の接続がない");
        const turnout = state.turnouts.some((t) => t.junctionId === junction.id && [t.throughTrackId, t.divergingTrackId].includes(a.trackId) && [t.throughTrackId, t.divergingTrackId].includes(b.trackId));
        const first = tangent(state, a.trackId, a.toM, Math.sign(a.toM - a.fromM), turnout), second = tangent(state, b.trackId, b.fromM, Math.sign(b.toM - b.fromM), turnout);
        if (first.x * second.x + first.y * second.y < Math.cos(turnout ? Math.atan(1 / 6) + Math.PI / 36 : Math.PI / 36)) throw new Error("操車経路の方向が不連続");
      }
    }
  };
  for (const cut of yard.cuts) {
    if (typeof cut.id !== "string" || !cut.id || cuts.has(cut.id) || !Array.isArray(cut.spans) || !cut.spans.length) throw new Error("操車車両列が不正"); cuts.add(cut.id);
    const vehicleIds = yardVehicleIds(state, cut);
    if (!vehicleIds.length) throw new Error("操車編成が空");
    for (const id of vehicleIds) { if (assigned.has(id)) throw new Error("操車車両の所属が不正"); assigned.add(id); const vehicle = yardVehicle(state, id); if (!Number.isFinite(vehicle.lengthM) || vehicle.lengthM <= 0) throw new Error("操車車両長が不正"); }
    for (const s of [...cut.spans, ...(cut.move?.spans ?? [])]) {
      if (!Number.isFinite(s.fromM) || !Number.isFinite(s.toM) || spanLength(s) < 1e-8 || Math.min(s.fromM, s.toM) < -EPS || Math.max(s.fromM, s.toM) > trackLength(state, s.trackId) + EPS) throw new Error("操車占有区間が不正");
    }
    if (Math.abs(cutLength(state, cut) - cut.spans.reduce((n, s) => n + spanLength(s), 0)) > 0.02) throw new Error("車両長と占有長が一致しない");
    if (cut.move && (!Number.isFinite(cut.move.speedKph) || cut.move.speedKph <= 0 || cut.move.speedKph > yardConfig.maximumSpeedKph || !cut.move.spans.length || !vehicleIds.some((id) => yardVehicle(state, id).powered))) throw new Error("操車移動が不正");
    assertChain([...cut.spans, ...(cut.move?.spans ?? [])]);
  }
  for (let i = 0; i < yard.cuts.length; i++) for (const other of yard.cuts.slice(i + 1)) if (yard.cuts[i].spans.some((a) => other.spans.some((b) => overlaps(a, b)))) throw new Error("操車車両の占有が重複");
  for (const role of yard.roles) if (typeof role.name !== "string" || !Number.isFinite(role.distanceM) || role.distanceM < 0 || role.distanceM > trackLength(state, role.trackId)) throw new Error("操車役割の位置が不正");
  for (const action of yard.plan) {
    if (!action || typeof action.cutId !== "string" || !["yard.move", "yard.reverse", "yard.split", "yard.couple"].includes(action.type)) throw new Error("操車計画が不正（試作専用の命令は試作ブランチで開く）");
    if (action.type === "yard.move" && (!Number.isFinite(action.distanceM) || action.distanceM < 0 || action.distanceM > trackLength(state, action.trackId) || (action.speedKph !== undefined && (!Number.isFinite(action.speedKph) || action.speedKph <= 0 || action.speedKph > yardConfig.maximumSpeedKph)))) throw new Error("操車計画の移動が不正");
    if (action.type === "yard.split" && (!Number.isInteger(action.rearCount) || action.rearCount < 1 || typeof action.newCutId !== "string")) throw new Error("操車計画の解結が不正");
    if (action.type === "yard.couple" && typeof action.otherCutId !== "string") throw new Error("操車計画の連結が不正");
  }
}
