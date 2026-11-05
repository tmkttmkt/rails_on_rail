import fs from "node:fs";
import path from "node:path";
import { executeCommand, type MapCommand } from "../src/simulation/commands";
import { createInitialState, type MapState, type Point } from "../src/simulation/model";
import { inspectTrackRadii } from "../src/simulation/inspection";
import { createSaveFile, parseSaveFile, serializeSaveFile } from "../src/simulation/persistence";
import { trackCatalog } from "../src/data/trackCatalog";

// OpenStreetMapの鉄道データ（Overpass APIの応答JSON）からマップを生成する。
// 取得手順は docs/tasks/2026-11-05_import-osm-railway-data.md を参照する。
// 出典表示: (c) OpenStreetMap contributors / ODbL
// 生成物はODbLの継承義務を負うため、リポジトリへコミットしない（.gitignore 参照）。

const inputPath = process.argv[2];
const outputPath = path.resolve(process.cwd(), process.argv[3] ?? "saves/osm-import.json");
const saveName = process.argv[4] ?? "OSM取り込みマップ";
if (!inputPath) {
  console.error("使い方: vite-node scripts/import-osm-map.ts <overpass.json> [出力先] [セーブ名]");
  process.exit(1);
}

const SPECIFICATION = {
  gaugeId: "gauge-1435mm",
  railProfileId: "en-60e1",
  supportSystemId: "pc-sleeper-ballast",
  roadbedId: "standard-drained-roadbed",
};
const DEFAULT_SPEED_KMH = 80;
const THROUGH_PAIR_MAX_DEVIATION_DEG = 40; // これを超える組は直進とみなさない
// OSMの点列はデジタイズ由来の揺れを含む。円弧チェーンへ当てはめると
// 接線が累積して発振し、曲率が破綻する（実測で最小半径39.7 m -> 7.1 m）。
// 測位精度より十分小さい許容で簡略化し、ポリラインのまま敷設する。
const SIMPLIFY_TOLERANCE_M = 2;
// 円弧当てはめは始端接線と弦の向きが食い違うと巨大な円弧を生成し、
// 線路が元の範囲から大きく外れる。生成後に妥当性を検査して破棄する。
const MAX_LENGTH_RATIO = 1.3;        // 生成線形長 / 入力ポリライン長 の上限
const MIN_PLAUSIBLE_RADIUS_M = 40;   // これ未満の半径は破綻とみなす

// ---- 入力 ---------------------------------------------------------------
interface OsmNode { type: "node"; id: number; lat: number; lon: number }
interface OsmWay { type: "way"; id: number; nodes: number[]; tags?: Record<string, string> }
const document = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), inputPath), "utf8")) as { elements: (OsmNode | OsmWay)[] };
const osmNodes = new Map<number, OsmNode>();
const osmWays: OsmWay[] = [];
for (const element of document.elements) {
  if (element.type === "node") osmNodes.set(element.id, element);
  else if (element.type === "way") osmWays.push(element);
}

// ---- 投影: 範囲中心の緯度における正距円筒近似 ---------------------------
let latSum = 0;
let lonSum = 0;
for (const node of osmNodes.values()) { latSum += node.lat; lonSum += node.lon; }
const lat0 = latSum / Math.max(1, osmNodes.size);
const lon0 = lonSum / Math.max(1, osmNodes.size);
const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LON = 111320 * Math.cos((lat0 * Math.PI) / 180);
const project = (id: number): Point => {
  const node = osmNodes.get(id)!;
  return { x: (node.lon - lon0) * M_PER_DEG_LON, y: -(node.lat - lat0) * M_PER_DEG_LAT };
};

// ---- ポリラインの簡略化（Douglas-Peucker） -----------------------------
function simplify(points: Point[], toleranceM: number): Point[] {
  if (points.length < 3) return points;
  const first = points[0];
  const last = points[points.length - 1];
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const length = Math.hypot(dx, dy) || 1;
  let maxDistance = 0;
  let farthest = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = Math.abs(dx * (points[index].y - first.y) - dy * (points[index].x - first.x)) / length;
    if (distance > maxDistance) { maxDistance = distance; farthest = index; }
  }
  if (maxDistance <= toleranceM) return [first, last];
  return [
    ...simplify(points.slice(0, farthest + 1), toleranceM).slice(0, -1),
    ...simplify(points.slice(farthest), toleranceM),
  ];
}

// ---- ノード接続数 -------------------------------------------------------
// 端点は1、途中ノードは2として数える。2以外をキーノード（分岐・終端）とする。
const incidence = new Map<number, number>();
const wayNodes = osmWays.map((way) => way.nodes.filter((id) => osmNodes.has(id)));
for (const nodes of wayNodes) {
  nodes.forEach((id, index) => {
    incidence.set(id, (incidence.get(id) ?? 0) + (index === 0 || index === nodes.length - 1 ? 1 : 2));
  });
}
const isKeyNode = (id: number): boolean => (incidence.get(id) ?? 0) !== 2;

// ---- 辺（キーノード間のポリライン）へ分解 -------------------------------
interface Edge { id: number; from: number; to: number; nodes: number[] }
const edges: Edge[] = [];
for (const nodes of wayNodes) {
  let start = 0;
  for (let index = 1; index < nodes.length; index += 1) {
    if (isKeyNode(nodes[index]) || index === nodes.length - 1) {
      const slice = nodes.slice(start, index + 1);
      if (slice.length >= 2) edges.push({ id: edges.length, from: slice[0], to: slice[slice.length - 1], nodes: slice });
      start = index;
    }
  }
}

const edgesAtNode = new Map<number, number[]>();
for (const edge of edges) {
  for (const endpoint of [edge.from, edge.to]) {
    if (!edgesAtNode.has(endpoint)) edgesAtNode.set(endpoint, []);
    edgesAtNode.get(endpoint)!.push(edge.id);
  }
}

// 節点から見た辺の向き（節点から離れる方向）
function edgeDirectionAt(edge: Edge, nodeId: number): number {
  const forward = edge.from === nodeId;
  const a = project(nodeId);
  const b = project(forward ? edge.nodes[1] : edge.nodes[edge.nodes.length - 2]);
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function collinearDeviationDeg(first: number, second: number): number {
  let diff = Math.abs(first - second) % (2 * Math.PI);
  if (diff > Math.PI) diff = 2 * Math.PI - diff;
  return Math.abs(180 - (diff * 180) / Math.PI);
}

// ---- 節点ごとに直進対を決める -------------------------------------------
// 最も直線に近い一対を直進とみなし、残りを分岐側として扱う。
const throughPartner = new Map<string, number>(); // `${nodeId}:${edgeId}` -> 相手辺ID
const divergingAt = new Map<number, number[]>();  // nodeId -> 分岐側の辺ID
for (const [nodeId, list] of edgesAtNode) {
  const unique = [...new Set(list)];
  if (unique.length < 2) continue;
  let best: { a: number; b: number; deviation: number } | undefined;
  for (let i = 0; i < unique.length; i += 1) {
    for (let j = i + 1; j < unique.length; j += 1) {
      const deviation = collinearDeviationDeg(edgeDirectionAt(edges[unique[i]], nodeId), edgeDirectionAt(edges[unique[j]], nodeId));
      if (!best || deviation < best.deviation) best = { a: unique[i], b: unique[j], deviation };
    }
  }
  if (best && best.deviation <= THROUGH_PAIR_MAX_DEVIATION_DEG) {
    throughPartner.set(`${nodeId}:${best.a}`, best.b);
    throughPartner.set(`${nodeId}:${best.b}`, best.a);
    divergingAt.set(nodeId, unique.filter((id) => id !== best!.a && id !== best!.b));
  } else {
    divergingAt.set(nodeId, unique.slice(1));
  }
}

// ---- 辺を直進で連鎖させ「通し経路」にまとめる ---------------------------
interface Route { id: number; nodes: number[] }
const routeOfEdge = new Map<number, number>();
const routes: Route[] = [];
for (const seed of edges) {
  if (routeOfEdge.has(seed.id)) continue;
  const chain: { edge: Edge; forward: boolean }[] = [];
  const visited = new Set<number>();

  let forwardStep: { edge: Edge; entry: number } | undefined = { edge: seed, entry: seed.from };
  while (forwardStep && !visited.has(forwardStep.edge.id)) {
    visited.add(forwardStep.edge.id);
    const forward: boolean = forwardStep.entry === forwardStep.edge.from;
    chain.push({ edge: forwardStep.edge, forward });
    const exit: number = forward ? forwardStep.edge.to : forwardStep.edge.from;
    const partner = throughPartner.get(`${exit}:${forwardStep.edge.id}`);
    forwardStep = partner !== undefined && !visited.has(partner) ? { edge: edges[partner], entry: exit } : undefined;
  }

  const head = chain[0];
  let backEntry = head.forward ? head.edge.from : head.edge.to;
  let backPartner = throughPartner.get(`${backEntry}:${head.edge.id}`);
  while (backPartner !== undefined && !visited.has(backPartner)) {
    visited.add(backPartner);
    const edge = edges[backPartner];
    const forward = edge.to === backEntry;
    chain.unshift({ edge, forward });
    backEntry = forward ? edge.from : edge.to;
    backPartner = throughPartner.get(`${backEntry}:${edge.id}`);
  }

  const nodes: number[] = [];
  for (const { edge, forward } of chain) {
    const sequence = forward ? edge.nodes : [...edge.nodes].reverse();
    for (const id of sequence) if (nodes[nodes.length - 1] !== id) nodes.push(id);
  }
  const route: Route = { id: routes.length, nodes };
  routes.push(route);
  for (const { edge } of chain) routeOfEdge.set(edge.id, route.id);
}

const keyNodeCount = [...incidence.keys()].filter(isKeyNode).length;
const branchNodeCount = [...divergingAt.values()].filter((list) => list.length > 0).length;
console.log(`OSM: way=${osmWays.length} node=${osmNodes.size}`);
console.log(`分解: 辺=${edges.length} 通し経路=${routes.length} キーノード=${keyNodeCount} 分岐を持つ節点=${branchNodeCount}`);

// ---- 転てつ器形式の選定 -------------------------------------------------
// デジタイズされた発散角に最も近い番数を選ぶ。
const turnoutTypes = [...trackCatalog.turnoutTypes].sort((a, b) => a.frogNumber - b.frogNumber);
function chooseTurnoutType(divergenceDeg: number): string {
  let best = turnoutTypes[0];
  let bestGap = Infinity;
  for (const type of turnoutTypes) {
    const typeAngle = (Math.atan(1 / type.frogNumber) * 180) / Math.PI;
    const gap = Math.abs(typeAngle - divergenceDeg);
    if (gap < bestGap) { bestGap = gap; best = type; }
  }
  return best.id;
}

// ---- 線路の構築 ---------------------------------------------------------
let state: MapState = createInitialState();
const run = (command: MapCommand): void => { state = executeCommand(state, command).state; };

const trackIdOfRoute = new Map<number, string>();
const placedRoutes = new Set<number>();
const stats = { tracks: 0, turnouts: 0, turnoutFailed: 0, routeFailed: 0, cycleSkipped: 0, curveFallback: 0, implausible: 0, attachGaveUp: 0 };

function routePoints(route: Route, dropFrom: Point | undefined, dropRadiusM: number): Point[] {
  const points = route.nodes.map(project);
  if (!dropFrom) return points;
  let index = 0;
  while (index < points.length - 1 && Math.hypot(points[index].x - dropFrom.x, points[index].y - dropFrom.y) < dropRadiusM) index += 1;
  return points.slice(index);
}

function polylineLength(points: Point[]): number {
  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    total += Math.hypot(points[index + 1].x - points[index].x, points[index + 1].y - points[index].y);
  }
  return total;
}

// 生成された線形が入力ポリラインから大きく外れていないか検査する。
function isPlausible(trackId: string, inputLengthM: number): boolean {
  const track = state.tracks.find((item) => item.id === trackId);
  if (!track) return false;
  if (polylineLength(track.points) > inputLengthM * MAX_LENGTH_RATIO + 1) return false;
  const radius = track.engineering.builtMinimumRadiusM;
  return radius === null || radius >= MIN_PLAUSIBLE_RADIUS_M;
}

function tryCreate(points: Point[], geometry: "straight" | "curve", attachTrackId: string | undefined): string | undefined {
  const id = `track-${state.nextTrackId}`;
  try {
    run({
      type: "track.create",
      geometry,
      points,
      specification: SPECIFICATION,
      designSpeedKmh: DEFAULT_SPEED_KMH,
      ...(attachTrackId ? { startConnectionTrackId: attachTrackId } : {}),
    });
  } catch {
    return undefined;
  }
  if (isPlausible(id, polylineLength(points))) return id;
  // 破綻した線形は残さず撤去する
  try { run({ type: "track.delete", trackId: id }); } catch { /* 撤去できなければそのまま */ }
  stats.implausible += 1;
  return undefined;
}

function createRouteTrack(route: Route, attachTrackId: string | undefined, startPoint: Point | undefined, reversed: boolean): boolean {
  const ordered = reversed ? { ...route, nodes: [...route.nodes].reverse() } : route;
  const tail = routePoints(ordered, startPoint, 1);
  const raw = startPoint ? [startPoint, ...tail.filter((p) => Math.hypot(p.x - startPoint.x, p.y - startPoint.y) > 1)] : tail;
  const points = simplify(raw, SIMPLIFY_TOLERANCE_M);
  if (points.length < 2) return false;

  // 1) ポリラインをそのまま残す straight で取り付ける
  // 2) 駄目なら curve（接線を自動採用）。ただし妥当性検査を通る場合のみ
  // 3) それも駄目なら接続せずに敷設する。形を壊すより接続を諦める
  let id = attachTrackId ? tryCreate(points, "straight", attachTrackId) : undefined;
  if (!id && attachTrackId) {
    id = tryCreate(points, "curve", attachTrackId);
    if (id) stats.curveFallback += 1;
  }
  if (!id) {
    id = tryCreate(points, "straight", undefined);
    if (id && attachTrackId) stats.attachGaveUp += 1;
  }
  if (!id) return false;

  trackIdOfRoute.set(route.id, id);
  placedRoutes.add(route.id);
  stats.tracks += 1;
  return true;
}

// 経路の端ノード集合（分岐を探すため）
const routesByNode = new Map<number, number[]>();
for (const route of routes) {
  for (const nodeId of route.nodes) {
    if (!isKeyNode(nodeId)) continue;
    if (!routesByNode.has(nodeId)) routesByNode.set(nodeId, []);
    if (!routesByNode.get(nodeId)!.includes(route.id)) routesByNode.get(nodeId)!.push(route.id);
  }
}

// 幅優先で、置いた経路の上の分岐ノードから次の経路を生やす
const queue: number[] = [];
const seedOrder = [...routes].sort((a, b) => b.nodes.length - a.nodes.length);
for (const seed of seedOrder) {
  if (placedRoutes.has(seed.id)) continue;
  if (!createRouteTrack(seed, undefined, undefined, false)) { stats.routeFailed += 1; continue; }
  queue.push(seed.id);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const current = routes[currentId];
    const baseTrackId = trackIdOfRoute.get(currentId)!;

    for (const nodeId of current.nodes) {
      const diverging = divergingAt.get(nodeId);
      if (!diverging || diverging.length === 0) continue;
      const nodePoint = project(nodeId);

      for (const edgeId of diverging) {
        const targetRouteId = routeOfEdge.get(edgeId);
        if (targetRouteId === undefined || targetRouteId === currentId) continue;
        if (placedRoutes.has(targetRouteId)) { stats.cycleSkipped += 1; continue; }
        const target = routes[targetRouteId];
        const reversed = target.nodes[0] !== nodeId;
        if (reversed && target.nodes[target.nodes.length - 1] !== nodeId) continue;

        // 分岐の向きと鋭さを測り、転てつ器を置く
        const baseDirection = edgeDirectionAt(edges[edgeId], nodeId);
        const partnerEdges = (edgesAtNode.get(nodeId) ?? []).filter((id) => id !== edgeId);
        if (partnerEdges.length === 0) continue;
        const throughDirection = edgeDirectionAt(edges[partnerEdges[0]], nodeId);
        const divergenceDeg = Math.min(...partnerEdges.map((id) => collinearDeviationDeg(baseDirection, edgeDirectionAt(edges[id], nodeId))));
        const cross = Math.sin(baseDirection - throughDirection);
        const side = cross >= 0 ? "right" : "left";
        const typeId = chooseTurnoutType(divergenceDeg);

        const stubId = `track-${state.nextTrackId}`;
        try {
          run({ type: "turnout.create", trackId: baseTrackId, position: nodePoint, typeId, side, divergingLengthM: 0 });
          stats.turnouts += 1;
        } catch {
          stats.turnoutFailed += 1;
          continue;
        }
        const stub = state.tracks.find((item) => item.id === stubId)!;
        const stubEnd = stub.points[stub.points.length - 1];
        if (createRouteTrack(target, stubId, stubEnd, reversed)) queue.push(targetRouteId);
        else stats.routeFailed += 1;
      }
    }
  }
}

// ---- 結果 ---------------------------------------------------------------
console.log(`構築: 線路=${stats.tracks} 転てつ器=${stats.turnouts} 転てつ器失敗=${stats.turnoutFailed} 経路失敗=${stats.routeFailed}`);
console.log(`取り付け: curve退避=${stats.curveFallback} 破綻で撤去=${stats.implausible} 接続断念=${stats.attachGaveUp} 閉路のため未接続=${stats.cycleSkipped}`);
const topology = inspectTrackRadii(state).topology;
console.log(`接続成分=${topology.connectedComponents.length} 孤立線路=${topology.isolatedTrackIds.length} 不正接続=${topology.invalidConnections.length}`);
const radii = state.tracks.map((t) => t.engineering.builtMinimumRadiusM).filter((v): v is number => typeof v === "number").sort((a, b) => a - b);
const percentile = (p: number): number => radii[Math.min(radii.length - 1, Math.floor(radii.length * p))];
console.log(`曲線半径: 最小=${radii[0]?.toFixed(1)} 5%=${percentile(0.05).toFixed(1)} 25%=${percentile(0.25).toFixed(0)} 中央=${percentile(0.5).toFixed(0)} m / 50 m未満=${radii.filter((v) => v < 50).length}本`);
if (topology.connectedComponents.length > 1) {
  const sizes = topology.connectedComponents.map((c) => c.length).sort((a, b) => b - a);
  console.log(`成分サイズ上位: ${sizes.slice(0, 8).join(", ")}`);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, serializeSaveFile(createSaveFile(saveName, state)), "utf8");
parseSaveFile(fs.readFileSync(outputPath, "utf8"));
console.log(`保存: ${outputPath}`);
console.log("出典: (c) OpenStreetMap contributors / ODbL");
