import fs from "node:fs";
import path from "node:path";
import { executeCommand, type MapCommand } from "../src/simulation/commands";
import { createInitialState, type Point } from "../src/simulation/model";
import { createSaveFile, parseSaveFile, serializeSaveFile } from "../src/simulation/persistence";
import { inspectTrackRadii } from "../src/simulation/inspection";

// ベカソヴォ操車場（Бекасово-Сортировочное、モスクワ大環状線）を模した
// ハンプ式操車場マップを生成する。
// 受入線群 → ハンプ → 仕分線群（4束×8本） → 出発線群 → 引上線 を、
// すべて接線適合な分岐で接続する。

const outputPath = path.resolve(process.cwd(), process.argv[2] ?? "saves/bekasovo-yard.json");

let state = createInitialState();
const run = (command: MapCommand): void => { state = executeCommand(state, command).state; };

// 1520 mm軌間は軌間カタログに未収録のため、標準軌で代用する。
const mainSpec = { gaugeId: "gauge-1435mm", railProfileId: "gost-r65", supportSystemId: "pc-sleeper-ballast", roadbedId: "reinforced-roadbed" };
const yardSpec = { gaugeId: "gauge-1435mm", railProfileId: "gost-r50", supportSystemId: "pc-sleeper-ballast", roadbedId: "standard-drained-roadbed" };

type Spec = typeof mainSpec;
const nextId = (): string => `track-${state.nextTrackId}`;
const createdIds = (before: number): string[] =>
  Array.from({ length: state.nextTrackId - before }, (_, k) => `track-${before + k}`);
const track = (command: Omit<Extract<MapCommand, { type: "track.create" }>, "type">, spec: Spec, speed: number): string => {
  const id = nextId();
  try {
    run({ type: "track.create", ...command, specification: spec, designSpeedKmh: speed });
  } catch (error) {
    console.error(`[失敗] ${id} ${command.geometry} pts=${JSON.stringify(command.points)} start=${command.startConnectionTrackId ?? "-"} end=${command.endConnectionTrackId ?? "-"}`);
    throw error;
  }
  return id;
};

// ---- 座標系 -------------------------------------------------------------
// 局所座標 (u, v): u = 操車場の長手方向（受入→出発）、v = 横断方向。
// 画像の北北東→南南西の向きに合わせて回転させる。
const AXIS_RAD = (110 * Math.PI) / 180;
const DIR = { x: Math.cos(AXIS_RAD), y: Math.sin(AXIS_RAD) };
const PERP = { x: -Math.sin(AXIS_RAD), y: Math.cos(AXIS_RAD) };
const LDIR = (du: number, dv: number): Point => ({
  x: DIR.x * du + PERP.x * dv,
  y: DIR.y * du + PERP.y * dv,
});
const P = (u: number, v: number): Point => ({
  x: DIR.x * u + PERP.x * v,
  y: DIR.y * u + PERP.y * v,
});

// ---- 寸法 ---------------------------------------------------------------
const SPACING = 14;   // 線路中心間隔
const PITCH = 90;     // ラダー1分岐あたりの前進量
const RUN = 120;      // 分岐点から線路始端までの接続曲線の前進量
const YARD_SPEED = 25;
const THROAT_SPEED = 45;

// ---- ラダー（分岐梯子） -------------------------------------------------
// 斜めの梯子線を直線の連鎖として敷き、各分岐点から二円弧で目標線路へ接続する。
interface LadderOptions {
  throat: { u: number; v: number };
  dirU: 1 | -1;
  dirV: 1 | -1;
  count: number;
  pitch?: number;
  spacing?: number;
  targets: string[];                    // 分岐 j の接続先線路
  targetPoint: (j: number) => Point;    // 接続先の端点（局所座標で算出済み）
  leadConnectionTrackId?: string;       // 梯子先端（throat側）の接続先
  spec?: Spec;
  speed?: number;
}

function ladder(options: LadderOptions): { leadIds: string[]; connectorIds: string[] } {
  const pitch = options.pitch ?? PITCH;
  const spacing = options.spacing ?? SPACING;
  const spec = options.spec ?? yardSpec;
  const speed = options.speed ?? YARD_SPEED;
  const branch = (j: number) => ({
    u: options.throat.u + options.dirU * j * pitch,
    v: options.throat.v + options.dirV * j * spacing,
  });

  const leadIds: string[] = [];
  for (let j = 0; j < options.count; j += 1) {
    const from = branch(j);
    const to = branch(j + 1);
    leadIds.push(track({
      geometry: "straight",
      points: [P(from.u, from.v), P(to.u, to.v)],
      ...(j === 0
        ? (options.leadConnectionTrackId ? { startConnectionTrackId: options.leadConnectionTrackId } : {})
        : { startConnectionTrackId: leadIds[j - 1] }),
    }, spec, speed));
  }

  const connectorIds: string[] = [];
  for (let j = 0; j < options.count; j += 1) {
    const from = branch(j);
    connectorIds.push(track({
      geometry: "curve",
      points: [P(from.u, from.v), options.targetPoint(j)],
      startConnectionTrackId: j === 0 ? leadIds[0] : leadIds[j - 1],
      endConnectionTrackId: options.targets[j],
    }, spec, speed));
  }
  return { leadIds, connectorIds };
}

// ---- 受入線群（парк приёма） --------------------------------------------
const ARRIVAL_N = 0;      // 北側咽喉
const ARRIVAL_S = 1800;   // 南側咽喉（ハンプ側）
const ARRIVAL_COUNT = 8;
const ARRIVAL_V = (i: number) => -49 + i * SPACING;          // v = -49 .. 49
const arrivalNorthEnd = (i: number) => ARRIVAL_N + (ARRIVAL_COUNT - 1 - i) * PITCH + RUN;
const arrivalSouthEnd = (i: number) => ARRIVAL_S - (i * PITCH + RUN);

const arrivalIds: string[] = [];
for (let i = 0; i < ARRIVAL_COUNT; i += 1) {
  arrivalIds.push(track({
    geometry: "straight",
    points: [P(arrivalNorthEnd(i), ARRIVAL_V(i)), P(arrivalSouthEnd(i), ARRIVAL_V(i))],
  }, yardSpec, YARD_SPEED));
}

// 北側咽喉: v の高い側を先端とする下り梯子
const arrivalNorth = ladder({
  throat: { u: ARRIVAL_N, v: ARRIVAL_V(ARRIVAL_COUNT - 1) },
  dirU: 1, dirV: -1, count: ARRIVAL_COUNT,
  targets: Array.from({ length: ARRIVAL_COUNT }, (_, j) => arrivalIds[ARRIVAL_COUNT - 1 - j]),
  targetPoint: (j) => P(arrivalNorthEnd(ARRIVAL_COUNT - 1 - j), ARRIVAL_V(ARRIVAL_COUNT - 1 - j)),
  speed: THROAT_SPEED,
});

// 南側咽喉: ハンプへ収束する梯子
const arrivalSouth = ladder({
  throat: { u: ARRIVAL_S, v: ARRIVAL_V(0) },
  dirU: -1, dirV: 1, count: ARRIVAL_COUNT,
  targets: arrivalIds,
  targetPoint: (j) => P(arrivalSouthEnd(j), ARRIVAL_V(j)),
  speed: THROAT_SPEED,
});


// ---- 主幹線（幹線状の押上線・収束線）に分岐点を並べる ------------------
function trunk(breaks: number[], v: number, firstConnection: string | undefined, speed: number): string[] {
  const ids: string[] = [];
  for (let i = 0; i < breaks.length - 1; i += 1) {
    ids.push(track({
      geometry: "straight",
      points: [P(breaks[i], v), P(breaks[i + 1], v)],
      ...(i === 0
        ? (firstConnection ? { startConnectionTrackId: firstConnection } : {})
        : { startConnectionTrackId: ids[i - 1] }),
    }, yardSpec, speed));
  }
  return ids;
}

// ---- ハンプ押上線（горка） ----------------------------------------------
const HUMP_CURVE_END = 2250;
const humpApproach = track({
  geometry: "curve",
  points: [P(ARRIVAL_S, ARRIVAL_V(0)), P(HUMP_CURVE_END, 0)],
  startConnectionTrackId: arrivalSouth.leadIds[0],
  endTangent: DIR,
}, yardSpec, THROAT_SPEED);

// 仕分線群4束への分岐点。外側の束から先に分かれ、内側の束の梯子と交差させない。
const ENTRY_BREAKS = [HUMP_CURVE_END, 2500, 2650, 2900, 3050, 3300];
const humpTrunk = trunk(ENTRY_BREAKS, 0, humpApproach, YARD_SPEED);

// ---- 仕分線群（сортировочный парк）: 4束 × 8本 --------------------------
const BUNDLE_SPACING = 146;

interface BundlePlan { side: 1 | -1; index: 1 | 2; entryThroat: number; exitThroat: number; branchAt: number; exitBranchAt: number; }
// 入口: 外側の束(index 2)を先に分岐させる。出口: 内側の束(index 1)を先に合流させる。
const PLANS: BundlePlan[] = [
  { side: -1, index: 2, entryThroat: 3100, branchAt: 2500, exitThroat: 5500, exitBranchAt: 6100 },
  { side:  1, index: 2, entryThroat: 3250, branchAt: 2650, exitThroat: 5650, exitBranchAt: 6250 },
  { side: -1, index: 1, entryThroat: 3200, branchAt: 2900, exitThroat: 5200, exitBranchAt: 5500 },
  { side:  1, index: 1, entryThroat: 3350, branchAt: 3050, exitThroat: 5350, exitBranchAt: 5650 },
];

const bandV = (plan: BundlePlan) => plan.side * (40 + (plan.index - 1) * BUNDLE_SPACING);
const classV = (plan: BundlePlan, i: number) => bandV(plan) + plan.side * i * SPACING;
const classNorth = (plan: BundlePlan, i: number) => plan.entryThroat + i * PITCH + RUN;
const classSouth = (plan: BundlePlan, i: number) => plan.exitThroat - ((7 - i) * PITCH + RUN);

const bundles = PLANS.map((plan) => {
  const classIds: string[] = [];
  for (let i = 0; i < 8; i += 1) {
    classIds.push(track({
      geometry: "straight",
      points: [P(classNorth(plan, i), classV(plan, i)), P(classSouth(plan, i), classV(plan, i))],
    }, yardSpec, YARD_SPEED));
  }
  const entry = ladder({
    throat: { u: plan.entryThroat, v: classV(plan, 0) },
    dirU: 1, dirV: plan.side, count: 8,
    targets: classIds,
    targetPoint: (j) => P(classNorth(plan, j), classV(plan, j)),
  });
  const exit = ladder({
    throat: { u: plan.exitThroat, v: classV(plan, 7) },
    dirU: -1, dirV: -plan.side as 1 | -1, count: 8,
    targets: Array.from({ length: 8 }, (_, j) => classIds[7 - j]),
    targetPoint: (j) => P(classSouth(plan, 7 - j), classV(plan, 7 - j)),
  });
  return { plan, classIds, entryLead: entry.leadIds[0], exitLead: exit.leadIds[0] };
});

// 押上線から各束の梯子先端へ二円弧で分岐する
bundles.forEach(({ plan, entryLead }) => {
  const segment = ENTRY_BREAKS.indexOf(plan.branchAt);
  track({
    geometry: "curve",
    points: [P(plan.branchAt, 0), P(plan.entryThroat, classV(plan, 0))],
    startConnectionTrackId: humpTrunk[segment - 1],
    endConnectionTrackId: entryLead,
  }, yardSpec, THROAT_SPEED);
});

// ---- 出発側の収束線 -----------------------------------------------------
const EXIT_BREAKS = [5500, 5650, 6100, 6250, 6600];
const exitTrunk = trunk(EXIT_BREAKS, 0, undefined, YARD_SPEED);
bundles.forEach(({ plan, exitLead }) => {
  const segment = EXIT_BREAKS.indexOf(plan.exitBranchAt);
  track({
    geometry: "curve",
    points: [P(plan.exitBranchAt, 0), P(plan.exitThroat, classV(plan, 7))],
    startConnectionTrackId: segment === 0 ? exitTrunk[0] : exitTrunk[segment - 1],
    endConnectionTrackId: exitLead,
  }, yardSpec, THROAT_SPEED);
});
const DEP_APPROACH_END = EXIT_BREAKS[EXIT_BREAKS.length - 1];
const departureApproach2 = exitTrunk[exitTrunk.length - 1];

// ---- 出発線群（парк отправления） ---------------------------------------
const DEP_N = 7000;
const DEP_S = 8800;
const depApproach3 = track({
  geometry: "curve",
  points: [P(DEP_APPROACH_END, 0), P(DEP_N, ARRIVAL_V(0))],
  startConnectionTrackId: departureApproach2,
  endTangent: LDIR(PITCH, SPACING),
}, yardSpec, THROAT_SPEED);

const depNorthEnd = (i: number) => DEP_N + i * PITCH + RUN;
const depSouthEnd = (i: number) => DEP_S - ((7 - i) * PITCH + RUN);
const departureIds: string[] = [];
for (let i = 0; i < 8; i += 1) {
  departureIds.push(track({
    geometry: "straight",
    points: [P(depNorthEnd(i), ARRIVAL_V(i)), P(depSouthEnd(i), ARRIVAL_V(i))],
  }, yardSpec, YARD_SPEED));
}
const departureNorth = ladder({
  throat: { u: DEP_N, v: ARRIVAL_V(0) },
  dirU: 1, dirV: 1, count: 8,
  targets: departureIds,
  targetPoint: (j) => P(depNorthEnd(j), ARRIVAL_V(j)),
  leadConnectionTrackId: depApproach3,
  speed: THROAT_SPEED,
});
const departureSouth = ladder({
  throat: { u: DEP_S, v: ARRIVAL_V(7) },
  dirU: -1, dirV: -1, count: 8,
  targets: Array.from({ length: 8 }, (_, j) => departureIds[7 - j]),
  targetPoint: (j) => P(depSouthEnd(7 - j), ARRIVAL_V(7 - j)),
  speed: THROAT_SPEED,
});

// ---- 引上線（вытяжной путь） --------------------------------------------
const tailApproach = track({
  geometry: "curve",
  points: [P(DEP_S, ARRIVAL_V(7)), P(DEP_S + 400, 0)],
  startConnectionTrackId: departureSouth.leadIds[0],
  endTangent: DIR,
}, yardSpec, YARD_SPEED);
const departureExit = track({
  geometry: "straight",
  points: [P(DEP_S + 400, 0), P(DEP_S + 700, 0)],
  startConnectionTrackId: tailApproach,
}, yardSpec, YARD_SPEED);
// 引上線（вытяжной путь）: 入換用の行き止まり
const tailLead = track({
  geometry: "straight",
  points: [P(DEP_S + 700, 0), P(DEP_S + 1500, 0)],
  startConnectionTrackId: departureExit,
}, yardSpec, YARD_SPEED);

void arrivalNorth; void departureNorth;
console.log([
  `受入線群 ${arrivalIds.length}本`,
  `仕分線群 ${bundles.length}束 ${bundles.reduce((n, b) => n + b.classIds.length, 0)}本`,
  `出発線群 ${departureIds.length}本`,
  `引上線 1本`,
].join(" / "));

// ---- 本線（Большое кольцо МЖД: モスクワ大環状線） ----------------------
const MAIN_V = 450;
const MAIN_SPEED = 100;
const MAIN_BREAKS = [-2600, -1300, 0, 3000, 6500, 9600, 11800];
const mainSegments: string[][] = [];
for (let i = 0; i < MAIN_BREAKS.length - 1; i += 1) {
  const before = state.nextTrackId;
  run({
    type: "track.create", geometry: "straight", trackCount: 2, trackSpacing: 12,
    points: [P(MAIN_BREAKS[i], MAIN_V), P(MAIN_BREAKS[i + 1], MAIN_V)],
    specification: mainSpec, designSpeedKmh: MAIN_SPEED,
    ...(i === 0 ? {} : { startConnectionTrackId: mainSegments[i - 1][0] }),
  });
  mainSegments.push(createdIds(before));
}

// 北側連絡線: 受入線群の北咽喉から本線へ
track({
  geometry: "curve",
  points: [P(ARRIVAL_N, ARRIVAL_V(ARRIVAL_COUNT - 1)), P(-1300, MAIN_V)],
  startConnectionTrackId: arrivalNorth.leadIds[0],
  endConnectionTrackId: mainSegments[0][0],
}, mainSpec, THROAT_SPEED);

// 南側連絡線: 出発線群の咽喉から本線へ
track({
  geometry: "curve",
  points: [P(DEP_S + 700, 0), P(11000, MAIN_V)],
  startConnectionTrackId: departureExit,
  endConnectionTrackId: mainSegments[5][0],
}, mainSpec, THROAT_SPEED);

// 渡り線（съезд）: 本線上下間を連絡する
const crossover = (u: number, segment: string[], reverse = false): void => {
  track({
    geometry: "curve",
    points: [P(u, MAIN_V + (reverse ? 6 : -6)), P(u + 170, MAIN_V + (reverse ? -6 : 6))],
    startConnectionTrackId: segment[reverse ? 1 : 0],
    endConnectionTrackId: segment[reverse ? 0 : 1],
    connectionAlignmentIndex: reverse ? 1 : 0,
    endConnectionAlignmentIndex: reverse ? 0 : 1,
  }, mainSpec, 60);
};
crossover(-2000, mainSegments[0]);
crossover(10300, mainSegments[5]);

// ---- キエフ方面本線（Киевское направление） --------------------------
// 画面写真から読み取った相対配置。北側で大環状線へ近づき、南西へ離れていく。
const KIEV_A = { u: -4800, v: 600 };
const KIEV_B = { u: 5200, v: 3800 };
const KIEV_SPEED = 120;
const KP = (t: number) => P(KIEV_A.u + (KIEV_B.u - KIEV_A.u) * t, KIEV_A.v + (KIEV_B.v - KIEV_A.v) * t);
const KIEV_T = [0, 0.18, 0.36, 0.54, 0.72, 1];
const kievSegments: string[][] = [];
for (let i = 0; i < KIEV_T.length - 1; i += 1) {
  const before = state.nextTrackId;
  run({
    type: "track.create", geometry: "straight", trackCount: 2, trackSpacing: 12,
    points: [KP(KIEV_T[i]), KP(KIEV_T[i + 1])],
    specification: mainSpec, designSpeedKmh: KIEV_SPEED,
    ...(i === 0 ? {} : { startConnectionTrackId: kievSegments[i - 1][0] }),
  });
  kievSegments.push(createdIds(before));
}

// キエフ方面本線の渡り線
const KIEV_DU = KIEV_B.u - KIEV_A.u;
const KIEV_DV = KIEV_B.v - KIEV_A.v;
const KIEV_LEN = Math.hypot(KIEV_DU, KIEV_DV);
const KPo = (t: number, d: number): Point => P(
  KIEV_A.u + KIEV_DU * t + (-KIEV_DV / KIEV_LEN) * d,
  KIEV_A.v + KIEV_DV * t + (KIEV_DU / KIEV_LEN) * d,
);
track({
  geometry: "curve",
  points: [KPo(0.22, -6), KPo(0.22 + 170 / KIEV_LEN, 6)],
  startConnectionTrackId: kievSegments[1][0],
  endConnectionTrackId: kievSegments[1][1],
  connectionAlignmentIndex: 0,
  endConnectionAlignmentIndex: 1,
}, mainSpec, 60);

// 連絡線: キエフ方面本線と大環状線を結ぶ。実物は複数の短絡線からなる三角線。
track({
  geometry: "curve",
  points: [P(-2100, 1400), P(1000, MAIN_V)],
  startConnectionTrackId: kievSegments[1][0],
  endConnectionTrackId: mainSegments[2][0],
  connectionAlignmentIndex: 0,
  endConnectionAlignmentIndex: 0,
}, mainSpec, THROAT_SPEED);

// ---- 駅 ---------------------------------------------------------------
const station = (name: string, trackId: string, from: Point, to: Point, includeTrackGroup = false): void =>
  run({ type: "station.createRange", name, trackId, startPosition: from, endPosition: to, includeTrackGroup });

station("ベカソヴォ操車場", arrivalIds[3], P(600, ARRIVAL_V(3)), P(1300, ARRIVAL_V(3)));
station("ベカソヴォ中央", departureIds[3], P(DEP_N + 500, ARRIVAL_V(3)), P(DEP_N + 1200, ARRIVAL_V(3)));
station("キエフスキー集落", mainSegments[0][0], P(-2400, MAIN_V - 6), P(-1700, MAIN_V - 6), true);
station("240km", mainSegments[4][0], P(7000, MAIN_V - 6), P(7500, MAIN_V - 6), true);
station("241km", mainSegments[5][0], P(10200, MAIN_V - 6), P(10700, MAIN_V - 6), true);

const kievStation = (name: string, segment: number, t0: number, t1: number): void => {
  const a = KIEV_T[segment] + (KIEV_T[segment + 1] - KIEV_T[segment]) * t0;
  const b = KIEV_T[segment] + (KIEV_T[segment + 1] - KIEV_T[segment]) * t1;
  station(name, kievSegments[segment][0], KP(a), KP(b), true);
};
kievStation("オジゴヴォ", 0, 0.2, 0.5);
kievStation("ポジトコヴォ", 1, 0.3, 0.6);
kievStation("ベカソヴォI", 2, 0.3, 0.6);
kievStation("ゾシモヴァ・プスチニ", 3, 0.4, 0.7);

void tailLead;

const lengthOf = (id: string): number => {
  const t = state.tracks.find((x) => x.id === id)!;
  let total = 0;
  for (let i = 0; i < t.points.length - 1; i += 1) total += Math.hypot(t.points[i + 1].x - t.points[i].x, t.points[i + 1].y - t.points[i].y);
  return total;
};
console.log(`受入線長 ${lengthOf(arrivalIds[0]).toFixed(0)} m / 出発線長 ${lengthOf(departureIds[0]).toFixed(0)} m`);
console.log(bundles.map((b) => `${b.plan.side > 0 ? "上" : "下"}${b.plan.index}束 仕分線長 ${lengthOf(b.classIds[0]).toFixed(0)} m`).join(" / "));

const inspection = inspectTrackRadii(state);
const t = inspection.topology;
console.log(`接続成分=${t.connectedComponents.length} 孤立線路=${t.isolatedTrackIds.length} 未接続端=${t.unconnectedEndpoints.length} 接続漏れ候補=${t.nearMisses.length} 不正接続=${t.invalidConnections.length}`);
console.log(`最小曲線半径=${inspection.minimumRadiusM?.toFixed(1)} m`);
console.log(`合計: 線路${state.tracks.length}本 分岐${state.junctions.length}箇所 駅${state.stations.length}`);
if (t.connectedComponents.length > 1) {
  console.log("成分サイズ:", t.connectedComponents.map((c) => c.length).join(", "));
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const save = createSaveFile("ベカソヴォ操車場", state);
fs.writeFileSync(outputPath, serializeSaveFile(save), "utf8");
parseSaveFile(fs.readFileSync(outputPath, "utf8"));
console.log(`保存: ${outputPath}`);
