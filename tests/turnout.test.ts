import { describe, expect, it } from "vitest";
import { createInitialState, type MapState } from "../src/simulation/model";
import { executeCommand, type MapCommand } from "../src/simulation/commands";
import { calculateTangentAngleDifferenceRad, getTrackTangentAtPosition, TANGENT_ANGLE_TOLERANCE_RAD } from "../src/simulation/geometry";
import { inspectTrackRadii } from "../src/simulation/inspection";
import { createSaveFile, parseMapState, parseSaveFile, serializeSaveFile, validateMapState } from "../src/simulation/persistence";
import { trackCatalog } from "../src/data/trackCatalog";

const SPEC = {
  gaugeId: "gauge-1067mm",
  railProfileId: "jis-50n",
  supportSystemId: "pc-sleeper-ballast",
  roadbedId: "reinforced-roadbed",
};

function baseState(): MapState {
  const state = createInitialState();
  return executeCommand(state, {
    type: "track.create",
    geometry: "straight",
    points: [{ x: 0, y: 0 }, { x: 2000, y: 0 }],
    specification: SPEC,
    designSpeedKmh: 120,
  }).state;
}

const place = (state: MapState, command: Partial<Extract<MapCommand, { type: "turnout.create" }>> = {}): MapState =>
  executeCommand(state, {
    type: "turnout.create",
    trackId: "track-1",
    position: { x: 500, y: 0 },
    typeId: "turnout-no12",
    side: "right",
    ...command,
  }).state;

describe("転てつ器", () => {
  it("線路上へ番数を指定して設置すると分岐側線路と接続点を生成する", () => {
    const state = place(baseState());
    expect(state.turnouts).toHaveLength(1);
    const turnout = state.turnouts[0];
    expect(turnout.typeId).toBe("turnout-no12");
    expect(turnout.throughTrackId).toBe("track-1");
    expect(state.tracks).toHaveLength(2);

    const junction = state.junctions.find((item) => item.id === turnout.junctionId);
    expect(junction).toBeDefined();
    const portTrackIds = junction!.ports.map((port) => port.trackId).sort();
    expect(portTrackIds).toEqual([turnout.divergingTrackId, turnout.throughTrackId].sort());
  });

  it("分岐点で基準線と接線連続な分岐側線形を生成する", () => {
    const state = place(baseState());
    const turnout = state.turnouts[0];
    const base = state.tracks.find((t) => t.id === turnout.throughTrackId)!;
    const diverging = state.tracks.find((t) => t.id === turnout.divergingTrackId)!;
    const origin = diverging.points[0];

    const baseTangent = getTrackTangentAtPosition(base, origin);
    const divergingTangent = { x: diverging.points[1].x - origin.x, y: diverging.points[1].y - origin.y };
    expect(isFinite(calculateTangentAngleDifferenceRad(baseTangent, divergingTangent))).toBe(true);
    expect(calculateTangentAngleDifferenceRad(baseTangent, divergingTangent)).toBeLessThan(TANGENT_ANGLE_TOLERANCE_RAD);

    const topology = inspectTrackRadii(state).topology;
    expect(topology.invalidConnections).toHaveLength(0);
    expect(topology.connectedComponents).toHaveLength(1);
    expect(topology.isolatedTrackIds).toHaveLength(0);
  });

  it("カタログの半径どおりに分岐側を敷設し、番数が大きいほど半径と制限速度が大きい", () => {
    for (const typeId of ["turnout-no8", "turnout-no12", "turnout-no18"]) {
      const state = place(baseState(), { typeId });
      const type = trackCatalog.getTurnoutType(typeId);
      const diverging = state.tracks.find((t) => t.id === state.turnouts[0].divergingTrackId)!;
      expect(diverging.engineering.builtMinimumRadiusM).toBeCloseTo(type.divergingRadiusM, 0);
      expect(diverging.engineering.designSpeedKmh).toBe(type.divergingSpeedKmh);
    }
    const no8 = trackCatalog.getTurnoutType("turnout-no8");
    const no18 = trackCatalog.getTurnoutType("turnout-no18");
    expect(no18.divergingRadiusM).toBeGreaterThan(no8.divergingRadiusM);
    expect(no18.divergingSpeedKmh).toBeGreaterThan(no8.divergingSpeedKmh);
  });

  it("left と right で分岐側が基準線の反対へ向かう", () => {
    const right = place(baseState(), { side: "right" });
    const left = place(baseState(), { side: "left" });
    const endOf = (state: MapState) => {
      const track = state.tracks.find((t) => t.id === state.turnouts[0].divergingTrackId)!;
      return track.points[track.points.length - 1];
    };
    expect(endOf(right).y).toBeGreaterThan(0);
    expect(endOf(left).y).toBeLessThan(0);
    expect(endOf(right).x).toBeCloseTo(endOf(left).x, 6);
  });

  it("存在しない転てつ器形式を拒否する", () => {
    expect(() => place(baseState(), { typeId: "turnout-no999" })).toThrow(/転てつ器形式が存在しません/);
  });

  it("撤去すると分岐側線路と接続点が残らない", () => {
    const state = place(baseState());
    const turnout = state.turnouts[0];
    const after = executeCommand(state, { type: "turnout.delete", turnoutId: turnout.id }).state;
    expect(after.turnouts).toHaveLength(0);
    expect(after.tracks.map((t) => t.id)).not.toContain(turnout.divergingTrackId);
    expect(after.junctions.map((j) => j.id)).not.toContain(turnout.junctionId);
    validateMapState(after);
  });

  it("保存して読み込んでも転てつ器が保持される", () => {
    const state = place(baseState());
    const restored = parseSaveFile(serializeSaveFile(createSaveFile("転てつ器", state))).state;
    expect(restored.version).toBe(12);
    expect(restored.turnouts).toEqual(state.turnouts);
  });

  it("version 11 のセーブへ空の転てつ器一覧を補ってversion 12へ移行する", () => {
    const state = baseState();
    const raw: Record<string, unknown> = JSON.parse(JSON.stringify(state));
    raw.version = 11;
    delete raw.turnouts;
    delete raw.nextTurnoutId;

    const migrated = parseMapState(JSON.stringify(raw));
    expect(migrated.version).toBe(12);
    expect(migrated.turnouts).toEqual([]);
    expect(migrated.nextTurnoutId).toBe(1);
    expect(migrated.tracks).toHaveLength(1);
  });
});
