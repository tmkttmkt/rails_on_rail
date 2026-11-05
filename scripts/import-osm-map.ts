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
const stationsPath = process.argv[5];
if (!inputPath) {
  console.error("使い方: vite-node scripts/import-osm-map.ts <overpass.json> [出力先] [セーブ名] [駅のoverpass.json]");
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
const STATION_MAX_DISTANCE_M = 150;  // 駅ノードからこの距離内の線路へ設置する
const STATION_HALF_LENGTH_M = 90;    // 駅範囲の片側長
const STATION_DUPLICATE_M = 300;     // 同名駅がこの距離内にあれば同一とみなす
// 別名の駅がこの距離内にある場合は、線路に近い方だけを残す。
// 他社の隣接駅（乗換駅）が、地図に無い自社線の代わりに本線へ付くのを防ぐ。
const STATION_MIN_SEPARATION_M = 250;

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
interface Route { id: number; nodes: number[]; edgeIds: number[] }
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
  const route: Route = { id: routes.length, nodes, edgeIds: chain.map((c) => c.edge.id) };
  routes.push(route);
  for (const { edge } of chain) routeOfEdge.set(edge.id, route.id);
}

const keyNodeCount = [...incidence.keys()].filter(isKeyNode).length;
const branchNodeCount = [...divergingAt.values()].filter((list) => list.length > 0).length;
console.log(`OSM: way=${osmWays.length} node=${osmNodes.size}`);
console.log(`分解: 辺=${edges.length} 通し経路=${routes.length} キーノード=${keyNodeCount} 分岐を持つ節点=${branchNodeCount}`);

// ---- 線形の組み立て -----------------------------------------------------
// 辺ごとに簡略化して連結する。キーノード（分岐・終端）は辺の境界なので
// 必ず頂点として残り、接続の転記で位置がずれない。
function routePolyline(route: Route): Point[] {
  const points: Point[] = [];
  let cursor = 0;
  for (const nodeId of route.nodes) void nodeId;
  // route.nodes を辺の境界で切り分ける
  for (const edgeId of route.edgeIds) {
    const edge = edges[edgeId];
    const span = edge.nodes.length;
    const slice = route.nodes.slice(cursor, cursor + span);
    cursor += span - 1;
    const simplified = simplify(slice.map(project), SIMPLIFY_TOLERANCE_M);
    for (const point of simplified) {
      const last = points[points.length - 1];
      if (!last || Math.hypot(point.x - last.x, point.y - last.y) > 0.01) points.push(point);
    }
  }
  return points;
}

function polylineLength(points: Point[]): number {
  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    total += Math.hypot(points[index + 1].x - points[index].x, points[index + 1].y - points[index].y);
  }
  return total;
}

let state: MapState = createInitialState();
const run = (command: MapCommand): void => { state = executeCommand(state, command).state; };
const stats = {
  tracks: 0, trackFailed: 0, implausible: 0,
  joints: 0, turnouts: 0, jointFailed: 0, turnoutFailed: 0, passingSkipped: 0,
};

// ---- Phase 1: 幾何だけを全線敷設する（接続は付けない） -----------------
const trackIdOfRoute = new Map<number, string>();
for (const route of routes) {
  const points = routePolyline(route);
  if (points.length < 2) { stats.trackFailed += 1; continue; }
  const id = `track-${state.nextTrackId}`;
  try {
    run({ type: "track.create", geometry: "straight", points, specification: SPECIFICATION, designSpeedKmh: DEFAULT_SPEED_KMH });
  } catch {
    stats.trackFailed += 1;
    continue;
  }
  const created = state.tracks.find((item) => item.id === id);
  const radius = created?.engineering.builtMinimumRadiusM ?? null;
  if (created && radius !== null && radius < MIN_PLAUSIBLE_RADIUS_M) {
    try { run({ type: "track.delete", trackId: id }); } catch { /* noop */ }
    stats.implausible += 1;
    continue;
  }
  trackIdOfRoute.set(route.id, id);
  stats.tracks += 1;
}
console.log(`Phase 1 敷設: 線路=${stats.tracks} 失敗=${stats.trackFailed} 半径不足で撤去=${stats.implausible}`);

// ---- Phase 2: 共有ノードごとに接続を転記する ---------------------------
// OSM側は共有ノードで接続を持っているので、復元ではなく転記である。
const routesAtNode = new Map<number, number[]>();
for (const route of routes) {
  for (const nodeId of route.nodes) {
    if (!isKeyNode(nodeId)) continue;
    if (!routesAtNode.has(nodeId)) routesAtNode.set(nodeId, []);
    const list = routesAtNode.get(nodeId)!;
    if (!list.includes(route.id)) list.push(route.id);
  }
}

const isEndpointOf = (route: Route, nodeId: number): boolean =>
  route.nodes[0] === nodeId || route.nodes[route.nodes.length - 1] === nodeId;

for (const [nodeId, routeIds] of routesAtNode) {
  const present = routeIds.filter((id) => trackIdOfRoute.has(id));
  if (present.length < 2) continue;
  const position = project(nodeId);

  // 途中を通る経路があればそれを基準線にする。無ければ最初の経路を基準にする。
  const passing = present.filter((id) => !isEndpointOf(routes[id], nodeId));
  const baseRouteId = passing[0] ?? present[0];
  const baseTrackId = trackIdOfRoute.get(baseRouteId)!;

  for (const otherId of present) {
    if (otherId === baseRouteId) continue;
    if (!isEndpointOf(routes[otherId], nodeId)) { stats.passingSkipped += 1; continue; }
    const otherTrackId = trackIdOfRoute.get(otherId)!;

    // 基準線もここで終わっているなら継目を試す。駄目なら転てつ器の新設。
    if (isEndpointOf(routes[baseRouteId], nodeId)) {
      try {
        run({ type: "track.connect", trackId: baseTrackId, otherTrackId, position });
        stats.joints += 1;
        continue;
      } catch { /* 継目にならなければ転てつ器へ */ }
    }
    try {
      run({ type: "turnout.attach", trackId: baseTrackId, divergingTrackId: otherTrackId, position });
      stats.turnouts += 1;
    } catch {
      if (isEndpointOf(routes[baseRouteId], nodeId)) stats.jointFailed += 1;
      else stats.turnoutFailed += 1;
    }
  }
}
console.log(`Phase 2 転記: 継目=${stats.joints} 転てつ器=${stats.turnouts} 継目失敗=${stats.jointFailed} 転てつ器失敗=${stats.turnoutFailed} 途中どうしで未接続=${stats.passingSkipped}`);

// ---- Phase 3: 駅を設置する ---------------------------------------------
// OSMの駅ノードを、最寄りの線路へ範囲付きで設置する。
// 線路は1つの線路群にしか属せないため多番線へはまたげない。
// 本線へ付けるよう、距離内で最も長い線路を選ぶ。
interface StationNode { lat: number; lon: number; name: string; operator: string }
const stationNodes: StationNode[] = [];
if (stationsPath) {
  const raw = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), stationsPath), "utf8")) as { elements: any[] };
  for (const element of raw.elements) {
    const name = element?.tags?.name;
    if (element.type !== "node" || typeof name !== "string" || typeof element.lat !== "number") continue;
    stationNodes.push({ lat: element.lat, lon: element.lon, name, operator: element.tags.operator ?? "" });
  }
}

function projectLatLon(lat: number, lon: number): Point {
  return { x: (lon - lon0) * M_PER_DEG_LON, y: -(lat - lat0) * M_PER_DEG_LAT };
}

function nearestOnTrack(points: Point[], target: Point): { distance: number; alongM: number } {
  let best = { distance: Infinity, alongM: 0 };
  let traversed = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segment = Math.hypot(dx, dy);
    const t = segment <= 0 ? 0 : Math.max(0, Math.min(1, ((target.x - a.x) * dx + (target.y - a.y) * dy) / (segment * segment)));
    const px = a.x + dx * t;
    const py = a.y + dy * t;
    const distance = Math.hypot(target.x - px, target.y - py);
    if (distance < best.distance) best = { distance, alongM: traversed + segment * t };
    traversed += segment;
  }
  return best;
}

function pointAlong(points: Point[], alongM: number): Point {
  let traversed = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const segment = Math.hypot(points[index + 1].x - points[index].x, points[index + 1].y - points[index].y);
    if (traversed + segment >= alongM) {
      const t = segment <= 0 ? 0 : (alongM - traversed) / segment;
      return {
        x: points[index].x + (points[index + 1].x - points[index].x) * t,
        y: points[index].y + (points[index + 1].y - points[index].y) * t,
      };
    }
    traversed += segment;
  }
  return points[points.length - 1];
}

const stationStats = { placed: 0, tooFar: 0, duplicate: 0, crowded: 0, failed: 0 };
const placedStations: { name: string; point: Point }[] = [];

// 線路に近い順に並べ、近い駅から確定させる。
// 乗換駅では自社線に乗っている方が近くなるため、正しい側が残る。
interface StationCandidate { node: StationNode; target: Point; distance: number; trackId: string; points: Point[]; alongM: number; lengthM: number }
const candidates: StationCandidate[] = [];
for (const node of stationNodes) {
  const target = projectLatLon(node.lat, node.lon);
  let chosen: StationCandidate | undefined;
  for (const track of state.tracks) {
    const hit = nearestOnTrack(track.points, target);
    if (hit.distance > STATION_MAX_DISTANCE_M) continue;
    const lengthM = polylineLength(track.points);
    // 同程度の近さなら長い線路（本線）を優先する
    if (!chosen || hit.distance < chosen.distance - 5 || (Math.abs(hit.distance - chosen.distance) <= 5 && lengthM > chosen.lengthM)) {
      chosen = { node, target, distance: hit.distance, trackId: track.id, points: track.points, alongM: hit.alongM, lengthM };
    }
  }
  if (chosen) candidates.push(chosen); else stationStats.tooFar += 1;
}
candidates.sort((a, b) => a.distance - b.distance);

for (const candidate of candidates) {
  const { node, target } = candidate;
  if (placedStations.some((s) => s.name === node.name && Math.hypot(s.point.x - target.x, s.point.y - target.y) < STATION_DUPLICATE_M)) {
    stationStats.duplicate += 1;
    continue;
  }
  if (placedStations.some((s) => Math.hypot(s.point.x - target.x, s.point.y - target.y) < STATION_MIN_SEPARATION_M)) {
    stationStats.crowded += 1;
    continue;
  }
  const total = candidate.lengthM;
  const startAlong = Math.max(0, Math.min(total - 2, candidate.alongM - STATION_HALF_LENGTH_M));
  const endAlong = Math.min(total, Math.max(startAlong + 2, candidate.alongM + STATION_HALF_LENGTH_M));
  try {
    run({
      type: "station.createRange",
      name: node.name,
      trackId: candidate.trackId,
      startPosition: pointAlong(candidate.points, startAlong),
      endPosition: pointAlong(candidate.points, endAlong),
      includeTrackGroup: false,
    });
    placedStations.push({ name: node.name, point: target });
    stationStats.placed += 1;
  } catch {
    stationStats.failed += 1;
  }
}
if (stationsPath) {
  console.log(`Phase 3 駅: 設置=${stationStats.placed} 線路から遠い=${stationStats.tooFar} 同名重複=${stationStats.duplicate} 近接で除外=${stationStats.crowded} 失敗=${stationStats.failed}`);
}

// ---- 結果 ---------------------------------------------------------------
const inspection = inspectTrackRadii(state);
const topology = inspection.topology;
console.log(`接続成分=${topology.connectedComponents.length} 孤立線路=${topology.isolatedTrackIds.length} 未接続端=${topology.unconnectedEndpoints.length} 接続漏れ候補=${topology.nearMisses.length} 不正接続=${topology.invalidConnections.length}`);
const radii = state.tracks.map((t) => t.engineering.builtMinimumRadiusM).filter((v): v is number => typeof v === "number").sort((a, b) => a - b);
const percentile = (p: number): number => radii[Math.min(radii.length - 1, Math.floor(radii.length * p))];
console.log(`曲線半径: 最小=${radii[0]?.toFixed(1)} 5%=${percentile(0.05).toFixed(1)} 中央=${percentile(0.5).toFixed(0)} m / 50 m未満=${radii.filter((v) => v < 50).length}本`);
if (topology.connectedComponents.length > 1) {
  const sizes = topology.connectedComponents.map((c) => c.length).sort((a, b) => b - a);
  console.log(`成分サイズ上位: ${sizes.slice(0, 8).join(", ")}`);
}
void trackCatalog;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, serializeSaveFile(createSaveFile(saveName, state)), "utf8");
parseSaveFile(fs.readFileSync(outputPath, "utf8"));
console.log(`保存: ${outputPath}`);
console.log("出典: (c) OpenStreetMap contributors / ODbL");
