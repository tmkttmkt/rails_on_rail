import { describe, expect, it } from "vitest";
import { centeredConnectionCandidateIndex, connectionCandidateCount, connectionCandidateIndexFromSelectedTrack, executeCommand, pairByAlignment, pairByCenter } from "../src/simulation/commands";
import { analyzeLine, analyzeTrackLines, closestPointOnSegment, createParallelLines, findNearestStraightStartPoint, findNearestTrackEndpoint, findNearestTrackPoint, polylineOverlapLength, projectPointToAxis, recommendedCantMm, sampleArcChain, sampleTrack } from "../src/simulation/geometry";
import { createInitialCamera, createInitialState, distanceToSegment, screenToWorld, worldToScreen, zoomAt } from "../src/simulation/model";

describe("free map", () => {
  it("任意の点列から線路を作成・撤去する", () => {
    let state = createInitialState();
    state = executeCommand(state, { type: "track.create", geometry: "straight", points: [{ x: -20, y: 10 }, { x: 40, y: 80 }, { x: 160, y: 20 }] }).state;
    expect(state.tracks[0].points).toHaveLength(3);
    state = executeCommand(state, { type: "track.delete", trackId: "track-1" }).state;
    expect(state.tracks).toHaveLength(0);
  });

  it("ワールド座標と画面座標を往復する", () => {
    const camera = { x: 120, y: -40, zoom: 1.75, rotation: 0 };
    const viewport = { width: 800, height: 600 };
    const world = { x: -25, y: 230 };
    expect(screenToWorld(worldToScreen(world, camera, viewport), camera, viewport)).toEqual(world);
  });

  it("ポインター位置を保ったままズームする", () => {
    const viewport = { width: 800, height: 600 };
    const screen = { x: 650, y: 170 };
    const before = screenToWorld(screen, createInitialCamera(), viewport);
    const camera = zoomAt(createInitialCamera(), screen, 2, viewport);
    expect(screenToWorld(screen, camera, viewport)).toEqual(before);
  });

  it("線分からの距離を求める", () => {
    expect(distanceToSegment({ x: 50, y: 20 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBe(20);
  });

  it("指定した区間終点を通る円弧チェーンを生成する", () => {
    const points = [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 0 }];
    const sampled = sampleArcChain(points, 10);
    expect(sampled[0]).toEqual(points[0]);
    expect(sampled[10]).toEqual(points[1]);
    expect(sampled.at(-1)).toEqual(points[2]);
    expect(sampled).toHaveLength(21);
  });

  it("直線は制御点をそのまま使用する", () => {
    const points = [{ x: 0, y: 0 }, { x: 100, y: 50 }, { x: 200, y: 0 }];
    expect(sampleTrack({ geometry: "straight", points })).toEqual(points);
  });

  it("既設線路の途中へ吸着する", () => {
    let state = createInitialState();
    state = executeCommand(state, { type: "track.create", geometry: "straight", points: [{ x: 0, y: 0 }, { x: 200, y: 0 }] }).state;
    const nearest = findNearestTrackPoint(state, { x: 80, y: 7 }, 12);
    expect(nearest?.trackId).toBe("track-1");
    expect(nearest?.point).toEqual({ x: 80, y: 0 });
  });

  it("先端限定の吸着では線路途中を対象にしない", () => {
    let state = createInitialState();
    state = executeCommand(state, { type: "track.create", geometry: "straight", points: [{ x: 0, y: 0 }, { x: 200, y: 0 }] }).state;
    expect(findNearestTrackEndpoint(state, { x: 80, y: 7 }, 12)).toBeNull();
    expect(findNearestTrackEndpoint(state, { x: 196, y: 7 }, 12)?.point).toEqual({ x: 200, y: 0 });
  });

  it("直線の始点は曲線途中へ吸着できるが直線途中へは吸着しない", () => {
    let straightState = createInitialState();
    straightState = executeCommand(straightState, { type: "track.create", geometry: "straight", points: [{ x: 0, y: 0 }, { x: 200, y: 0 }] }).state;
    expect(findNearestStraightStartPoint(straightState, { x: 80, y: 7 }, 12)).toBeNull();

    let curveState = createInitialState();
    curveState = executeCommand(curveState, { type: "track.create", geometry: "curve", points: [{ x: 0, y: 0 }, { x: 100, y: 80 }, { x: 200, y: 0 }] }).state;
    const middle = sampleTrack(curveState.tracks[0])[10];
    expect(findNearestStraightStartPoint(curveState, middle, 12)?.trackId).toBe("track-1");
  });

  it("許容距離外では吸着しない", () => {
    let state = createInitialState();
    state = executeCommand(state, { type: "track.create", geometry: "straight", points: [{ x: 0, y: 0 }, { x: 200, y: 0 }] }).state;
    expect(findNearestTrackPoint(state, { x: 80, y: 20 }, 12)).toBeNull();
  });

  it("線分途中の最近点を返す", () => {
    expect(closestPointOnSegment({ x: 30, y: 12 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toEqual({ point: { x: 30, y: 0 }, distance: 12 });
  });

  it("同一直線上の有限区間だけを重複として計測する", () => {
    expect(polylineOverlapLength([{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 50, y: 0 }, { x: 150, y: 0 }])).toBeCloseTo(50);
    expect(polylineOverlapLength([{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 100, y: 0 }, { x: 100, y: 100 }])).toBe(0);
    expect(polylineOverlapLength([{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 50, y: -50 }, { x: 50, y: 50 }])).toBe(0);
  });

  it("直線の終点を既設線路の方向軸へ拘束する", () => {
    expect(projectPointToAxis({ x: 80, y: 60 }, { x: 20, y: 10 }, { x: 1, y: 0 })).toEqual({ x: 80, y: 10 });
  });

  it("曲線の開始接線を既設線路の方向へ合わせる", () => {
    const sampled = sampleArcChain([{ x: 0, y: 0 }, { x: 50, y: 100 }, { x: 130, y: 130 }], 1000, { x: 1, y: 0 });
    const dx = sampled[1].x - sampled[0].x;
    const dy = sampled[1].y - sampled[0].y;
    expect(dx).toBeGreaterThan(0);
    expect(Math.abs(dy / dx)).toBeLessThan(0.01);
  });

  it("曲線の終了接線を接続先線路の方向へ合わせる", () => {
    const sampled = sampleArcChain([{ x: 0, y: 0 }, { x: 80, y: 90 }, { x: 160, y: 120 }], 1000, undefined, { x: 1, y: 0 });
    const last = sampled.length - 1;
    const dx = sampled[last].x - sampled[last - 1].x;
    const dy = sampled[last].y - sampled[last - 1].y;
    expect(dx).toBeGreaterThan(0);
    expect(Math.abs(dy / dx)).toBeLessThan(0.01);
  });

  it("円弧区間は一定半径になる", () => {
    const sampled = sampleArcChain([{ x: 0, y: 0 }, { x: 100, y: 100 }], 20, { x: 1, y: 0 });
    const radii = analyzeLine(sampled).samples.flatMap((sample) => sample.radiusM === null ? [] : [sample.radiusM]);
    expect(Math.min(...radii)).toBeCloseTo(100, 5);
    expect(Math.max(...radii)).toBeCloseTo(100, 5);
  });

  it("後続点を追加しても確定済みの円弧を変形しない", () => {
    const before = sampleArcChain([{ x: 0, y: 0 }, { x: 100, y: 100 }], 20, { x: 1, y: 0 });
    const after = sampleArcChain([{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 220, y: 80 }], 20, { x: 1, y: 0 });
    expect(after.slice(0, before.length)).toEqual(before);
  });

  it("次の終点が後方にあっても継承した進行方向を反転しない", () => {
    const sampled = sampleArcChain([{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 20, y: 20 }], 100, { x: 1, y: 0 });
    const boundary = 100;
    const incoming = {
      x: sampled[boundary].x - sampled[boundary - 1].x,
      y: sampled[boundary].y - sampled[boundary - 1].y,
    };
    const outgoing = {
      x: sampled[boundary + 1].x - sampled[boundary].x,
      y: sampled[boundary + 1].y - sampled[boundary].y,
    };
    expect(incoming.x * outgoing.x + incoming.y * outgoing.y).toBeGreaterThan(0);
  });

  it("偶数本の線路を中心線の左右へ対称配置する", () => {
    const lines = createParallelLines([{ x: 0, y: 0 }, { x: 100, y: 0 }], 4, 10);
    expect(lines).toHaveLength(4);
    expect(lines.map((line) => line[0].y)).toEqual([-15, -5, 5, 15]);
  });

  it("奇数本では中央線を保持する", () => {
    const lines = createParallelLines([{ x: 0, y: 0 }, { x: 100, y: 0 }], 3, 10);
    expect(lines.map((line) => line[0].y)).toEqual([-10, 0, 10]);
  });

  it("同時敷設した各線路へ独立IDを割り当てて束ねる", () => {
    const state = executeCommand(createInitialState(), { type: "track.create", geometry: "straight", trackCount: 3, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }).state;
    expect(state.tracks.map((track) => track.id)).toEqual(["track-1", "track-2", "track-3"]);
    expect(state.trackGroups[0].trackIds).toEqual(["track-1", "track-2", "track-3"]);
  });

  it("異なる本数の線路を中央寄せで対応づける", () => {
    const pairs = pairByCenter(["new-1", "new-2", "new-3", "new-4"], ["old-1", "old-2"]);
    expect(pairs).toEqual([
      { ownId: "new-2", otherId: "old-1" },
      { ownId: "new-3", otherId: "old-2" },
    ]);
  });

  it("選んだ既設線から束の中央方向へ新線を並べる", () => {
    const other = ["old-1", "old-2", "old-3", "old-4", "old-5"];
    expect(connectionCandidateIndexFromSelectedTrack(3, other, "old-1")).toBe(2);
    expect(pairByAlignment(["new-1", "new-2", "new-3"], other, 2)).toEqual([
      { ownId: "new-1", otherId: "old-1" },
      { ownId: "new-2", otherId: "old-2" },
      { ownId: "new-3", otherId: "old-3" },
    ]);
    expect(connectionCandidateIndexFromSelectedTrack(3, other, "old-5")).toBe(4);
    expect(pairByAlignment(["new-1", "new-2", "new-3"], other, 4)).toEqual([
      { ownId: "new-1", otherId: "old-3" },
      { ownId: "new-2", otherId: "old-4" },
      { ownId: "new-3", otherId: "old-5" },
    ]);
  });

  it("既設束の中央線を選んだ場合は中央寄せにする", () => {
    const other = ["old-1", "old-2", "old-3", "old-4", "old-5"];
    expect(connectionCandidateIndexFromSelectedTrack(2, other, "old-3")).toBe(centeredConnectionCandidateIndex(2, other.length));
  });

  it("5本から2本で最低一本だけ重なる位置まで移動できる", () => {
    const own = ["new-1", "new-2"];
    const other = ["old-1", "old-2", "old-3", "old-4", "old-5"];
    expect(connectionCandidateCount(own.length, other.length)).toBe(6);
    expect(centeredConnectionCandidateIndex(own.length, other.length)).toBe(2);
    expect(pairByAlignment(own, other, 0)).toEqual([{ ownId: "new-2", otherId: "old-1" }]);
    expect(pairByAlignment(own, other, 1).map((pair) => pair.otherId)).toEqual(["old-1", "old-2"]);
    expect(pairByAlignment(own, other, 5)).toEqual([{ ownId: "new-1", otherId: "old-5" }]);
    expect(pairByAlignment(own, other, 99)).toEqual([{ ownId: "new-1", otherId: "old-5" }]);
  });

  it("2本から5本でも最低一本だけ重なる位置まで移動できる", () => {
    const own = ["new-1", "new-2", "new-3", "new-4", "new-5"];
    const other = ["old-1", "old-2"];
    expect(connectionCandidateCount(own.length, other.length)).toBe(6);
    expect(pairByAlignment(own, other, 0)).toEqual([{ ownId: "new-5", otherId: "old-1" }]);
    expect(pairByAlignment(own, other, 4).map((pair) => pair.ownId)).toEqual(["new-1", "new-2"]);
    expect(pairByAlignment(own, other, 5)).toEqual([{ ownId: "new-1", otherId: "old-2" }]);
  });

  it("指定した候補で3本から2本への接続を確定する", () => {
    let state = executeCommand(createInitialState(), { type: "track.create", geometry: "straight", trackCount: 3, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }).state;
    state = executeCommand(state, { type: "track.create", geometry: "straight", trackCount: 2, connectionAlignmentIndex: 2, startConnectionTrackId: "track-1", points: [{ x: 100, y: -12 }, { x: 180, y: -12 }] }).state;
    expect(state.tracks[3].startConnection?.trackId).toBe("track-2");
    expect(state.tracks[4].startConnection?.trackId).toBe("track-3");
  });

  it("既設束の一本だけに接続する単線分岐を作れる", () => {
    let state = executeCommand(createInitialState(), { type: "track.create", geometry: "straight", trackCount: 3, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }).state;
    state = executeCommand(state, { type: "track.create", geometry: "straight", trackCount: 1, connectionAlignmentIndex: 2, startConnectionTrackId: "track-1", points: [{ x: 100, y: -12 }, { x: 180, y: 80 }] }).state;
    expect(state.tracks[3].startConnection?.trackId).toBe("track-3");
    expect(state.tracks[3].points[0]).toEqual({ x: 100, y: 12 });
  });

  it("既設線と同じ接線から緩やかに離れる分岐を重複扱いしない", () => {
    let state = executeCommand(createInitialState(), { type: "track.create", geometry: "straight", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }).state;
    state = executeCommand(state, { type: "track.create", geometry: "curve", startConnectionTrackId: "track-1", startTangent: { x: 1, y: 0 }, points: [{ x: 100, y: 0 }, { x: 300, y: 2 }] }).state;
    expect(state.tracks).toHaveLength(2);
    expect(state.tracks[1].startConnection?.trackId).toBe("track-1");
  });

  it("既設線路と同じ区間への重ねがけを拒否する", () => {
    const state = executeCommand(createInitialState(), { type: "track.create", geometry: "straight", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }).state;
    expect(() => executeCommand(state, { type: "track.create", geometry: "straight", points: [{ x: 20, y: 0 }, { x: 80, y: 0 }] })).toThrow("同じ区間へ線路を重ねることはできません");
  });

  it("既設線路との一点交差は許可する", () => {
    let state = executeCommand(createInitialState(), { type: "track.create", geometry: "straight", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }).state;
    state = executeCommand(state, { type: "track.create", geometry: "straight", points: [{ x: 50, y: -50 }, { x: 50, y: 50 }] }).state;
    expect(state.tracks).toHaveLength(2);
  });

  it("複線同士の始点接続を個別線路単位で保存する", () => {
    let state = createInitialState();
    state = executeCommand(state, { type: "track.create", geometry: "straight", trackCount: 2, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }).state;
    state = executeCommand(state, { type: "track.create", geometry: "curve", trackCount: 2, startConnectionTrackId: "track-1", points: [{ x: 100, y: 0 }, { x: 180, y: 40 }] }).state;
    expect(state.tracks[2].startConnection?.trackId).toBe("track-1");
    expect(state.tracks[3].startConnection?.trackId).toBe("track-2");
    expect(state.junctions).toHaveLength(2);
    expect(state.junctions[0].ports.map((port) => port.trackId)).toEqual(["track-3", "track-1"]);
  });

  it("曲線途中への分岐位置を接続点として保存する", () => {
    let state = executeCommand(createInitialState(), { type: "track.create", geometry: "curve", points: [{ x: 0, y: 0 }, { x: 100, y: 80 }, { x: 200, y: 0 }] }).state;
    const point = state.tracks[0].points[Math.floor(state.tracks[0].points.length / 2)];
    state = executeCommand(state, { type: "track.create", geometry: "straight", startConnectionTrackId: "track-1", points: [point, { x: point.x + 100, y: point.y }] }).state;
    expect(state.junctions[0].ports).toEqual(expect.arrayContaining([
      expect.objectContaining({ trackId: "track-1", location: "interior" }),
      expect.objectContaining({ trackId: "track-2", location: "start", distanceM: 0 }),
    ]));
  });

  it("束の終点を接続先の各線路へ個別に整列する", () => {
    let state = executeCommand(createInitialState(), { type: "track.create", geometry: "straight", trackCount: 2, points: [{ x: 100, y: 0 }, { x: 200, y: 0 }] }).state;
    state = executeCommand(state, { type: "track.create", geometry: "straight", trackCount: 2, endConnectionTrackId: "track-1", points: [{ x: 0, y: 0 }, { x: 100, y: -6 }] }).state;
    expect(state.tracks[2].points.at(-1)).toEqual({ x: 100, y: -6 });
    expect(state.tracks[3].points.at(-1)).toEqual({ x: 100, y: 6 });
  });

  it("束の個別線路から複線を伸ばすと対応する新線を開始位置へ合わせる", () => {
    let state = executeCommand(createInitialState(), { type: "track.create", geometry: "straight", trackCount: 2, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }).state;
    state = executeCommand(state, { type: "track.create", geometry: "straight", trackCount: 2, startConnectionTrackId: "track-1", points: [{ x: 100, y: -6 }, { x: 180, y: -6 }] }).state;
    expect(state.tracks[2].points[0]).toEqual({ x: 100, y: -6 });
    expect(state.tracks[3].points[0]).toEqual({ x: 100, y: 6 });
  });

  it("単独線路から束を作成し、線路を外して自動解体する", () => {
    let state = createInitialState();
    state = executeCommand(state, { type: "track.create", geometry: "straight", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }).state;
    state = executeCommand(state, { type: "track.create", geometry: "straight", points: [{ x: 0, y: 20 }, { x: 100, y: 20 }] }).state;
    state = executeCommand(state, { type: "trackGroup.create", trackIds: ["track-1", "track-2"], name: "複線" }).state;
    expect(state.trackGroups[0]).toMatchObject({ name: "複線", trackIds: ["track-1", "track-2"] });
    state = executeCommand(state, { type: "trackGroup.removeTrack", groupId: state.trackGroups[0].id, trackId: "track-1" }).state;
    expect(state.trackGroups).toHaveLength(0);
    expect(state.tracks).toHaveLength(2);
  });

  it("手動で逆順選択した束を物理的な左右順へ並べる", () => {
    let state = createInitialState();
    state = executeCommand(state, { type: "track.create", geometry: "straight", points: [{ x: 0, y: -20 }, { x: 100, y: -20 }] }).state;
    state = executeCommand(state, { type: "track.create", geometry: "straight", points: [{ x: 0, y: 20 }, { x: 100, y: 20 }] }).state;
    state = executeCommand(state, { type: "trackGroup.create", trackIds: ["track-2", "track-1"] }).state;
    expect(state.trackGroups[0].trackIds).toEqual(["track-1", "track-2"]);
  });

  it("線路上へ駅と停車地点を作成して改名・削除できる", () => {
    let state = executeCommand(createInitialState(), { type: "track.create", geometry: "straight", points: [{ x: 0, y: 0 }, { x: 200, y: 0 }] }).state;
    state = executeCommand(state, { type: "station.createRange", name: " 仮駅 ", trackId: "track-1", startPosition: { x: 40, y: 7 }, endPosition: { x: 120, y: -3 } }).state;
    expect(state.stations[0]).toMatchObject({ name: "仮駅", position: { x: 80, y: 0 } });
    expect(state.stations[0].stopPoints[0]).toEqual({ trackId: "track-1", startDistanceM: 40, endDistanceM: 120, startPosition: { x: 40, y: 0 }, endPosition: { x: 120, y: 0 }, direction: "both" });
    state = executeCommand(state, { type: "station.extend", stationId: "station-1", trackId: "track-1", position: { x: 160, y: 4 } }).state;
    expect(state.stations[0].stopPoints[0].endDistanceM).toBe(160);
    state = executeCommand(state, { type: "station.rename", stationId: "station-1", name: "中央" }).state;
    expect(state.stations[0].name).toBe("中央");
    state = executeCommand(state, { type: "station.delete", stationId: "station-1" }).state;
    expect(state.stations).toEqual([]);
  });

  it("束の一本で指定した駅範囲を束全体へ設定する", () => {
    let state = executeCommand(createInitialState(), { type: "track.create", geometry: "straight", trackCount: 3, points: [{ x: 0, y: 0 }, { x: 200, y: 0 }] }).state;
    state = executeCommand(state, { type: "station.createRange", name: "束駅", trackId: "track-2", startPosition: { x: 40, y: 0 }, endPosition: { x: 120, y: 0 }, includeTrackGroup: true }).state;
    expect(state.stations[0].stopPoints.map((stopPoint) => stopPoint.trackId)).toEqual(["track-1", "track-2", "track-3"]);
    expect(state.stations[0].stopPoints.every((stopPoint) => stopPoint.startDistanceM === 40 && stopPoint.endDistanceM === 120)).toBe(true);
  });

  it("複数駅を統合し、同じ線路の範囲を外端までまとめる", () => {
    let state = executeCommand(createInitialState(), { type: "track.create", geometry: "straight", trackCount: 2, points: [{ x: 0, y: 0 }, { x: 200, y: 0 }] }).state;
    state = executeCommand(state, { type: "station.createRange", name: "中央", trackId: "track-1", startPosition: { x: 20, y: -6 }, endPosition: { x: 70, y: -6 } }).state;
    state = executeCommand(state, { type: "station.createRange", name: "仮乗降場", trackId: "track-1", startPosition: { x: 60, y: -6 }, endPosition: { x: 110, y: -6 } }).state;
    state = executeCommand(state, { type: "station.createRange", name: "別ホーム", trackId: "track-2", startPosition: { x: 30, y: 6 }, endPosition: { x: 90, y: 6 } }).state;
    state = executeCommand(state, { type: "station.merge", stationIds: ["station-1", "station-2", "station-3"] }).state;
    expect(state.stations).toHaveLength(1);
    expect(state.stations[0].name).toBe("中央");
    expect(state.stations[0].stopPoints).toHaveLength(2);
    const mergedStop = state.stations[0].stopPoints.find((stopPoint) => stopPoint.trackId === "track-1");
    expect(mergedStop?.startDistanceM).toBeCloseTo(20);
    expect(mergedStop?.endDistanceM).toBeCloseTo(110);
  });

  it("同一点だけの駅範囲を拒否する", () => {
    const state = executeCommand(createInitialState(), { type: "track.create", geometry: "straight", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }).state;
    expect(() => executeCommand(state, { type: "station.createRange", name: "点駅", trackId: "track-1", startPosition: { x: 50, y: 0 }, endPosition: { x: 50, y: 0 } })).toThrow("1 m以上");
  });

  it("停車地点の線路撤去で空になった駅を削除する", () => {
    let state = executeCommand(createInitialState(), { type: "track.create", geometry: "straight", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }).state;
    state = executeCommand(state, { type: "station.createRange", name: "終点", trackId: "track-1", startPosition: { x: 20, y: 0 }, endPosition: { x: 80, y: 0 } }).state;
    state = executeCommand(state, { type: "track.delete", trackId: "track-1" }).state;
    expect(state.stations).toEqual([]);
  });

  it("束を解体しても個別線路を残す", () => {
    let state = executeCommand(createInitialState(), { type: "track.create", geometry: "straight", trackCount: 2, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }).state;
    state = executeCommand(state, { type: "trackGroup.dissolve", groupId: state.trackGroups[0].id }).state;
    expect(state.trackGroups).toHaveLength(0);
    expect(state.tracks).toHaveLength(2);
  });

  it("既知の円弧から局所半径と最小半径を求める", () => {
    const analysis = analyzeLine([{ x: 100, y: 0 }, { x: 0, y: 100 }, { x: -100, y: 0 }]);
    expect(analysis.minimumRadiusM).toBeCloseTo(100);
    expect(analysis.samples[1].radiusM).toBeCloseTo(100);
  });

  it("直線の曲線半径は無限大としてnullで表す", () => {
    expect(analyzeLine([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }]).minimumRadiusM).toBeNull();
  });

  it("複線では各線を計算して最も小さい半径を代表値にする", () => {
    const center = Array.from({ length: 13 }, (_, index) => {
      const angle = index * Math.PI / 24;
      return { x: 100 * Math.cos(angle), y: 100 * Math.sin(angle) };
    });
    const analysis = analyzeTrackLines(createParallelLines(center, 2, 10));
    expect(analysis.lines).toHaveLength(2);
    expect(analysis.minimumRadiusM).toBeCloseTo(Math.min(...analysis.lines.map((line) => line.minimumRadiusM ?? Infinity)));
    expect(analysis.lines[0].minimumRadiusM).not.toBeCloseTo(analysis.lines[1].minimumRadiusM ?? 0);
  });

  it("軌間・設計速度・半径から推奨カントを求め上限を適用する", () => {
    expect(recommendedCantMm(1067, 80, 400)).toBe(134);
    expect(recommendedCantMm(1435, 200, 300)).toBe(160);
    expect(recommendedCantMm(1067, 80, null)).toBe(0);
  });

  it("建設時の線形と設計速度からカントを保存する", () => {
    const state = executeCommand(createInitialState(), {
      type: "track.create",
      geometry: "curve",
      points: [{ x: 100, y: 0 }, { x: 0, y: 100 }, { x: -100, y: 0 }],
      designSpeedKmh: 60,
    }).state;
    expect(state.tracks[0].engineering.designSpeedKmh).toBe(60);
    expect(state.tracks[0].engineering.builtMinimumRadiusM).not.toBeNull();
    expect(state.tracks[0].engineering.cantProfile).toHaveLength(2);
    expect(state.tracks[0].engineering.cantProfile[0].cantMm).toBeGreaterThan(0);
  });
});
