import { analyzeLine, sampleTrack, getTrackPortTangent, TURNOUT_TANGENT_BASELINE_M } from "./geometry";
import type { MapState, Point } from "./model";
export interface DirectedPathSpan { trackId: string; fromM: number; toM: number }
const EPS = 0.01;
const spanLength = (span: DirectedPathSpan) => Math.abs(span.toM - span.fromM);
function trackLength(state: MapState, id: string): number {
  const track = state.tracks.find((t) => t.id === id);
  if (!track) throw new Error(`線路がない: ${id}`);
  return analyzeLine(sampleTrack(track)).lengthM;
}

export function directedTrackTangent(state: MapState, id: string, m: number, dir: number, turnout = false): Point {
  const length = trackLength(state, id);
  const track = state.tracks.find((t) => t.id === id)!;
  const tangent = getTrackPortTangent(track, m <= EPS ? "start" : m >= length - EPS ? "end" : "interior", m, turnout ? TURNOUT_TANGENT_BASELINE_M : 0);
  return { x: tangent.x * dir, y: tangent.y * dir };
}

/** 探索の向きを状態に含め、暗黙の折返しや分岐の鋭角な渡りを防ぐ。 */
export function findYardPath(state: MapState, start: { trackId: string; distanceM: number; direction: number }, target: { trackId: string; distanceM: number }): DirectedPathSpan[] {
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
  const previous = new Map<string, { from: string; span?: DirectedPathSpan }>();
  let reached: string | undefined;
  while (pending.size) {
    const currentKey = [...pending.keys()].reduce((a, b) => costs.get(a)! < costs.get(b)! ? a : b);
    const node = pending.get(currentKey)!; pending.delete(currentKey);
    if (node.trackId === target.trackId && Math.abs(node.m - target.distanceM) < EPS) { reached = currentKey; break; }
    const offer = (next: Node, cost: number, span?: DirectedPathSpan) => {
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
          const a = directedTrackTangent(state, node.trackId, node.m, node.dir, !!turnout), b = directedTrackTangent(state, port.trackId, port.distanceM, dir, !!turnout);
          if (a.x * b.x + a.y * b.y >= threshold) offer({ trackId: port.trackId, m: port.distanceM, dir }, 0.001);
        }
      }
    }
  }
  if (!reached) throw new Error("この向きでは到達できない。引上げ位置まで移動して反転するか、接続を確認する");
  const result: DirectedPathSpan[] = [];
  let cursor: string = reached;
  while (previous.has(cursor)) { const step: { from: string; span?: DirectedPathSpan } = previous.get(cursor)!; if (step.span) result.unshift(step.span); cursor = step.from; }
  return mergeSpans(result);
}
export function mergeSpans(spans: DirectedPathSpan[]): DirectedPathSpan[] {
  const out: DirectedPathSpan[] = [];
  for (const s of spans) {
    if (spanLength(s) < 1e-8) continue;
    const last = out.at(-1);
    if (last && last.trackId === s.trackId && Math.abs(last.toM - s.fromM) < EPS && Math.sign(last.toM - last.fromM) === Math.sign(s.toM - s.fromM)) last.toM = s.toM;
    else out.push({ ...s });
  }
  return out;
}
