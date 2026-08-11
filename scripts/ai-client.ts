import type { MapState, Point } from "../src/simulation/model";
import type { MapCommand } from "../src/simulation/commands";
import type { SaveFile } from "../src/simulation/persistence";

export interface ServerSaveSummary {
  id: string;
  revision: number;
  filename: string;
  metadata: SaveFile["metadata"];
}

/**
 * Rails on Rail - AIエージェント向けクライアントライブラリ
 * 
 * Vite開発サーバーの /api に接続し、外部のAI（またはスクリプト）から
 * 実行中のゲームを直接操作・観察するための関数群を提供します。
 */
export class RailsAiClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:5173') {
    this.baseUrl = baseUrl;
  }

  async listSaves(): Promise<ServerSaveSummary[]> {
    const res = await fetch(`${this.baseUrl}/api/server-saves`);
    if (!res.ok) throw new Error("Failed to list save files");
    return res.json();
  }

  async fetchSave(id: string): Promise<{ save: SaveFile; revision: number }> {
    const res = await fetch(`${this.baseUrl}/api/server-saves/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error("Failed to fetch save file");
    return { save: await res.json(), revision: Number.parseInt(res.headers.get("ETag")?.replaceAll('"', '') ?? "1", 10) };
  }

  async createSave(name: string, state: MapState): Promise<{ id: string; revision: number }> {
    const saveFile = {
      formatVersion: 1,
      metadata: { name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      state
    } satisfies SaveFile;
    const res = await fetch(`${this.baseUrl}/api/server-saves`, {
      method: "POST",
      body: JSON.stringify(saveFile),
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error("Failed to create save file");
    return res.json();
  }

  async updateSave(id: string, expectedRevision: number, save: SaveFile): Promise<{ id: string; revision: number }> {
    const res = await fetch(`${this.baseUrl}/api/server-saves`, {
      method: "POST",
      body: JSON.stringify({ saveId: id, expectedRevision, save }),
      headers: { "Content-Type": "application/json" },
    });
    if (res.status === 409) throw new Error("Save revision conflict");
    if (!res.ok) throw new Error("Failed to update save file");
    return res.json();
  }

  // ==========================================
  // AI向け 軌道・空間操作マクロ群（Phase -1用）
  // ==========================================

  /**
   * マクロ: 未接続の線路の端点を探す
   */
  findUnconnectedEndpoints(state: MapState): Point[] {
    const endpoints: Point[] = [];
    for (const track of state.tracks) {
      if (!track.startConnection) endpoints.push(track.points[0]);
      if (!track.endConnection) endpoints.push(track.points[track.points.length - 1]);
    }
    return endpoints;
  }

  /**
   * マクロ: 2点間に直線を引くコマンドを生成
   */
  buildLineCommand(startPt: Point, endPt: Point, trackCount: number = 1): MapCommand {
    return {
      type: "track.create",
      geometry: "straight",
      points: [startPt, endPt],
      trackCount,
    };
  }

  /**
   * マクロ: 線路の中央に駅を配置するコマンドを生成
   * ※実際の駅座標はシミュレーションロジックを用いて計算する
   */
  buildStationCommand(trackId: string, name: string, startPosition: Point, endPosition: Point): MapCommand {
    return {
      type: "station.createRange",
      name: name,
      trackId,
      startPosition,
      endPosition,
      includeTrackGroup: true
    };
  }
}
