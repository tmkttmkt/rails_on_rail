import fs from "node:fs";
import { executeCommand, type MapCommand } from "../src/simulation/commands";
import { createInitialState } from "../src/simulation/model";
import { createSaveFile, serializeSaveFile } from "../src/simulation/persistence";
import { RailsAiClient } from "./ai-client";

async function main() {
  let state = createInitialState();
  const run = (command: MapCommand): void => { state = executeCommand(state, command).state; };

  // 蒸気機関車向けの低規格
  const specification = {
    gaugeId: "gauge-1067mm",
    railProfileId: "jis-37a",
    supportSystemId: "timber-sleeper-direct-ballast",
    roadbedId: "standard-drained-roadbed",
  };

  const track = (command: Extract<MapCommand, { type: "track.create" }>): void => run({
    ...command,
    specification,
    designSpeedKmh: command.designSpeedKmh ?? 65,
  });

  // ==========================================
  // 単線環状本線 (大規模)
  // ==========================================
  track({ type: "track.create", geometry: "straight", points: [{ x: -900, y: -500 }, { x: 900, y: -500 }], designSpeedKmh: 85 }); // track-1
  track({ type: "track.create", geometry: "curve", points: [{ x: 900, y: -500 }, { x: 1400, y: 0 }, { x: 900, y: 500 }], startConnectionTrackId: "track-1", startTangent: { x: 1, y: 0 }, endTangent: { x: -1, y: 0 }, designSpeedKmh: 85 }); // track-2
  track({ type: "track.create", geometry: "straight", points: [{ x: 900, y: 500 }, { x: -900, y: 500 }], startConnectionTrackId: "track-2" }); // track-3
  track({ type: "track.create", geometry: "curve", points: [{ x: -900, y: 500 }, { x: -1400, y: 0 }, { x: -900, y: -500 }], startConnectionTrackId: "track-3", endConnectionTrackId: "track-1", startTangent: { x: -1, y: 0 }, endTangent: { x: 1, y: 0 }, designSpeedKmh: 85 }); // track-4

  // 各駅の待避線（交換設備）
  // 中央北 待避線 (緩やかな分岐)
  track({ type: "track.create", geometry: "curve", points: [{ x: -300, y: -500 }, { x: -150, y: -520 }, { x: 150, y: -520 }, { x: 300, y: -500 }], startConnectionTrackId: "track-1", endConnectionTrackId: "track-1", startTangent: { x: 1, y: 0 }, endTangent: { x: 1, y: 0 }, designSpeedKmh: 55 }); // track-5
  // 中央南 待避線 (緩やかな分岐)
  track({ type: "track.create", geometry: "curve", points: [{ x: 300, y: 500 }, { x: 150, y: 480 }, { x: -150, y: 480 }, { x: -300, y: 500 }], startConnectionTrackId: "track-3", endConnectionTrackId: "track-3", startTangent: { x: -1, y: 0 }, endTangent: { x: -1, y: 0 }, designSpeedKmh: 55 }); // track-6

  // ==========================================
  // 南北支線と港湾支線 (単線)
  // ==========================================
  // 北への支線 (曲率を大幅に緩和)
  track({ type: "track.create", geometry: "curve", points: [{ x: 0, y: -500 }, { x: 100, y: -650 }, { x: 200, y: -1000 }], startConnectionTrackId: "track-1", startTangent: { x: 1, y: 0 }, endTangent: { x: 0, y: -1 }, designSpeedKmh: 65 }); // track-7
  track({ type: "track.create", geometry: "straight", points: [{ x: 200, y: -1000 }, { x: 200, y: -1800 }], startConnectionTrackId: "track-7", designSpeedKmh: 75 }); // track-8

  // 港湾への支線 (大きく迂回するS字カーブで曲率を緩和)
  track({ type: "track.create", geometry: "curve", points: [{ x: 450, y: 500 }, { x: 800, y: 700 }, { x: 1500, y: 900 }], startConnectionTrackId: "track-3", startTangent: { x: -1, y: 0 }, endTangent: { x: 1, y: 0 }, designSpeedKmh: 55 }); // track-9
  track({ type: "track.create", geometry: "straight", points: [{ x: 1500, y: 900 }, { x: 2200, y: 900 }], startConnectionTrackId: "track-9", designSpeedKmh: 75 }); // track-10

  // ==========================================
  // 貨物ヤード・機関区留置線 (蒸気機関車用)
  // ==========================================
  // ヤード引き上げ線 (曲率緩和)
  track({ type: "track.create", geometry: "curve", points: [{ x: -350, y: 500 }, { x: -500, y: 650 }, { x: -650, y: 820 }], startConnectionTrackId: "track-3", startTangent: { x: -1, y: 0 }, endTangent: { x: 0, y: 1 }, designSpeedKmh: 45 }); // track-11

  // ヤード・ラダー線
  track({ type: "track.create", geometry: "straight", points: [{ x: -650, y: 820 }, { x: -650, y: 1100 }], startConnectionTrackId: "track-11", designSpeedKmh: 35 }); // track-12

  // 留置線群（曲率半径150m程度のなめらかな分岐曲線へ変更）
  for (let index = 0; index < 6; index += 1) {
    const yLadder = 820 + index * 25; // ラダー線上の分岐間隔
    const yStorage = yLadder + 150;  // 大きなカーブを描くための十分な距離

    // 分岐曲線（Turnout）
    track({ type: "track.create", geometry: "curve", points: [{ x: -650, y: yLadder }, { x: -725, y: yLadder + 75 }, { x: -800, y: yStorage }], startConnectionTrackId: "track-12", startTangent: { x: 0, y: 1 }, endTangent: { x: -1, y: 0 }, designSpeedKmh: 25 });
    // 留置直線（Storage Track）
    track({ type: "track.create", geometry: "straight", points: [{ x: -800, y: yStorage }, { x: -1600, y: yStorage }], startConnectionTrackId: `track-${13 + index * 2}`, designSpeedKmh: 25 });
  }

  // ==========================================
  // 駅の設置
  // ==========================================
  const station = (name: string, trackId: string, startPosition: { x: number; y: number }, endPosition: { x: number; y: number }, includeTrackGroup = true): void => {
    run({ type: "station.createRange", name, trackId, startPosition, endPosition, includeTrackGroup });
  };

  station("中央北", "track-1", { x: -150, y: -500 }, { x: 150, y: -500 });
  station("中央北待避", "track-5", { x: -120, y: -520 }, { x: 120, y: -520 });
  run({ type: "station.merge", stationIds: ["station-1", "station-2"] });

  station("中央南", "track-3", { x: 150, y: 500 }, { x: -150, y: 500 });
  station("中央南待避", "track-6", { x: 120, y: 480 }, { x: -120, y: 480 });
  run({ type: "station.merge", stationIds: ["station-3", "station-4"] });

  station("東環状", "track-2", { x: 1300, y: -180 }, { x: 1300, y: 180 });
  station("西環状", "track-4", { x: -1300, y: 180 }, { x: -1300, y: -180 });

  // 座標シフトに伴う駅位置の修正
  station("北新都心", "track-8", { x: 200, y: -1300 }, { x: 200, y: -1600 });
  station("港湾ヤード", "track-10", { x: 1600, y: 900 }, { x: 1900, y: 900 });

  // ヤードの一番北側の留置線（track-14）に駅を設置
  station("蒸気機関区・総合貨物", "track-14", { x: -900, y: 970 }, { x: -1400, y: 970 }, false);

  const saveName = "大規模マップ（曲率緩和・リアル蒸気機関車用）";
  const save = createSaveFile(saveName, state);

  console.log(`[生成] ${saveName} を生成しました (Tracks: ${state.tracks.length}, Stations: ${state.stations.length})`);
  console.log("[確認API] 検査API(inspectSave)へ送信中...");

  const client = new RailsAiClient();

  try {
    const inspection = await client.inspectSave(save);
    console.log("[確認API] 結果 (MapRadiusInspection):");
    console.log(JSON.stringify(inspection, null, 2));

    if (inspection.topology.isolatedTrackIds.length > 0) {
      console.warn("警告: 孤立した線路があります:", inspection.topology.isolatedTrackIds);
    }
    if (inspection.topology.unconnectedEndpoints.length > 0) {
      console.warn("警告: 接続されていない終端があります:", inspection.topology.unconnectedEndpoints.length, "箇所");
    }

    console.log("[保存API] サーバーにセーブデータを送信して保存します...");
    const result = await client.createSave(saveName, state);
    console.log(`[保存成功] ID=${result.id}, Revision=${result.revision}`);
  } catch (err) {
    console.error("[エラー]", err);
  }
}

main();
