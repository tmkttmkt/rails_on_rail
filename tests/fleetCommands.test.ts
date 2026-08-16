import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/simulation/model";
import { executeCommand } from "../src/simulation/commands";

describe("Checkpoint B: 取得と編成編集 MapCommand", () => {
  it("テスト用個別車両を無償取得できる", () => {
    let state = createInitialState();

    const res1 = executeCommand(state, { type: "fleet.vehicle.acquire", designId: "generic-light-two-axle-coach" });
    state = res1.state;
    expect(res1.message).toContain("取得しました");
    expect(state.fleet.vehicleUnits).toHaveLength(1);
    expect(state.fleet.vehicleUnits[0].id).toBe("vehicle-1");
    expect(state.fleet.vehicleUnits[0].operatorNumber).toBe("1");

    const res2 = executeCommand(state, { type: "fleet.vehicle.acquire", designId: "generic-light-two-axle-coach" });
    state = res2.state;
    expect(state.fleet.vehicleUnits).toHaveLength(2);
    expect(state.fleet.vehicleUnits[1].id).toBe("vehicle-2");
    expect(state.fleet.vehicleUnits[1].operatorNumber).toBe("2");
  });

  it("事業者番号を指定して車両を取得できる", () => {
    let state = createInitialState();
    const res = executeCommand(state, { type: "fleet.vehicle.acquire", designId: "generic-light-two-axle-coach", operatorNumber: "ハ101" });
    state = res.state;
    expect(state.fleet.vehicleUnits[0].operatorNumber).toBe("ハ101");

    expect(() => executeCommand(state, { type: "fleet.vehicle.acquire", designId: "generic-light-two-axle-coach", operatorNumber: "ハ101" }))
      .toThrow("運行会社車両番号が重複しています");
  });

  it("完成編成テンプレートを原子的に取得できる", () => {
    let state = createInitialState();
    const res = executeCommand(state, { type: "fleet.formation-template.acquire", templateId: "test-passenger-3car" });
    state = res.state;

    expect(res.message).toContain("テスト旅客3両編成");
    expect(state.fleet.formations).toHaveLength(1);
    const formation = state.fleet.formations[0];
    expect(formation.id).toBe("formation-1");
    expect(formation.vehicles).toHaveLength(3);
    expect(state.fleet.vehicleUnits).toHaveLength(3);
  });

  it("存在しないテンプレートIDで原子的取得に失敗した場合は状態が変更されない", () => {
    const state = createInitialState();
    const initialSnapshot = structuredClone(state);

    expect(() => executeCommand(state, { type: "fleet.formation-template.acquire", templateId: "non-existent-template" }))
      .toThrow("完成編成テンプレートが存在しません");

    expect(state).toEqual(initialSnapshot);
  });

  it("空編成の作成・改名・削除ができる", () => {
    let state = createInitialState();

    const res1 = executeCommand(state, { type: "fleet.formation.create", name: "テスト編成A" });
    state = res1.state;
    expect(state.fleet.formations).toHaveLength(1);
    expect(state.fleet.formations[0].name).toBe("テスト編成A");

    const res2 = executeCommand(state, { type: "fleet.formation.rename", formationId: "formation-1", name: "新編成A" });
    state = res2.state;
    expect(state.fleet.formations[0].name).toBe("新編成A");

    const res3 = executeCommand(state, { type: "fleet.formation.delete", formationId: "formation-1" });
    state = res3.state;
    expect(state.fleet.formations).toHaveLength(0);
  });

  it("車両が含まれる編成の削除は拒否される", () => {
    let state = createInitialState();
    state = executeCommand(state, { type: "fleet.formation-template.acquire", templateId: "test-single-locomotive" }).state;

    expect(() => executeCommand(state, { type: "fleet.formation.delete", formationId: "formation-1" }))
      .toThrow("車両が含まれる編成は削除できません");
  });

  it("車両の追加・取り外し・移動・反転ができる", () => {
    let state = createInitialState();

    state = executeCommand(state, { type: "fleet.vehicle.acquire", designId: "generic-light-two-axle-coach" }).state; // vehicle-1
    state = executeCommand(state, { type: "fleet.vehicle.acquire", designId: "generic-light-two-axle-coach" }).state; // vehicle-2
    state = executeCommand(state, { type: "fleet.formation.create", name: "客車編成" }).state; // formation-1

    // 追加 (rear)
    state = executeCommand(state, { type: "fleet.formation.vehicle.add", formationId: "formation-1", vehicleId: "vehicle-1", orientation: "forward" }).state;
    expect(state.fleet.formations[0].vehicles).toEqual([
      { vehicleId: "vehicle-1", orientation: "forward" },
    ]);

    // 追加 (front)
    state = executeCommand(state, { type: "fleet.formation.vehicle.add", formationId: "formation-1", vehicleId: "vehicle-2", orientation: "forward", placement: "front" }).state;
    expect(state.fleet.formations[0].vehicles).toEqual([
      { vehicleId: "vehicle-2", orientation: "forward" },
      { vehicleId: "vehicle-1", orientation: "forward" },
    ]);

    // 反転
    state = executeCommand(state, { type: "fleet.formation.vehicle.reverse", formationId: "formation-1", vehicleId: "vehicle-2" }).state;
    expect(state.fleet.formations[0].vehicles[0].orientation).toBe("reversed");

    // 移動 (並べ替え)
    state = executeCommand(state, { type: "fleet.formation.vehicle.move", formationId: "formation-1", vehicleId: "vehicle-2", targetIndex: 1 }).state;
    expect(state.fleet.formations[0].vehicles.map((v) => v.vehicleId)).toEqual(["vehicle-1", "vehicle-2"]);

    // 取り外し
    state = executeCommand(state, { type: "fleet.formation.vehicle.remove", formationId: "formation-1", vehicleId: "vehicle-1" }).state;
    expect(state.fleet.formations[0].vehicles.map((v) => v.vehicleId)).toEqual(["vehicle-2"]);
  });

  it("連結器不適合の車両追加を拒否する", () => {
    let state = createInitialState();
    state = executeCommand(state, { type: "fleet.vehicle.acquire", designId: "generic-light-two-axle-coach" }).state; // center-buffer-light
    state = executeCommand(state, { type: "fleet.vehicle.acquire", designId: "generic-light-diesel-railcar" }).state; // knuckle
    state = executeCommand(state, { type: "fleet.formation.create", name: "混合" }).state;

    state = executeCommand(state, { type: "fleet.formation.vehicle.add", formationId: "formation-1", vehicleId: "vehicle-1", orientation: "forward" }).state;

    expect(() => executeCommand(state, { type: "fleet.formation.vehicle.add", formationId: "formation-1", vehicleId: "vehicle-2", orientation: "forward" }))
      .toThrow("連結器は互換ではありません");
  });

  it("ブレーキなし貨車の連結でブレーキ警告が保持される", () => {
    let state = createInitialState();
    state = executeCommand(state, { type: "fleet.vehicle.acquire", designId: "test-virtual-locomotive" }).state; // vacuum-automatic brake
    state = executeCommand(state, { type: "fleet.vehicle.acquire", designId: "generic-light-two-axle-flat-wagon" }).state; // no through brake
    state = executeCommand(state, { type: "fleet.formation.create", name: "貨物編成" }).state;

    state = executeCommand(state, { type: "fleet.formation.vehicle.add", formationId: "formation-1", vehicleId: "vehicle-1", orientation: "forward" }).state;
    const res = executeCommand(state, { type: "fleet.formation.vehicle.add", formationId: "formation-1", vehicleId: "vehicle-2", orientation: "forward" });
    state = res.state;

    expect(state.fleet.formations[0].warnings).toEqual([
      { type: "through-brake-discontinuity", firstId: "vehicle-1", secondId: "vehicle-2" },
    ]);
  });

  it("配置・予約・運行中ロックが正しく機能する", () => {
    let state = createInitialState();
    state = executeCommand(state, { type: "fleet.formation-template.acquire", templateId: "test-single-locomotive" }).state;

    // 配置中（VehiclePlacementを模倣追加）
    state.vehiclePlacements.push({
      id: "placement-1",
      formationId: "formation-1",
      stationId: "station-1",
      trackId: "track-1",
      centerDistanceM: 10,
      occupiedStartDistanceM: 5,
      occupiedEndDistanceM: 15,
      orientation: "forward",
    });

    expect(executeCommand(state, { type: "fleet.formation.rename", formationId: "formation-1", name: "変更" }).state.fleet.formations[0].name).toBe("変更");

    expect(() => executeCommand(state, { type: "fleet.formation.delete", formationId: "formation-1" }))
      .toThrow("配置・予約・運行・回収待ちの編成は削除できません");

    expect(() => executeCommand(state, { type: "fleet.formation.vehicle.reverse", formationId: "formation-1", vehicleId: "vehicle-1" }))
      .toThrow("配置・予約・運行・回収待ちの編成は編集できません");
  });
});

describe("Checkpoint C: 駅構内配置 MapCommand", () => {
  function createTestMapWithStation() {
    let state = createInitialState();
    state = executeCommand(state, {
      type: "track.create",
      geometry: "straight",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    }).state;
    state = executeCommand(state, {
      type: "station.createRange",
      name: "中央駅",
      trackId: "track-1",
      startPosition: { x: 20, y: 0 },
      endPosition: { x: 80, y: 0 },
    }).state;
    state = executeCommand(state, {
      type: "fleet.formation-template.acquire",
      templateId: "test-single-locomotive",
    }).state;
    return state;
  }

  it("駅停車範囲内への fleet.formation.place と fleet.formation.unplace が成功する", () => {
    let state = createTestMapWithStation();

    const res = executeCommand(state, {
      type: "fleet.formation.place",
      formationId: "formation-1",
      stationId: "station-1",
      trackId: "track-1",
      distanceM: 50,
    });
    state = res.state;

    expect(res.message).toContain("配置しました");
    expect(state.vehiclePlacements).toHaveLength(1);
    const placement = state.vehiclePlacements[0];
    expect(placement.formationId).toBe("formation-1");
    expect(placement.stationId).toBe("station-1");
    expect(placement.trackId).toBe("track-1");
    expect(placement.centerDistanceM).toBe(50);
    expect(placement.occupiedStartDistanceM).toBe(46); // 50 - 8/2 = 46
    expect(placement.occupiedEndDistanceM).toBe(54);   // 50 + 8/2 = 54
    expect(placement.orientation).toBe("forward");

    // 解除
    const unplaceRes = executeCommand(state, {
      type: "fleet.formation.unplace",
      formationId: "formation-1",
    });
    state = unplaceRes.state;
    expect(unplaceRes.message).toContain("解除しました");
    expect(state.vehiclePlacements).toHaveLength(0);
  });

  it("駅停車範囲外の配置は拒否される", () => {
    const state = createTestMapWithStation();

    // 範囲は 20〜80
    expect(() =>
      executeCommand(state, {
        type: "fleet.formation.place",
        formationId: "formation-1",
        stationId: "station-1",
        trackId: "track-1",
        distanceM: 10,
      }),
    ).toThrow("配置位置が駅の停車範囲外です");

    expect(() =>
      executeCommand(state, {
        type: "fleet.formation.place",
        formationId: "formation-1",
        stationId: "station-1",
        trackId: "track-1",
        distanceM: 90,
      }),
    ).toThrow("配置位置が駅の停車範囲外です");
  });

  it("線路範囲を超える配置は拒否される", () => {
    let state = createInitialState();
    // 短い線路 (10m)
    state = executeCommand(state, {
      type: "track.create",
      geometry: "straight",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    }).state;
    state = executeCommand(state, {
      type: "station.createRange",
      name: "短線駅",
      trackId: "track-1",
      startPosition: { x: 0, y: 0 },
      endPosition: { x: 10, y: 0 },
    }).state;
    // テスト旅客3両編成 (8m + 8.5m + 8.5m = 25m)
    state = executeCommand(state, {
      type: "fleet.formation-template.acquire",
      templateId: "test-passenger-3car",
    }).state;

    expect(() =>
      executeCommand(state, {
        type: "fleet.formation.place",
        formationId: "formation-1",
        stationId: "station-1",
        trackId: "track-1",
        distanceM: 5,
      }),
    ).toThrow("配置占有範囲が線路の長さ外へはみ出しています");
  });

  it("同一線路上での配置占有範囲重複は拒否される", () => {
    let state = createTestMapWithStation();
    // 2つ目の編成を取得
    state = executeCommand(state, {
      type: "fleet.formation-template.acquire",
      templateId: "test-single-locomotive",
    }).state; // formation-2

    // formation-1 を distanceM: 50 (46~54) に配置
    state = executeCommand(state, {
      type: "fleet.formation.place",
      formationId: "formation-1",
      stationId: "station-1",
      trackId: "track-1",
      distanceM: 50,
    }).state;

    // formation-2 を distanceM: 52 (48~56) に配置しようとすると重複拒否
    expect(() =>
      executeCommand(state, {
        type: "fleet.formation.place",
        formationId: "formation-2",
        stationId: "station-1",
        trackId: "track-1",
        distanceM: 52,
      }),
    ).toThrow("同一線路上で他の配置編成と占有範囲が重複しています");
  });

  it("空編成の配置は拒否される", () => {
    let state = createTestMapWithStation();
    state = executeCommand(state, { type: "fleet.formation.create", name: "空編成" }).state; // formation-2

    expect(() =>
      executeCommand(state, {
        type: "fleet.formation.place",
        formationId: "formation-2",
        stationId: "station-1",
        trackId: "track-1",
        distanceM: 50,
      }),
    ).toThrow("空の編成は配置できません");
  });

  it("既に配置済みの編成の再配置は拒否される", () => {
    let state = createTestMapWithStation();
    state = executeCommand(state, {
      type: "fleet.formation.place",
      formationId: "formation-1",
      stationId: "station-1",
      trackId: "track-1",
      distanceM: 50,
    }).state;

    expect(() =>
      executeCommand(state, {
        type: "fleet.formation.place",
        formationId: "formation-1",
        stationId: "station-1",
        trackId: "track-1",
        distanceM: 60,
      }),
    ).toThrow("配置済み・予約中・運行中の編成は配置できません");
  });

  it("配置編成のある駅および線路の撤去は拒否される", () => {
    let state = createTestMapWithStation();
    state = executeCommand(state, {
      type: "fleet.formation.place",
      formationId: "formation-1",
      stationId: "station-1",
      trackId: "track-1",
      distanceM: 50,
    }).state;

    expect(() =>
      executeCommand(state, { type: "station.delete", stationId: "station-1" }),
    ).toThrow("配置されている編成（テスト機関車単行編成）があるため駅「中央駅」を撤去できません");

    expect(() =>
      executeCommand(state, { type: "track.delete", trackId: "track-1" }),
    ).toThrow("配置されている編成（テスト機関車単行編成）があるため線路track-1を撤去できません");
  });

  it("stationCenterDistanceMとの関係とR相当のorientation明示が正しく反映される", () => {
    let state = createTestMapWithStation();
    // station-1 の range: 20〜80 => center: 50

    // distance 30 (< 50) => orientation defaults to "reversed"
    let state1 = executeCommand(state, {
      type: "fleet.formation.place",
      formationId: "formation-1",
      stationId: "station-1",
      trackId: "track-1",
      distanceM: 30,
    }).state;
    expect(state1.vehiclePlacements[0].orientation).toBe("reversed");

    // orientation を明示指定 ("forward")
    let state2 = executeCommand(state, {
      type: "fleet.formation.place",
      formationId: "formation-1",
      stationId: "station-1",
      trackId: "track-1",
      distanceM: 30,
      orientation: "forward",
    }).state;
    expect(state2.vehiclePlacements[0].orientation).toBe("forward");
  });
});

describe("Checkpoint D: 経路と発車 MapCommand", () => {
  function createTestMapWithRoute() {
    let state = createInitialState();
    // Track 1: 0~100m
    state = executeCommand(state, {
      type: "track.create",
      geometry: "straight",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    }).state; // track-1

    // Track 2: 100~200m
    state = executeCommand(state, {
      type: "track.create",
      geometry: "straight",
      points: [
        { x: 100, y: 0 },
        { x: 200, y: 0 },
      ],
      startConnectionTrackId: "track-1",
    }).state; // track-2

    // Station A (track-1, 20~80)
    state = executeCommand(state, {
      type: "station.createRange",
      name: "A駅",
      trackId: "track-1",
      startPosition: { x: 20, y: 0 },
      endPosition: { x: 80, y: 0 },
    }).state; // station-1

    // Station B (track-2, 120~180)
    state = executeCommand(state, {
      type: "station.createRange",
      name: "B駅",
      trackId: "track-2",
      startPosition: { x: 120, y: 0 },
      endPosition: { x: 180, y: 0 },
    }).state; // station-2

    // Route: A駅 -> B駅
    state = executeCommand(state, {
      type: "route.create",
      name: "A-B線",
      stationIds: ["station-1", "station-2"],
    }).state; // route-1

    // Formation: 1-car locomotive
    state = executeCommand(state, {
      type: "fleet.formation-template.acquire",
      templateId: "test-single-locomotive",
    }).state; // formation-1

    return state;
  }

  it("配置駅から始まる経路だけを選択・予約できる（始発駅・始発線路一致検証）", () => {
    let state = createTestMapWithRoute();

    // station-2 (B駅) に配置
    state = executeCommand(state, {
      type: "fleet.formation.place",
      formationId: "formation-1",
      stationId: "station-2",
      trackId: "track-2",
      distanceM: 50,
    }).state;

    // A駅始発のroute-1への予約は始発駅不一致で拒否される
    expect(() =>
      executeCommand(state, {
        type: "fleet.dispatch.reserve",
        formationId: "formation-1",
        routeId: "route-1",
        departureTimeMs: state.clock.currentTimeMs + 10000,
      })
    ).toThrow("配置駅（station-2）が運行経路の始発駅（station-1）と一致しません");
  });

  it("即時発車（departureTimeMs <= currentTimeMs）で列車が生成され配置が解除される", () => {
    let state = createTestMapWithRoute();

    // station-1 に配置
    state = executeCommand(state, {
      type: "fleet.formation.place",
      formationId: "formation-1",
      stationId: "station-1",
      trackId: "track-1",
      distanceM: 50,
    }).state;

    const res = executeCommand(state, {
      type: "fleet.dispatch.reserve",
      formationId: "formation-1",
      routeId: "route-1",
      departureTimeMs: state.clock.currentTimeMs,
      requestedSpeedKph: 100,
      dwellSeconds: 5,
    });
    state = res.state;

    expect(res.message).toContain("即時発車しました");
    expect(state.vehiclePlacements).toHaveLength(0); // 配置解除
    expect(state.operatingTrains).toHaveLength(1);
    expect(state.operatingTrains[0].formationId).toBe("formation-1");
    expect(state.operatingTrains[0].speedKph).toBe(100);
    expect(Object.values(state.trainRuns)[0].status).toBe("operating");
  });

  it("未来の絶対日時一回予約が作成・取消できる", () => {
    let state = createTestMapWithRoute();
    state = executeCommand(state, {
      type: "fleet.formation.place",
      formationId: "formation-1",
      stationId: "station-1",
      trackId: "track-1",
      distanceM: 50,
    }).state;

    const departureTime = state.clock.currentTimeMs + 60000;
    const res = executeCommand(state, {
      type: "fleet.dispatch.reserve",
      formationId: "formation-1",
      routeId: "route-1",
      departureTimeMs: departureTime,
    });
    state = res.state;

    expect(res.message).toContain("発車予約を作成しました");
    const run = Object.values(state.trainRuns)[0];
    expect(run).toBeDefined();
    expect(run.status).toBe("reserved");
    expect(state.vehiclePlacements).toHaveLength(1); // 発車前は配置維持

    // 予約取消
    const cancelRes = executeCommand(state, {
      type: "fleet.dispatch.cancel",
      reservationId: run.id,
    });
    state = cancelRes.state;
    expect(cancelRes.message).toContain("キャンセルしました");
    expect(Object.values(state.trainRuns)[0].status).toBe("cancelled");
    expect(state.vehiclePlacements).toHaveLength(1); // 配置は維持
  });

  it("tickで予約時刻に一度だけ発車し大きなtickでも一度だけ実行される", () => {
    let state = createTestMapWithRoute();
    state = executeCommand(state, {
      type: "fleet.formation.place",
      formationId: "formation-1",
      stationId: "station-1",
      trackId: "track-1",
      distanceM: 50,
    }).state;

    const departureTime = state.clock.currentTimeMs + 30000; // 30秒後
    state = executeCommand(state, {
      type: "fleet.dispatch.reserve",
      formationId: "formation-1",
      routeId: "route-1",
      departureTimeMs: departureTime,
    }).state;

    // 20秒経過 -> まだ発車しない
    state = executeCommand(state, { type: "simulation.tick", elapsedSeconds: 20 }).state;
    expect(state.operatingTrains).toHaveLength(0);
    expect(Object.values(state.trainRuns)[0].status).toBe("reserved");

    // さらに 300秒（大きなtick）経過 -> 予約時刻 (30秒) で発車し、その後走行
    state = executeCommand(state, { type: "simulation.tick", elapsedSeconds: 300 }).state;
    expect(["operating", "completed"]).toContain(Object.values(state.trainRuns)[0].status);
    expect(state.operatingTrains).toHaveLength(1);
    expect(state.vehiclePlacements).toHaveLength(1); // 終着駅 (B駅) に自動再配置されている
  });

  it("実行時に配置が削除されていた場合はfailed理由を保持し列車は生成されない", () => {
    let state = createTestMapWithRoute();
    state = executeCommand(state, {
      type: "fleet.formation.place",
      formationId: "formation-1",
      stationId: "station-1",
      trackId: "track-1",
      distanceM: 50,
    }).state;

    const departureTime = state.clock.currentTimeMs + 10000;
    state = executeCommand(state, {
      type: "fleet.dispatch.reserve",
      formationId: "formation-1",
      routeId: "route-1",
      departureTimeMs: departureTime,
    }).state;

    // 直接 placements から配置を削除して不正状態を作成
    state.vehiclePlacements = [];

    // tick で予約時刻へ到達
    state = executeCommand(state, { type: "simulation.tick", elapsedSeconds: 15 }).state;

    expect(Object.values(state.trainRuns)[0].status).toBe("failed");
    expect(Object.values(state.trainRuns)[0].failureReason).toContain("placement-missing");
    expect(state.operatingTrains).toHaveLength(0);
  });

  it("終着後に編成が終着駅の空き位置へ自動配置される", () => {
    let state = createTestMapWithRoute();
    state = executeCommand(state, {
      type: "fleet.formation.place",
      formationId: "formation-1",
      stationId: "station-1",
      trackId: "track-1",
      distanceM: 50,
    }).state;

    // 即時発車 (スピードを高めにして全区間走破させる)
    state = executeCommand(state, {
      type: "fleet.dispatch.reserve",
      formationId: "formation-1",
      routeId: "route-1",
      departureTimeMs: state.clock.currentTimeMs,
      requestedSpeedKph: 200,
      dwellSeconds: 1,
    }).state;

    expect(state.vehiclePlacements).toHaveLength(0);

    // 時間を十分に進めて列車を終着させる (経路長 約200m)
    state = executeCommand(state, { type: "simulation.tick", elapsedSeconds: 100 }).state;

    expect(state.operatingTrains[0].state).toBe("completed");
    expect(state.vehiclePlacements).toHaveLength(1);
    expect(state.vehiclePlacements[0].stationId).toBe("station-2");
    expect(state.vehiclePlacements[0].trackId).toBe("track-2");
  });

  it("終着駅に空き位置がない場合は回収待ち状態として保持され空きができたtickで自動配置される", () => {
    let state = createTestMapWithRoute();

    // 2つ目の編成を取得
    state = executeCommand(state, {
      type: "fleet.formation-template.acquire",
      templateId: "test-single-locomotive",
    }).state; // formation-2

    // formation-2 を終着駅 (B駅: station-2, track-2, distanceM: 50) の停車位置へ前もって配置して塞いでおく
    state = executeCommand(state, {
      type: "fleet.formation.place",
      formationId: "formation-2",
      stationId: "station-2",
      trackId: "track-2",
      distanceM: 50,
    }).state;

    // formation-1 を始発駅 (A駅: station-1, track-1, 50m) に配置
    state = executeCommand(state, {
      type: "fleet.formation.place",
      formationId: "formation-1",
      stationId: "station-1",
      trackId: "track-1",
      distanceM: 50,
    }).state;

    // formation-1 を発車
    state = executeCommand(state, {
      type: "fleet.dispatch.reserve",
      formationId: "formation-1",
      routeId: "route-1",
      departureTimeMs: state.clock.currentTimeMs,
      requestedSpeedKph: 200,
      dwellSeconds: 1,
    }).state;

    // 終着まで進める
    state = executeCommand(state, { type: "simulation.tick", elapsedSeconds: 100 }).state;

    expect(state.operatingTrains[0].state).toBe("completed");
    // formation-1 は終着駅に空きがないため再配置できず、配置は formation-2 の1つだけ
    expect(state.vehiclePlacements).toHaveLength(1);
    expect(state.vehiclePlacements[0].formationId).toBe("formation-2");

    // 障害となっている formation-2 の配置を解除する
    state = executeCommand(state, {
      type: "fleet.formation.unplace",
      formationId: "formation-2",
    }).state;

    // 次の tick で完成列車の自動再配置が試行される
    state = executeCommand(state, { type: "simulation.tick", elapsedSeconds: 1 }).state;

    expect(state.vehiclePlacements).toHaveLength(1);
    expect(state.vehiclePlacements[0].formationId).toBe("formation-1");
    expect(state.vehiclePlacements[0].stationId).toBe("station-2");
  });
});
