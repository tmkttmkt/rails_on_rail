import type { MapState } from "./model";
import { getServiceSystemDisplayColor, type Line, type ServiceSystem } from "./serviceModel";
import { assertLineCanBeDeleted, assertServicePatternCanBeDeleted } from "./guards";

export function validateLine(line: Line): void {
  if (!line || typeof line !== "object") throw new Error("路線データが不正です");
  if (!line.id || typeof line.id !== "string") throw new Error("路線IDが不正です");
  const name = (line.name ?? "").trim();
  if (name.length < 1 || name.length > 80) throw new Error("路線名は1〜80文字で指定してください");
  if (!line.color || typeof line.color !== "string") throw new Error("路線色を指定してください");
  if (!Number.isFinite(line.displayOrder)) throw new Error("表示順は有限数で指定してください");
}

export function validateServiceSystem(system: ServiceSystem, lines: Record<string, Line>): void {
  if (!system || typeof system !== "object") throw new Error("系統データが不正です");
  if (!system.id || typeof system.id !== "string") throw new Error("系統IDが不正です");
  if (!system.lineId || !lines[system.lineId]) {
    throw new Error(`ERR_LINE_NOT_FOUND: 所属路線 (${system.lineId}) が存在しません`);
  }
  const name = (system.name ?? "").trim();
  if (name.length < 1 || name.length > 80) throw new Error("系統名は1〜80文字で指定してください");
  if (!Number.isFinite(system.displayOrder)) throw new Error("表示順は有限数で指定してください");
}

export function createLine(
  state: MapState,
  payload: { id?: string; name: string; code?: string; color: string; displayOrder?: number }
): { state: MapState; line: Line } {
  const name = payload.name.trim();
  if (!name) throw new Error("路線名を入力してください");
  if (!payload.color) throw new Error("路線色を指定してください");

  const id = payload.id || `line-${state.nextLineId++}`;
  if (state.lines[id]) throw new Error(`路線ID ${id} は既に存在します`);

  const displayOrder = payload.displayOrder ?? Object.keys(state.lines).length + 1;
  const now = state.clock.currentTimeMs;

  const line: Line = {
    id,
    name,
    code: payload.code?.trim() || undefined,
    color: payload.color,
    displayOrder,
    createdAtGameTimeMs: now,
    updatedAtGameTimeMs: now,
  };

  validateLine(line);
  state.lines[id] = line;
  return { state, line };
}

export function updateLine(
  state: MapState,
  payload: { id: string; name?: string; code?: string; color?: string; displayOrder?: number }
): { state: MapState; line: Line } {
  const line = state.lines[payload.id];
  if (!line) throw new Error(`ERR_LINE_NOT_FOUND: 指定された路線 (${payload.id}) が見つかりません`);

  if (payload.name !== undefined) {
    const name = payload.name.trim();
    if (!name) throw new Error("路線名を空にすることはできません");
    line.name = name;
  }
  if (payload.code !== undefined) {
    line.code = payload.code.trim() || undefined;
  }
  if (payload.color !== undefined) {
    if (!payload.color.trim()) throw new Error("路線色を空にすることはできません");
    line.color = payload.color;
  }
  if (payload.displayOrder !== undefined) {
    if (!Number.isFinite(payload.displayOrder)) throw new Error("表示順が無効です");
    line.displayOrder = payload.displayOrder;
  }

  line.updatedAtGameTimeMs = state.clock.currentTimeMs;
  validateLine(line);
  return { state, line };
}

export function deleteLine(state: MapState, lineId: string): { state: MapState } {
  const line = state.lines[lineId];
  if (!line) throw new Error(`ERR_LINE_NOT_FOUND: 指定された路線 (${lineId}) が見つかりません`);

  assertLineCanBeDeleted(state, lineId);

  delete state.lines[lineId];
  return { state };
}

export function createServiceSystem(
  state: MapState,
  payload: {
    id?: string;
    lineId: string;
    name: string;
    shortName?: string;
    color?: string;
    description?: string;
    displayOrder?: number;
  }
): { state: MapState; serviceSystem: ServiceSystem } {
  const line = state.lines[payload.lineId];
  if (!line) throw new Error(`ERR_LINE_NOT_FOUND: 所属路線 (${payload.lineId}) が存在しません`);

  const name = payload.name.trim();
  if (!name) throw new Error("系統名を入力してください");

  const id = payload.id || `sys-${state.nextServiceSystemId++}`;
  if (state.serviceSystems[id]) throw new Error(`系統ID ${id} は既に存在します`);

  const displayOrder =
    payload.displayOrder ??
    Object.values(state.serviceSystems || {}).filter((s) => s.lineId === payload.lineId).length + 1;
  const now = state.clock.currentTimeMs;

  const serviceSystem: ServiceSystem = {
    id,
    lineId: payload.lineId,
    name,
    shortName: payload.shortName?.trim() || undefined,
    color: payload.color?.trim() || undefined,
    description: payload.description?.trim() || undefined,
    displayOrder,
    createdAtGameTimeMs: now,
    updatedAtGameTimeMs: now,
  };

  validateServiceSystem(serviceSystem, state.lines);
  state.serviceSystems[id] = serviceSystem;
  return { state, serviceSystem };
}

export function updateServiceSystem(
  state: MapState,
  payload: {
    id: string;
    name?: string;
    shortName?: string;
    color?: string;
    description?: string;
    displayOrder?: number;
  }
): { state: MapState; serviceSystem: ServiceSystem } {
  const system = state.serviceSystems[payload.id];
  if (!system) throw new Error(`ERR_SERVICE_SYSTEM_NOT_FOUND: 指定された系統 (${payload.id}) が見つかりません`);

  if (payload.name !== undefined) {
    const name = payload.name.trim();
    if (!name) throw new Error("系統名を空にすることはできません");
    system.name = name;
  }
  if (payload.shortName !== undefined) {
    system.shortName = payload.shortName.trim() || undefined;
  }
  if (payload.color !== undefined) {
    system.color = payload.color.trim() || undefined;
  }
  if (payload.description !== undefined) {
    system.description = payload.description.trim() || undefined;
  }
  if (payload.displayOrder !== undefined) {
    if (!Number.isFinite(payload.displayOrder)) throw new Error("表示順が無効です");
    system.displayOrder = payload.displayOrder;
  }

  system.updatedAtGameTimeMs = state.clock.currentTimeMs;
  validateServiceSystem(system, state.lines);
  return { state, serviceSystem: system };
}

export function deleteServiceSystem(state: MapState, systemId: string): { state: MapState } {
  const system = state.serviceSystems[systemId];
  if (!system) throw new Error(`ERR_SERVICE_SYSTEM_NOT_FOUND: 指定された系統 (${systemId}) が見つかりません`);

  assertServicePatternCanBeDeleted(state, systemId);

  delete state.serviceSystems[systemId];
  return { state };
}

export { getServiceSystemDisplayColor as getServiceSystemEffectiveColor };
