import "./style.css";
import { trackCatalog, type TrackSpecification } from "./data/trackCatalog";
import { alignPathEndsToConnection, alignPathsToConnection, centeredConnectionCandidateIndex, connectionCandidateCount, connectionCandidateIndexFromSelectedTrack, executeCommand, findTrackGroup, type MapCommand } from "./simulation/commands";
import { analyzeTrackLines, closestPointOnSegment, createParallelLines, findAllNearbyTrackEndpoints, findNearestStraightStartPoint, findNearestTrackEndpoint, findNearestTrackPoint, projectPointToAxis, recommendedCantMm, sampleTrack, type NearestTrackPoint } from "./simulation/geometry";
import {
  createInitialCamera,
  createInitialState,
  screenToWorld,
  zoomAt,
  type Camera,
  type MapState,
  type Point,
  type TrackGeometry,
  type Viewport,
} from "./simulation/model";
import { drawMap, type PlacementPreviewState } from "./ui/renderer";
import { createSaveFile, parseMapState, parseSaveFile, serializeSaveFile, validateSaveName, type SaveSlot } from "./simulation/persistence";
import { isTextEntryTarget, matchesKey, shortcutLabel } from "./ui/keybindings";
import { getFormationLengthM, type Orientation } from "./simulation/fleet";
import { createInitialFleetUiState, parseGameTimeText, type FleetUiState } from "./ui/fleetView";
import { renderFleetLeftPanel, renderFleetRightPanel } from "./ui/fleetPanel";
import { createInitialLineUiState, renderLineLeftPanel, renderLineRightPanel, type LineUiState } from "./ui/linePanel";
import { createInitialRouteUiState, renderRouteLeftPanel, renderRouteRightPanel, type RouteUiState } from "./ui/routePanel";
import { createInitialScheduleUiState, renderScheduleLeftPanel, renderScheduleRightPanel, type ScheduleUiState } from "./ui/schedulePanel";
import { createInitialVehicleDutyUiState, renderVehicleDutyLeftPanel, renderVehicleDutyRightPanel, type VehicleDutyUiState } from "./ui/vehicleDutyPanel";
import { getServiceSystemsByLine } from "./simulation/selectors";
import { buildOperationRoute } from "./simulation/pathfinding";

type Tool = "track" | "station" | "placement";
type AppMode = "map" | "construction" | "line" | "route" | "schedule" | "vehicleDuty" | "facility" | "vehicle" | "management" | "statistics";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("#app がありません");

app.innerHTML = `
  <header class="topbar">
    <div class="brand"><span class="brand-mark">R</span><div><strong>Rails on Rail</strong><small>鉄道計画</small></div></div>
    <nav class="mode-tabs" aria-label="モード"><button data-mode="map">地図</button><button data-mode="construction" class="active">建設</button><button data-mode="line">路線・系統</button><button data-mode="route">経路</button><button data-mode="schedule">運行</button><button data-mode="vehicleDuty">運用</button><button data-mode="facility" disabled>施設</button><button data-mode="vehicle">車両</button><button data-mode="management" disabled>経営</button><button data-mode="statistics" disabled>統計</button></nav><div class="time-controls" aria-label="ゲーム内時間"><strong id="simulation-time">1900/01/01 06:00:00</strong><button id="time-toggle" title="時間を進行・一時停止 (Space)">▶</button><button data-time-speed="1">1×</button><button data-time-speed="60">60×</button><button data-time-speed="300">300×</button><button data-time-speed="1800">1800×</button></div><div class="topbar-actions"><button id="save-manager-open" title="セーブ管理">💾</button><button id="import-save" title="取込">📥</button><input id="import-file" type="file" accept="application/json,.json" hidden></div>
    <div class="coordinates"><span>座標</span><strong id="coordinates">X 0 · Y 0</strong></div>
  </header>
  <main>
    <aside class="panel tools" id="tools-panel">
      <div id="construction-tools">
        <p class="eyebrow">建設</p>
        <button data-tool="track"><span>T</span><div><strong>線路を敷設</strong><small>線形区間を順番に確定</small></div></button>
        <button data-tool="station"><span>B</span><div><strong>駅を設置</strong><small>線路上に停車地点を作成</small></div></button>
        <div id="station-scope-control" hidden><p class="eyebrow geometry-title">駅の対象</p><div class="geometry-switch"><button data-station-scope="single">一本のみ</button><button data-station-scope="bundle" class="active">束すべて</button></div></div>
        <div id="track-options">
        <p class="eyebrow geometry-title">線形</p>
        <div class="geometry-switch"><button data-geometry="straight" class="active">直線</button><button data-geometry="curve">曲線</button></div>
        <div class="track-count-control"><label for="track-count-input">同時敷設本数</label><div><button id="count-down">−</button><input id="track-count-input" type="number" min="1" max="8" value="1"><button id="count-up">＋</button></div></div>
        <div class="track-specification">
          <label for="track-gauge">軌間</label><select id="track-gauge"></select>
          <label for="rail-profile">レール形式</label><select id="rail-profile"></select>
          <label for="support-system">軌道支持方式</label><select id="support-system"></select>
          <label for="roadbed">路盤</label><select id="roadbed"></select>
        </div>
        <div class="engineering-input">
          <label for="design-speed">設計速度</label><div><input id="design-speed" type="number" min="0" max="500" value="80"><span>km/h</span></div>
        </div>
        <div id="curve-metrics" class="curve-metrics"><span>曲線半径</span><strong>—</strong><small>曲線の敷設中に計算します</small></div>
        <div id="connection-metrics" class="curve-metrics connection-metrics" hidden></div>
        <div class="divider"></div>
        <button id="finish" class="primary" disabled>敷設を確定 <kbd>${shortcutLabel("track.finish")}</kbd></button>
        <button id="undo" class="secondary" disabled>最後の点を戻す <kbd>${shortcutLabel("track.undoPoint")}</kbd></button>
        <button id="cancel" class="ghost" disabled>敷設を取消 <kbd>${shortcutLabel("track.cancel")}</kbd></button>
        </div>
      </div>
      <div id="fleet-left-container" hidden></div>
      <div id="line-left-container" hidden></div>
      <div id="route-left-container" hidden></div>
      <div id="schedule-left-container" hidden></div>
      <div id="duty-left-container" hidden></div>
    </aside>
    <section class="workspace">
      <div class="map-header">
        <div><span class="status-dot"></span><div><strong id="mode-label">線路を敷設</strong><small id="instruction">地図上をクリックして線路の点を追加します</small></div></div>
        <div class="zoom"><button id="zoom-out">−</button><span id="zoom-label">100%</span><button id="zoom-in">＋</button><button id="home">原点</button></div>
      </div>
      <div class="canvas-wrap"><canvas id="map"></canvas><div class="map-hint">ホイール: 拡大縮小 · 中/右ドラッグ: 移動</div><div id="toast" class="toast">準備完了</div></div>
    </section>
    <aside class="panel inspector">
      <div id="construction-inspector">
        <p class="eyebrow">地図状態</p>
        <div class="metrics"><div><strong id="track-count">0</strong><span>TRACKS</span></div><div><strong id="station-count">0</strong><span>STATIONS</span></div><div><strong id="point-count">0</strong><span>POINTS</span></div></div>
        <div class="divider"></div>
        <p class="eyebrow">選択情報</p>
        <div id="selection" class="selection"><span>線路を選択していません</span></div>
        <div class="group-actions" id="group-actions"><button id="group-create">束を作成</button><button id="group-add">束へ追加</button><button id="group-remove">束から外す</button><button id="group-dissolve">束を解体</button></div>
        <div class="station-actions" id="station-actions"><button id="station-rename">駅名変更</button><button id="station-extend">駅を延長</button><button id="station-merge">駅を統合</button><button id="station-delete" class="danger">駅を撤去</button></div>
        <div class="divider"></div>
        <p class="eyebrow operation-title">運行</p>
        <div class="operation-actions">
          <button id="route-create">選択駅から経路作成</button>
          <select id="route-select" aria-label="運行経路"></select>
          <input id="formation-id" value="formation-1" maxlength="60" aria-label="編成ID" placeholder="編成ID" hidden>
          <div hidden><input id="train-speed" type="number" min="1" max="500" value="80"><span>km/h</span></div>
          <div hidden><input id="dwell-seconds" type="number" min="0" max="600" value="5"><span>秒停車</span></div>
          <button id="train-dispatch" hidden>列車を配置・発車</button>
          <small id="operation-summary">経路はありません</small>
        </div>
        <button id="delete" class="danger" disabled>選択した線路を撤去 <kbd>${shortcutLabel("selection.delete")}</kbd></button>
        <div class="divider"></div>
        <button id="clear" class="ghost full">マップを空にする</button>
      </div>
      <div id="fleet-right-container" hidden></div>
      <div id="line-right-container" hidden></div>
      <div id="route-right-container" hidden></div>
      <div id="schedule-right-container" hidden></div>
      <div id="duty-right-container" hidden></div>
    </aside>
  </main>
  <dialog id="save-manager" class="save-dialog">
    <form method="dialog" class="dialog-title"><strong>セーブデータ管理</strong><button aria-label="閉じる">×</button></form>
    <div id="save-list" class="save-list"></div>
    <label class="save-name-label" for="save-name">セーブ名</label>
    <input id="save-name" class="save-name" maxlength="80" placeholder="例: 北部幹線 1905年">
    <div class="save-actions">
      <button id="save-new" type="button">新規保存</button><button id="save-overwrite" type="button">上書き</button><button id="save-load" type="button">読込</button><button id="save-rename" type="button">名前変更</button><button id="save-export" type="button">書出</button><button id="save-delete" type="button" class="danger">削除</button>
    </div>
  </dialog>
  <dialog id="station-editor" class="save-dialog station-dialog">
    <form method="dialog" class="dialog-title"><strong id="station-editor-title">駅を設置</strong><button aria-label="閉じる">×</button></form>
    <div class="station-form">
      <label for="station-name">駅名</label><input id="station-name" maxlength="60" autocomplete="off">
      <small>先に指定した二点間を、この駅の停車範囲として保存します。</small>
    </div>
    <div class="station-form-actions"><button id="station-editor-cancel" type="button">取消</button><button id="station-editor-save" type="button">確定</button></div>
  </dialog>
  <footer><span id="message">自由な場所から線路敷設を開始できます</span><span>無境界平面 · 単位 m</span></footer>
`;

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`${selector} がありません`);
  return element;
}

const canvas = required<HTMLCanvasElement>("#map");
const canvasContext = canvas.getContext("2d");
if (!canvasContext) throw new Error("Canvasを利用できません");
const context: CanvasRenderingContext2D = canvasContext;
const LEGACY_QUICK_SAVE_KEY = "rails-on-rail.map-state.v1";
const SAVE_SLOTS_KEY = "rails-on-rail.save-slots.v1";

let state: MapState = createInitialState();
let camera: Camera = createInitialCamera();
let appMode: AppMode = "construction";
let tool: Tool | null = null;
let draftGeometry: TrackGeometry = "straight";
let draftTrackCount = 1;
const draftTrackSpacing = 12;
let draftSpecification: TrackSpecification = trackCatalog.defaultSpecification();
let draftDesignSpeedKmh = 80;
let stationScope: "single" | "bundle" = "bundle";
let draftPoints: Point[] = [];
let pointerWorld: Point | null = null;
let snapPoint: Point | null = null;
let draftStartTangent: Point | null = null;
let draftEndTangent: Point | null = null;
let hoverSnapTangent: Point | null = null;
let draftStartConnectionTrackId: string | null = null;
let draftEndConnectionTrackId: string | null = null;
let draftConnectionAlignmentIndex = 0;
let draftEndConnectionAlignmentIndex = 0;
let draftEndAlignmentTargetId: string | null = null;
let connectionCandidates: NearestTrackPoint[] = [];
let connectionCandidateIndex = 0;
let hoverSnapTrackId: string | null = null;
const selectedTrackIds = new Set<string>();
let selectedStationId: string | null = null;
const selectedStationIds = new Set<string>();
let pendingStationRange: { trackId: string; startPosition: Point; endPosition: Point } | null = null;
let stationRangeStart: { trackId: string; position: Point } | null = null;
let extendingStationId: string | null = null;
let editingStationId: string | null = null;
let dragging = false;
let dragStart: Point | null = null;
let cameraStart: Camera | null = null;
interface SyncedSaveSlot extends SaveSlot {
  serverId?: string;
  serverRevision?: number;
  serverOnly?: boolean;
}

let saveSlots: SyncedSaveSlot[] = readSaveSlots();
let selectedSaveId: string | null = null;
let selectedRouteId: string | null = null;
let previousFrameTime: number | null = null;
let simulationAccumulatorSeconds = 0;
let fleetUiState: FleetUiState = createInitialFleetUiState();
let placementOrientationToggle = false;
let placementPreviewState: PlacementPreviewState | null = null;

const toolText: Record<Tool, [string, string]> = {
  track: ["線路を敷設", "直線は2点、曲線は始点・初期方向・各区間終点を指定します"],
  station: ["駅を設置", "線路上の二点を指定します。対象は左側で一本または束全体へ切り替えられます"],
  placement: ["駅へ配置", "駅の停車範囲内の線路をクリックして配置します。<kbd>R</kbd> キーで配置向きを反転。"],
};

function viewport(): Viewport {
  return { width: canvas.width, height: canvas.height };
}

function eventPoint(event: PointerEvent | WheelEvent): Point {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function findStraightConnectionSnap(point: Point, maxDistance: number) {
  if (draftPoints.length === 0) return findNearestStraightStartPoint(state, point, maxDistance);
  const endpoint = findNearestTrackEndpoint(state, point, maxDistance);
  if (!endpoint || !draftStartTangent) return endpoint;
  const projected = projectPointToAxis(endpoint.centerPoint, draftPoints[0], draftStartTangent);
  const offset = Math.hypot(endpoint.centerPoint.x - projected.x, endpoint.centerPoint.y - projected.y);
  const cross = Math.abs(endpoint.tangent.x * draftStartTangent.y - endpoint.tangent.y * draftStartTangent.x);
  return offset <= 0.01 && cross <= 0.01 ? endpoint : null;
}

function dispatch(command: MapCommand): boolean {
  try {
    const result = executeCommand(state, command);
    state = result.state;
    showMessage(result.message);
  } catch (error) {
    showMessage(error instanceof Error ? error.message : "操作に失敗しました", true);
    updateUi();
    return false;
  }
  updateUi();
  return true;
}

const toolCursors: Record<Tool, string> = { track: "crosshair", station: "crosshair", placement: "crosshair" };

function setTool(next: Tool | null): void {
  if (next !== "station") {
    stationRangeStart = null;
    extendingStationId = null;
  }
  if (next !== "placement") {
    placementOrientationToggle = false;
    placementPreviewState = null;
  }
  tool = next;
  canvas.style.cursor = next !== null ? toolCursors[next] : "default";
  document.querySelectorAll<HTMLElement>("[data-tool]").forEach((button) => button.classList.toggle("active", button.dataset.tool === tool));
  if (next === null) {
    const labelMap: Record<string, string> = {
      construction: "建設",
      vehicle: "車両管理",
      line: "路線・系統",
      route: "経路",
      schedule: "運行",
      vehicleDuty: "運用",
      map: "マップ",
    };
    required("#mode-label").textContent = labelMap[appMode] || appMode;
    required("#instruction").textContent = "クリックで選択、ドラッグで移動";
  } else {
    const [label, instruction] = toolText[next];
    required("#mode-label").textContent = label;
    required("#instruction").textContent = instruction;
  }
  required<HTMLElement>("#station-scope-control").hidden = tool !== "station";
  required<HTMLElement>("#track-options").hidden = tool !== "track";
  updateUi();
}

function setMode(next: AppMode): void {
  appMode = next;
  setTool(null);
  resetTransientState();
  document.querySelectorAll<HTMLElement>("[data-mode]").forEach((btn) =>
    btn.classList.toggle("active", btn.dataset.mode === next),
  );
  // The planning list containers live inside #tools-panel as well. Keep their
  // parent visible in every mode that renders a left-hand management panel.
  required<HTMLElement>("#tools-panel").hidden = ![
    "construction",
    "line",
    "route",
    "schedule",
    "vehicleDuty",
    "vehicle",
  ].includes(next);
  updateUi();
}

function finishTrack(): void {
  if (draftPoints.length < 2) return showMessage("線路を確定するには2点以上が必要です", true);
  const succeeded = dispatch({
    type: "track.create",
    geometry: draftGeometry,
    points: draftPoints,
    trackCount: draftTrackCount,
    trackSpacing: draftTrackSpacing,
    specification: draftSpecification,
    designSpeedKmh: draftDesignSpeedKmh,
    connectionAlignmentIndex: draftConnectionAlignmentIndex,
    endConnectionAlignmentIndex: draftEndConnectionAlignmentIndex,
    ...(draftStartTangent ? { startTangent: draftStartTangent } : {}),
    ...(draftEndTangent ? { endTangent: draftEndTangent } : {}),
    ...(draftStartConnectionTrackId ? { startConnectionTrackId: draftStartConnectionTrackId } : {}),
    ...(draftEndConnectionTrackId ? { endConnectionTrackId: draftEndConnectionTrackId } : {}),
  });
  if (!succeeded) return;
  draftPoints = [];
  draftStartTangent = null;
  draftEndTangent = null;
  draftStartConnectionTrackId = null;
  draftEndConnectionTrackId = null;
  draftConnectionAlignmentIndex = 0;
  draftEndConnectionAlignmentIndex = 0;
  draftEndAlignmentTargetId = null;
  connectionCandidates = [];
  connectionCandidateIndex = 0;
  updateUi();
}

function undoPoint(): void {
  if (draftPoints.length === 0) return;
  draftPoints.pop();
  showMessage("最後の点を戻しました");
  updateUi();
}

function cancelDraft(): void {
  if (stationRangeStart || extendingStationId) {
    stationRangeStart = null;
    extendingStationId = null;
    showMessage("駅範囲の指定を取り消しました");
    updateUi();
    return;
  }
  if (draftPoints.length === 0) return;
  draftPoints = [];
  draftStartTangent = null;
  draftEndTangent = null;
  draftStartConnectionTrackId = null;
  draftEndConnectionTrackId = null;
  draftConnectionAlignmentIndex = 0;
  draftEndConnectionAlignmentIndex = 0;
  draftEndAlignmentTargetId = null;
  connectionCandidates = [];
  connectionCandidateIndex = 0;
  showMessage("敷設中の線路を取り消しました");
  updateUi();
}

function resetTransientState(): void {
  draftPoints = [];
  draftStartTangent = null;
  draftEndTangent = null;
  draftStartConnectionTrackId = null;
  draftEndConnectionTrackId = null;
  draftConnectionAlignmentIndex = 0;
  draftEndConnectionAlignmentIndex = 0;
  draftEndAlignmentTargetId = null;
  connectionCandidates = [];
  connectionCandidateIndex = 0;
  hoverSnapTrackId = null;
  hoverSnapTangent = null;
  snapPoint = null;
  selectedTrackIds.clear();
  selectedStationId = null;
  selectedStationIds.clear();
  selectedRouteId = null;
  pendingStationRange = null;
  stationRangeStart = null;
  extendingStationId = null;
}

function readSaveSlots(): SyncedSaveSlot[] {
  const raw = localStorage.getItem(SAVE_SLOTS_KEY);
  if (raw !== null) {
    try {
      const value: unknown = JSON.parse(raw);
      if (!Array.isArray(value)) throw new Error("セーブ一覧が配列ではありません");
      return value.map((item) => {
        if (!item || typeof item !== "object" || typeof (item as { id?: unknown }).id !== "string") throw new Error("セーブIDが正しくありません");
        const save = parseSaveFile(JSON.stringify(item));
        const stored = item as { id: string; serverId?: unknown; serverRevision?: unknown };
        return {
          id: stored.id,
          ...save,
          ...(typeof stored.serverId === "string" ? { serverId: stored.serverId } : {}),
          ...(Number.isInteger(stored.serverRevision) && (stored.serverRevision as number) >= 1 ? { serverRevision: stored.serverRevision as number } : {}),
        };
      });
    } catch {
      showMessage("ブラウザ内のセーブ一覧が壊れています", true);
      return [];
    }
  }
  const legacy = localStorage.getItem(LEGACY_QUICK_SAVE_KEY);
  if (legacy === null) return [];
  try {
    const save = createSaveFile("旧クイックセーブ", parseMapState(legacy));
    const migrated = [{ id: createSaveId(), ...save }];
    localStorage.setItem(SAVE_SLOTS_KEY, JSON.stringify(migrated));
    localStorage.removeItem(LEGACY_QUICK_SAVE_KEY);
    return migrated;
  } catch {
    return [];
  }
}

function writeSaveSlots(): void {
  localStorage.setItem(SAVE_SLOTS_KEY, JSON.stringify(saveSlots.filter((slot) => !slot.serverOnly)));
}

function createSaveId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `save-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function selectedSave(): SyncedSaveSlot | null {
  return saveSlots.find((slot) => slot.id === selectedSaveId) ?? null;
}

function renderSaveList(): void {
  const list = required("#save-list");
  if (saveSlots.length === 0) {
    list.innerHTML = `<p>保存されたデータはありません。</p>`;
  } else {
    list.replaceChildren(...[...saveSlots].sort((a, b) => b.metadata.updatedAt.localeCompare(a.metadata.updatedAt)).map((slot) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = slot.id === selectedSaveId ? "selected" : "";
      button.innerHTML = `<strong></strong><span></span>`;
      button.querySelector("strong")!.textContent = `${slot.metadata.name}${slot.serverOnly ? "（サーバー）" : slot.serverId ? " ☁️" : ""}`;
      button.querySelector("span")!.textContent = new Date(slot.metadata.updatedAt).toLocaleString("ja-JP");
      button.addEventListener("click", () => {
        selectedSaveId = slot.id;
        required<HTMLInputElement>("#save-name").value = slot.metadata.name;
        renderSaveList();
      });
      return button;
    }));
  }
  const disabled = selectedSave() === null;
  for (const id of ["#save-overwrite", "#save-load", "#save-rename", "#save-export", "#save-delete"]) required<HTMLButtonElement>(id).disabled = disabled;
}

async function openSaveManager(): Promise<void> {
  renderSaveList();
  required<HTMLDialogElement>("#save-manager").showModal();
  try {
    const response = await fetch("/api/server-saves");
    if (!response.ok) throw new Error(`一覧取得に失敗しました (${response.status})`);
    const summaries: unknown = await response.json();
    if (!Array.isArray(summaries)) throw new Error("サーバーのセーブ一覧が正しくありません");
    saveSlots = saveSlots.filter((slot) => !slot.serverOnly);
    for (const summary of summaries) {
      if (!summary || typeof summary !== "object") continue;
      const item = summary as { id?: unknown; revision?: unknown };
      if (typeof item.id !== "string" || !Number.isInteger(item.revision) || (item.revision as number) < 1) continue;
      const local = saveSlots.find((slot) => slot.serverId === item.id);
      if (local?.serverRevision === item.revision) continue;
      const fileResponse = await fetch(`/api/server-saves/${encodeURIComponent(item.id)}`);
      if (!fileResponse.ok) continue;
      try {
        const save = parseSaveFile(await fileResponse.text());
        saveSlots.push({ id: `server:${item.id}`, ...save, serverId: item.id, serverRevision: item.revision as number, serverOnly: true });
      } catch {
        // Invalid AI-generated JSON is omitted without changing the current map.
      }
    }
    renderSaveList();
  } catch (error) {
    showMessage(`サーバーのセーブを取得できません: ${error instanceof Error ? error.message : "不明なエラー"}`, true);
  }
}

async function syncSaveToServer(slot: SyncedSaveSlot): Promise<void> {
  const response = await fetch("/api/server-saves", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      saveId: slot.serverId ?? slot.id,
      expectedRevision: slot.serverRevision ?? 0,
      save: { formatVersion: slot.formatVersion, metadata: slot.metadata, state: slot.state },
    }),
  });
  if (response.status === 409) throw new Error("AIまたは別のクライアントがサーバー版を更新しています");
  if (!response.ok) throw new Error(`サーバーが同期を拒否しました (${response.status})`);
  const result = await response.json() as { id?: unknown; revision?: unknown };
  if (typeof result.id !== "string" || !Number.isInteger(result.revision) || (result.revision as number) < 1) throw new Error("サーバーの同期結果が正しくありません");
  saveSlots = saveSlots.map((item) => item.id === slot.id ? { ...item, serverId: result.id as string, serverRevision: result.revision as number } : item);
  writeSaveSlots();
  renderSaveList();
}

function downloadSave(save: SaveSlot): void {
  const blob = new Blob([serializeSaveFile(save)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const safeName = save.metadata.name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80) || "rails-on-rail";
  link.download = `${safeName}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function selectAt(screenPoint: Point, additive = false): void {
  const world = screenToWorld(screenPoint, camera, viewport());
  const nearestTrack = findNearestTrackPoint(state, world, 12 / camera.zoom);
  const station = state.stations
    .map((item) => {
      const markerDistance = Math.hypot(item.position.x - world.x, item.position.y - world.y);
      const stopPoint = nearestTrack ? item.stopPoints.find((stop) => stop.trackId === nearestTrack.trackId) : undefined;
      const distanceOnTrack = nearestTrack && stopPoint
        ? distanceAlongPathAtPoint(sampleTrack(state.tracks.find((track) => track.id === nearestTrack.trackId)!), nearestTrack.centerPoint)
        : null;
      const rangeHit = stopPoint && distanceOnTrack !== null && distanceOnTrack >= stopPoint.startDistanceM - 0.01 && distanceOnTrack <= stopPoint.endDistanceM + 0.01;
      return { item, distance: rangeHit ? nearestTrack!.distance : markerDistance };
    })
    .filter((item) => item.distance <= 14 / camera.zoom)
    .sort((first, second) => first.distance - second.distance)[0]?.item;
  if (station) {
    selectedTrackIds.clear();
    if (!additive) selectedStationIds.clear();
    if (additive && selectedStationIds.has(station.id)) selectedStationIds.delete(station.id);
    else selectedStationIds.add(station.id);
    selectedStationId = station.id;
    if (!selectedStationIds.has(station.id)) selectedStationId = [...selectedStationIds].at(-1) ?? null;
    showMessage(selectedStationIds.size > 0 ? `${selectedStationIds.size}駅を選択しました` : "選択を解除しました");
    updateUi();
    return;
  }
  const trackId = findNearestTrackPoint(state, world, 12 / camera.zoom)?.trackId ?? null;
  selectedStationId = null;
  selectedStationIds.clear();
  if (!additive) selectedTrackIds.clear();
  if (trackId) {
    if (additive && selectedTrackIds.has(trackId)) selectedTrackIds.delete(trackId);
    else selectedTrackIds.add(trackId);
  }
  showMessage(selectedTrackIds.size > 0 ? `${selectedTrackIds.size}本の線路を選択しました` : "選択を解除しました");
  updateUi();
}

function distanceAlongPathAtPoint(path: Point[], point: Point): number {
  let traversed = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestAlong = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    const start = path[index];
    const end = path[index + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length <= 1e-9) continue;
    const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (length * length)));
    const projected = { x: start.x + dx * ratio, y: start.y + dy * ratio };
    const distance = Math.hypot(point.x - projected.x, point.y - projected.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestAlong = traversed + length * ratio;
    }
    traversed += length;
  }
  return bestAlong;
}

function deleteSelected(): void {
  if (selectedStationIds.size > 0) {
    for (const stationId of selectedStationIds) state = executeCommand(state, { type: "station.delete", stationId }).state;
    showMessage(`${selectedStationIds.size}駅を撤去しました`);
    selectedStationIds.clear();
    selectedStationId = null;
    updateUi();
    return;
  }
  if (selectedTrackIds.size === 0) return;
  for (const trackId of selectedTrackIds) state = executeCommand(state, { type: "track.delete", trackId }).state;
  showMessage(`${selectedTrackIds.size}本の線路を撤去しました`);
  selectedTrackIds.clear();
  updateUi();
}

function renameSelectedStation(): void {
  const station = state.stations.find((item) => item.id === selectedStationId);
  if (!station) return;
  editingStationId = station.id;
  pendingStationRange = null;
  required("#station-editor-title").textContent = "駅を編集";
  required<HTMLInputElement>("#station-name").value = station.name;
  required<HTMLDialogElement>("#station-editor").showModal();
  required<HTMLInputElement>("#station-name").focus();
}

function openStationCreation(trackId: string, startPosition: Point, endPosition: Point): void {
  pendingStationRange = { trackId, startPosition: { ...startPosition }, endPosition: { ...endPosition } };
  editingStationId = null;
  required("#station-editor-title").textContent = "駅を設置";
  required<HTMLInputElement>("#station-name").value = `駅 ${state.nextStationId}`;
  required<HTMLDialogElement>("#station-editor").showModal();
  required<HTMLInputElement>("#station-name").select();
}

function saveStationEditor(): void {
  const name = required<HTMLInputElement>("#station-name").value;
  const succeeded = editingStationId
    ? dispatch({ type: "station.rename", stationId: editingStationId, name })
    : pendingStationRange
      ? dispatch({ type: "station.createRange", name, ...pendingStationRange, includeTrackGroup: stationScope === "bundle" })
      : false;
  if (!succeeded) return;
  required<HTMLDialogElement>("#station-editor").close();
  pendingStationRange = null;
  editingStationId = null;
}

function startExtendingSelectedStation(): void {
  if (!selectedStationId) return;
  extendingStationId = selectedStationId;
  stationRangeStart = null;
  setTool("station");
  showMessage("延長後の駅端を同じ線路上でクリックしてください");
}

function mergeSelectedStations(): void {
  const stationIds = [...selectedStationIds];
  if (!dispatch({ type: "station.merge", stationIds })) return;
  selectedStationIds.clear();
  selectedStationIds.add(stationIds[0]);
  selectedStationId = stationIds[0];
  updateUi();
}

function createRouteFromSelectedStations(): void {
  const stationIds = [...selectedStationIds];
  if (stationIds.length < 2) return showMessage("停車順に2駅以上を選択してください", true);
  const names = stationIds.map((id) => state.stations.find((station) => station.id === id)?.name ?? id);
  if (!dispatch({ type: "route.create", name: names.join(" → "), stationIds })) return;
  selectedRouteId = Object.keys(state.operationRoutes).at(-1) ?? null;
  updateUi();
}

function dispatchTrain(): void {
  if (!selectedRouteId) return showMessage("運行経路を選択してください", true);
  const formationId = required<HTMLInputElement>("#formation-id").value;
  const speedKph = Number(required<HTMLInputElement>("#train-speed").value);
  const dwellSeconds = Math.max(0, Number(required<HTMLInputElement>("#dwell-seconds").value) || 0);
  const number = state.nextOperatingTrainId;
  dispatch({ type: "train.dispatch", routeId: selectedRouteId, formationId, name: `列車 ${number}`, speedKph, dwellSeconds });
}

function createGroupFromSelection(): void {
  dispatch({ type: "trackGroup.create", trackIds: [...selectedTrackIds] });
}

function addSelectionToGroup(): void {
  const selectedGroups = [...new Set([...selectedTrackIds].flatMap((id) => findTrackGroup(state, id)?.id ?? []))];
  if (selectedGroups.length !== 1) return showMessage("追加先となる線路群の線を一緒に選択してください", true);
  const groupId = selectedGroups[0];
  const ungrouped = [...selectedTrackIds].filter((id) => !findTrackGroup(state, id));
  if (ungrouped.length === 0) return showMessage("追加する単独線路を選択してください", true);
  for (const trackId of ungrouped) state = executeCommand(state, { type: "trackGroup.addTrack", groupId, trackId }).state;
  showMessage(`${ungrouped.length}本を線路群へ追加しました`);
  updateUi();
}

function removeSelectionFromGroups(): void {
  const removable = [...selectedTrackIds].flatMap((trackId) => {
    const group = findTrackGroup(state, trackId);
    return group ? [{ groupId: group.id, trackId }] : [];
  });
  if (removable.length === 0) return;
  for (const item of removable) {
    if (state.trackGroups.some((group) => group.id === item.groupId)) state = executeCommand(state, { type: "trackGroup.removeTrack", ...item }).state;
  }
  showMessage(`${removable.length}本を束から外しました`);
  updateUi();
}

function dissolveSelectedGroups(): void {
  const groupIds = [...new Set([...selectedTrackIds].flatMap((id) => findTrackGroup(state, id)?.id ?? []))];
  if (groupIds.length === 0) return;
  for (const groupId of groupIds) state = executeCommand(state, { type: "trackGroup.dissolve", groupId }).state;
  showMessage(`${groupIds.length}個の束を解体しました。線路は残っています`);
  updateUi();
}

function updatePlacementPreview(rawWorld: Point): void {
  if (tool !== "placement" || !fleetUiState.selectedFormationId) {
    placementPreviewState = null;
    return;
  }
  const formation = state.fleet.formations.find((f) => f.id === fleetUiState.selectedFormationId);
  if (!formation || formation.vehicles.length === 0) {
    placementPreviewState = null;
    return;
  }

  const nearest = findNearestTrackPoint(state, rawWorld, 50 / camera.zoom);
  if (!nearest) {
    placementPreviewState = null;
    return;
  }

  const track = state.tracks.find((t) => t.id === nearest.trackId);
  if (!track) {
    placementPreviewState = null;
    return;
  }

  const trackPath = sampleTrack(track);
  let distanceM = 0;
  let bestDist = Infinity;
  let traversed = 0;
  for (let i = 0; i < trackPath.length - 1; i++) {
    const p1 = trackPath[i];
    const p2 = trackPath[i + 1];
    const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const proj = closestPointOnSegment(rawWorld, p1, p2);
    const d = Math.hypot(rawWorld.x - proj.point.x, rawWorld.y - proj.point.y);
    if (d < bestDist) {
      bestDist = d;
      distanceM = traversed + Math.hypot(proj.point.x - p1.x, proj.point.y - p1.y);
    }
    traversed += segLen;
  }
  let foundStation: typeof state.stations[0] | null = null;
  let foundStopPoint: typeof state.stations[0]["stopPoints"][0] | null = null;

  for (const st of state.stations) {
    const sp = st.stopPoints.find((s) => s.trackId === track.id && distanceM >= s.startDistanceM - 0.001 && distanceM <= s.endDistanceM + 0.001);
    if (sp) {
      foundStation = st;
      foundStopPoint = sp;
      break;
    }
  }

  if (!foundStation || !foundStopPoint) {
    placementPreviewState = {
      formationId: formation.id,
      formationName: formation.name,
      formationLengthM: 0,
      trackId: track.id,
      stationId: "",
      stationName: "",
      centerDistanceM: distanceM,
      occupiedStartDistanceM: distanceM,
      occupiedEndDistanceM: distanceM,
      orientation: "forward",
      isValid: false,
      errorMessage: "駅の停車範囲外",
    };
    return;
  }

  const { lengthM: formationLengthM } = getFormationLengthM(state.fleet, formation);
  const stationCenterM = (foundStopPoint.startDistanceM + foundStopPoint.endDistanceM) / 2;
  const baseOrient: Orientation = distanceM >= stationCenterM ? "forward" : "reversed";
  const orientation: Orientation = placementOrientationToggle ? (baseOrient === "forward" ? "reversed" : "forward") : baseOrient;

  const occupiedStartDistanceM = distanceM - formationLengthM / 2;
  const occupiedEndDistanceM = distanceM + formationLengthM / 2;

  const trackLengthM = analyzeTrackLines([sampleTrack(track)]).lines[0]?.lengthM ?? 0;
  const fitsInTrack = occupiedStartDistanceM >= -0.001 && occupiedEndDistanceM <= trackLengthM + 0.001;
  const overlaps = state.vehiclePlacements.some((p) => p.trackId === track.id && occupiedStartDistanceM <= p.occupiedEndDistanceM && p.occupiedStartDistanceM <= occupiedEndDistanceM);

  const isValid = fitsInTrack && !overlaps;
  const errorMessage = !fitsInTrack ? "線路長を超過" : overlaps ? "他編成と重複" : undefined;

  placementPreviewState = {
    formationId: formation.id,
    formationName: formation.name,
    formationLengthM,
    trackId: track.id,
    stationId: foundStation.id,
    stationName: foundStation.name,
    centerDistanceM: distanceM,
    occupiedStartDistanceM,
    occupiedEndDistanceM,
    orientation,
    isValid,
    errorMessage,
  };
}

canvas.addEventListener("pointermove", (event) => {
  const screen = eventPoint(event);
  const rawWorld = screenToWorld(screen, camera, viewport());
  if (tool === "placement") {
    pointerWorld = rawWorld;
    updatePlacementPreview(rawWorld);
    required("#coordinates").textContent = `X ${Math.round(pointerWorld.x)} · Y ${Math.round(pointerWorld.y)}`;
    return;
  }
  const snap = tool === "track"
    ? draftGeometry === "straight"
      ? findStraightConnectionSnap(rawWorld, 12 / camera.zoom)
      : findNearestTrackPoint(state, rawWorld, 12 / camera.zoom)
    : tool === "station"
      ? findNearestTrackPoint(state, rawWorld, 12 / camera.zoom)
      : null;
  pointerWorld = snap
    ? snap.centerPoint
    : draftGeometry === "straight" && draftPoints.length === 1 && draftStartTangent
      ? projectPointToAxis(rawWorld, draftPoints[0], draftStartTangent)
      : rawWorld;
  snapPoint = snap?.point ?? null;
  hoverSnapTangent = snap?.tangent ?? null;
  hoverSnapTrackId = snap?.trackId ?? null;
  if (draftGeometry === "curve" && draftPoints.length > 0 && snap) {
    const targetGroup = findTrackGroup(state, snap.trackId);
    const targetId = targetGroup?.id ?? snap.trackId;
    if (draftEndAlignmentTargetId !== targetId) {
      const targetIds = targetGroup?.trackIds ?? [snap.trackId];
      draftEndConnectionAlignmentIndex = connectionCandidateIndexFromSelectedTrack(draftTrackCount, targetIds, snap.trackId);
      draftEndAlignmentTargetId = targetId;
    }
  }
  required("#coordinates").textContent = `X ${Math.round(pointerWorld.x)} · Y ${Math.round(pointerWorld.y)}`;
  updateCurveMetrics();
  if (dragging && dragStart && cameraStart) {
    const sdx = (screen.x - dragStart.x) / camera.zoom;
    const sdy = (screen.y - dragStart.y) / camera.zoom;
    const cos = Math.cos(camera.rotation);
    const sin = Math.sin(camera.rotation);
    camera = {
      ...camera,
      x: cameraStart.x - (sdx * cos - sdy * sin),
      y: cameraStart.y - (sdx * sin + sdy * cos),
    };
  }
});
canvas.addEventListener("pointerleave", () => {
  pointerWorld = null;
  snapPoint = null;
  hoverSnapTangent = null;
  hoverSnapTrackId = null;
  placementPreviewState = null;
  updateCurveMetrics();
});

canvas.addEventListener("pointerdown", (event) => {
  const screen = eventPoint(event);
  if (event.button === 1 || event.button === 2) {
    dragging = true;
    dragStart = screen;
    cameraStart = { ...camera };
    canvas.style.cursor = "grabbing";
    canvas.setPointerCapture(event.pointerId);
    return;
  }
  if (event.button !== 0) return;
  if (tool === "placement") {
    if (placementPreviewState && placementPreviewState.isValid) {
      const ok = dispatch({
        type: "fleet.formation.place",
        formationId: placementPreviewState.formationId,
        stationId: placementPreviewState.stationId,
        trackId: placementPreviewState.trackId,
        distanceM: placementPreviewState.centerDistanceM,
        orientation: placementPreviewState.orientation,
      });
      if (ok) {
        setTool(null);
      }
    } else if (placementPreviewState?.errorMessage) {
      showMessage(`配置できません: ${placementPreviewState.errorMessage}`, true);
    }
    return;
  }
  if (tool === "track") {
    const rawWorld = screenToWorld(screen, camera, viewport());
    const nearbyTrack = findNearestTrackPoint(state, rawWorld, 12 / camera.zoom);
    const nearbyEndpoint = findNearestTrackEndpoint(state, rawWorld, 12 / camera.zoom);
    const snap = draftGeometry === "straight"
      ? findStraightConnectionSnap(rawWorld, 12 / camera.zoom)
      : nearbyTrack;
    if (draftGeometry === "straight" && draftPoints.length === 0 && nearbyTrack && !snap) {
      showMessage("直線区間の途中から直線を生やすことはできません", true);
      return;
    }
    if (draftGeometry === "straight" && draftPoints.length === 1 && nearbyEndpoint && !snap) {
      showMessage("方向の合わない先端へ直線を接続できません", true);
      return;
    }
    const world = snap
      ? snap.centerPoint
      : draftGeometry === "straight" && draftPoints.length === 1 && draftStartTangent
        ? projectPointToAxis(rawWorld, draftPoints[0], draftStartTangent)
        : rawWorld;
    draftPoints.push(world);
    if (draftPoints.length === 1 && snap) {
      draftStartTangent = snap.tangent;
      draftStartConnectionTrackId = snap.trackId;
      const targetIds = findTrackGroup(state, snap.trackId)?.trackIds ?? [snap.trackId];
      draftConnectionAlignmentIndex = connectionCandidateIndexFromSelectedTrack(draftTrackCount, targetIds, snap.trackId);
      const snapRadius = 12 / camera.zoom;
      if (findNearestTrackEndpoint(state, snap.centerPoint, 0.01)) {
        const seenGroups = new Set<string>();
        connectionCandidates = findAllNearbyTrackEndpoints(state, snap.centerPoint, snapRadius).filter((c) => {
          const groupKey = findTrackGroup(state, c.trackId)?.id ?? c.trackId;
          if (seenGroups.has(groupKey)) return false;
          seenGroups.add(groupKey);
          return true;
        });
        connectionCandidateIndex = connectionCandidates.findIndex((c) => c.trackId === snap.trackId);
        if (connectionCandidateIndex < 0) connectionCandidateIndex = 0;
      } else {
        connectionCandidates = [];
        connectionCandidateIndex = 0;
      }
    } else if (draftPoints.length > 1 && snap) {
      draftEndTangent = snap.tangent;
      draftEndConnectionTrackId = snap.trackId;
      const targetIds = findTrackGroup(state, snap.trackId)?.trackIds ?? [snap.trackId];
      const targetId = findTrackGroup(state, snap.trackId)?.id ?? snap.trackId;
      if (draftEndAlignmentTargetId !== targetId) {
        draftEndConnectionAlignmentIndex = connectionCandidateIndexFromSelectedTrack(draftTrackCount, targetIds, snap.trackId);
      }
      draftEndAlignmentTargetId = targetId;
    }
    showMessage(draftPoints.length === 1 ? "始点を置きました" : `${draftPoints.length}点目を追加しました`);
    if ((draftGeometry === "straight" && draftPoints.length === 2) || (draftPoints.length > 1 && snap)) finishTrack();
  } else if (tool === "station") {
    const rawWorld = screenToWorld(screen, camera, viewport());
    const snap = findNearestTrackPoint(state, rawWorld, 12 / camera.zoom);
    if (!snap) showMessage("駅は線路上へ設置してください", true);
    else if (extendingStationId) {
      const station = state.stations.find((item) => item.id === extendingStationId);
      const stopPoint = station?.stopPoints[0];
      if (!stopPoint || stopPoint.trackId !== snap.trackId) showMessage("既存駅と同じ線路上を指定してください", true);
      else {
        dispatch({ type: "station.extend", stationId: station.id, trackId: snap.trackId, position: snap.centerPoint });
        extendingStationId = null;
      }
    } else if (!stationRangeStart) {
      stationRangeStart = { trackId: snap.trackId, position: { ...snap.centerPoint } };
      showMessage("駅の反対側の端を同じ線路上でクリックしてください");
    } else if (stationRangeStart.trackId !== snap.trackId) showMessage("駅の両端は同じ線路上で指定してください", true);
    else {
      openStationCreation(snap.trackId, stationRangeStart.position, snap.centerPoint);
      stationRangeStart = null;
    }
  } else {
    // tool === null: デフォルト選択
    selectAt(screen, event.shiftKey);
  }
  updateUi();
});

canvas.addEventListener("pointerup", (event) => {
  dragging = false;
  dragStart = null;
  cameraStart = null;
  canvas.style.cursor = tool !== null ? toolCursors[tool] : "default";
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
});
canvas.addEventListener("pointercancel", () => { dragging = false; dragStart = null; cameraStart = null; canvas.style.cursor = tool !== null ? toolCursors[tool] : "default"; });
canvas.addEventListener("contextmenu", (event) => event.preventDefault());
canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const factor = Math.exp(-event.deltaY * 0.0012);
  camera = zoomAt(camera, eventPoint(event), camera.zoom * factor, viewport());
  updateUi();
}, { passive: false });

document.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((button) => button.addEventListener("click", () => {
  const toolValue = button.dataset.tool as Tool;
  // クリックしたのが既にアクティブなツールならデフォルトに戻る
  if (tool === toolValue) setTool(null);
  else setTool(toolValue);
}));
document.querySelectorAll<HTMLButtonElement>("[data-geometry]").forEach((button) => button.addEventListener("click", () => {
  if (draftPoints.length > 0) cancelDraft();
  draftGeometry = button.dataset.geometry as TrackGeometry;
  document.querySelectorAll<HTMLElement>("[data-geometry]").forEach((candidate) => candidate.classList.toggle("active", candidate.dataset.geometry === draftGeometry));
  setTool("track");
  required("#instruction").textContent = draftGeometry === "curve"
    ? "最初の2点で方向を決め、以後の点まで一定半径の円弧を伸ばします"
    : "空地または既設線の先端から、方向を維持して直線を延長します";
  showMessage(`${draftGeometry === "curve" ? "曲線" : "直線"}モードに切り替えました`);
}));
document.querySelectorAll<HTMLButtonElement>("[data-station-scope]").forEach((button) => button.addEventListener("click", () => {
  stationScope = button.dataset.stationScope as "single" | "bundle";
  document.querySelectorAll<HTMLElement>("[data-station-scope]").forEach((candidate) => candidate.classList.toggle("active", candidate.dataset.stationScope === stationScope));
  showMessage(stationScope === "bundle" ? "束内の全線路を駅にします" : "クリックした一本だけを駅にします");
  updateUi();
}));
required("#finish").addEventListener("click", finishTrack);
required("#undo").addEventListener("click", undoPoint);
required("#cancel").addEventListener("click", cancelDraft);
required("#delete").addEventListener("click", deleteSelected);
required("#group-create").addEventListener("click", createGroupFromSelection);
required("#group-add").addEventListener("click", addSelectionToGroup);
required("#group-remove").addEventListener("click", removeSelectionFromGroups);
required("#group-dissolve").addEventListener("click", dissolveSelectedGroups);
required("#station-rename").addEventListener("click", renameSelectedStation);
required("#station-delete").addEventListener("click", deleteSelected);
required("#station-extend").addEventListener("click", startExtendingSelectedStation);
required("#station-merge").addEventListener("click", mergeSelectedStations);
required("#route-create").addEventListener("click", createRouteFromSelectedStations);
required("#train-dispatch").addEventListener("click", dispatchTrain);
required<HTMLSelectElement>("#route-select").addEventListener("change", (event) => { selectedRouteId = (event.currentTarget as HTMLSelectElement).value || null; updateUi(); });
required("#station-editor-save").addEventListener("click", saveStationEditor);
required("#station-editor-cancel").addEventListener("click", () => required<HTMLDialogElement>("#station-editor").close());
required<HTMLInputElement>("#station-name").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); saveStationEditor(); } });
required("#clear").addEventListener("click", () => { dispatch({ type: "map.clear" }); resetTransientState(); });
required("#zoom-in").addEventListener("click", () => { camera = zoomAt(camera, { x: canvas.width / 2, y: canvas.height / 2 }, camera.zoom * 1.25, viewport()); updateUi(); });
required("#zoom-out").addEventListener("click", () => { camera = zoomAt(camera, { x: canvas.width / 2, y: canvas.height / 2 }, camera.zoom / 1.25, viewport()); updateUi(); });
required("#home").addEventListener("click", () => { camera = createInitialCamera(); updateUi(); showMessage("原点へ戻りました"); });
document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
  if (!button.disabled) button.addEventListener("click", () => setMode(button.dataset.mode as AppMode));
});
required("#time-toggle").addEventListener("click", () => dispatch({ type: "simulation.setPaused", paused: !state.clock.paused }));
document.querySelectorAll<HTMLButtonElement>("[data-time-speed]").forEach((button) => button.addEventListener("click", () => {
  const speedMultiplier = Number(button.dataset.timeSpeed) as MapState["clock"]["speedMultiplier"];
  if (dispatch({ type: "simulation.setSpeed", speedMultiplier }) && state.clock.paused) dispatch({ type: "simulation.setPaused", paused: false });
}));
required("#save-manager-open").addEventListener("click", openSaveManager);
required("#save-new").addEventListener("click", async () => {
  try {
    const save = createSaveFile(required<HTMLInputElement>("#save-name").value, state);
    const slot = { id: createSaveId(), ...save };
    saveSlots.push(slot);
    selectedSaveId = slot.id;
    writeSaveSlots();
    renderSaveList();
    try {
      await syncSaveToServer(slot);
      showMessage(`「${slot.metadata.name}」を保存し、サーバーと同期しました`);
    } catch (error) {
      showMessage(`ブラウザには保存しましたが、サーバー同期に失敗しました: ${error instanceof Error ? error.message : "不明なエラー"}`, true);
    }
  } catch (error) {
    showMessage(error instanceof Error ? error.message : "保存できません", true);
  }
});
required("#save-overwrite").addEventListener("click", async () => {
  const slot = selectedSave();
  if (!slot) return;
  const updated = createSaveFile(slot.metadata.name, state, slot.metadata.createdAt, new Date().toISOString());
  const updatedSlot = { id: slot.id, ...updated, ...(slot.serverId ? { serverId: slot.serverId } : {}), ...(slot.serverRevision ? { serverRevision: slot.serverRevision } : {}) };
  saveSlots = saveSlots.map((item) => item.id === slot.id ? updatedSlot : item);
  writeSaveSlots();
  renderSaveList();
  try {
    await syncSaveToServer(updatedSlot);
    showMessage(`「${slot.metadata.name}」を上書きし、サーバーと同期しました`);
  } catch (error) {
    showMessage(`ブラウザには上書きしましたが、サーバー同期に失敗しました: ${error instanceof Error ? error.message : "不明なエラー"}`, true);
  }
});
required("#save-load").addEventListener("click", () => {
  const slot = selectedSave();
  if (!slot) return;
  state = structuredClone(slot.state);
  resetTransientState();
  required<HTMLDialogElement>("#save-manager").close();
  updateUi();
  showMessage(`「${slot.metadata.name}」を読み込みました`);
});
required("#save-rename").addEventListener("click", () => {
  const slot = selectedSave();
  if (!slot) return;
  try {
    const name = validateSaveName(required<HTMLInputElement>("#save-name").value);
    saveSlots = saveSlots.map((item) => item.id === slot.id ? { ...item, metadata: { ...item.metadata, name, updatedAt: new Date().toISOString() } } : item);
    writeSaveSlots();
    renderSaveList();
    showMessage(`セーブ名を「${name}」へ変更しました`);
  } catch (error) {
    showMessage(error instanceof Error ? error.message : "名前を変更できません", true);
  }
});
required("#save-export").addEventListener("click", () => {
  const slot = selectedSave();
  if (!slot) return;
  downloadSave(slot);
  showMessage(`「${slot.metadata.name}」を書き出しました`);
});
required("#save-delete").addEventListener("click", () => {
  const slot = selectedSave();
  if (!slot || !window.confirm(`「${slot.metadata.name}」をブラウザから削除しますか？ サーバー版は残ります。`)) return;
  saveSlots = saveSlots.filter((item) => item.id !== slot.id);
  selectedSaveId = null;
  writeSaveSlots();
  required<HTMLInputElement>("#save-name").value = "";
  renderSaveList();
  showMessage(`「${slot.metadata.name}」を削除しました`);
});
const importFile = required<HTMLInputElement>("#import-file");
required("#import-save").addEventListener("click", () => importFile.click());
importFile.addEventListener("change", async () => {
  const file = importFile.files?.[0];
  importFile.value = "";
  if (!file) return;
  try {
    const imported = parseSaveFile(await file.text(), file.name.replace(/\.json$/i, ""));
    const slot = { id: createSaveId(), ...imported };
    saveSlots.push(slot);
    selectedSaveId = slot.id;
    writeSaveSlots();
    state = structuredClone(slot.state);
    resetTransientState();
    updateUi();
    try {
      await syncSaveToServer(slot);
      showMessage(`「${slot.metadata.name}」を取り込み、サーバーと同期しました`);
    } catch (error) {
      showMessage(`ブラウザには取り込みましたが、サーバー同期に失敗しました: ${error instanceof Error ? error.message : "不明なエラー"}`, true);
    }
  } catch (error) {
    showMessage(error instanceof Error ? error.message : "選択したファイルを読み取れません", true);
  }
});
const countInput = required<HTMLInputElement>("#track-count-input");

function setOptions(select: HTMLSelectElement, items: { id: string; name: string }[], selectedId: string): void {
  select.replaceChildren(...items.map((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    option.selected = item.id === selectedId;
    return option;
  }));
}

const railProfileSelect = required<HTMLSelectElement>("#rail-profile");
const gaugeSelect = required<HTMLSelectElement>("#track-gauge");
const supportSystemSelect = required<HTMLSelectElement>("#support-system");
const roadbedSelect = required<HTMLSelectElement>("#roadbed");
setOptions(railProfileSelect, trackCatalog.railProfiles, draftSpecification.railProfileId);
setOptions(gaugeSelect, trackCatalog.gauges, draftSpecification.gaugeId);
setOptions(roadbedSelect, trackCatalog.roadbeds, draftSpecification.roadbedId);

function updateCompatibleSupportSystems(): void {
  const compatible = trackCatalog.compatibleSupportSystems(draftSpecification.railProfileId);
  const selected = compatible.some((item) => item.id === draftSpecification.supportSystemId)
    ? draftSpecification.supportSystemId
    : compatible[0]?.id;
  if (!selected) throw new Error("選択したレールに対応する軌道支持方式がありません");
  draftSpecification = { ...draftSpecification, supportSystemId: selected };
  setOptions(supportSystemSelect, compatible, selected);
}

updateCompatibleSupportSystems();
gaugeSelect.addEventListener("change", () => {
  draftSpecification = { ...draftSpecification, gaugeId: gaugeSelect.value };
  showMessage("軌間を変更しました");
  updateUi();
});
railProfileSelect.addEventListener("change", () => {
  draftSpecification = { ...draftSpecification, railProfileId: railProfileSelect.value };
  updateCompatibleSupportSystems();
  showMessage("レール形式を変更しました");
});
supportSystemSelect.addEventListener("change", () => {
  draftSpecification = { ...draftSpecification, supportSystemId: supportSystemSelect.value };
  showMessage("軌道支持方式を変更しました");
});
roadbedSelect.addEventListener("change", () => {
  draftSpecification = { ...draftSpecification, roadbedId: roadbedSelect.value };
  showMessage("路盤を変更しました");
});
const designSpeedInput = required<HTMLInputElement>("#design-speed");
designSpeedInput.addEventListener("change", () => {
  draftDesignSpeedKmh = Math.min(500, Math.max(0, Number(designSpeedInput.value) || 0));
  designSpeedInput.value = String(draftDesignSpeedKmh);
  showMessage(`設計速度を${draftDesignSpeedKmh} km/hに設定しました`);
  updateUi();
});

function setTrackCount(value: number): void {
  draftTrackCount = Math.min(8, Math.max(1, Math.round(value)));
  if (draftStartConnectionTrackId) {
    const otherCount = findTrackGroup(state, draftStartConnectionTrackId)?.trackIds.length ?? 1;
    draftConnectionAlignmentIndex = Math.min(draftConnectionAlignmentIndex, connectionCandidateCount(draftTrackCount, otherCount) - 1);
  }
  countInput.value = String(draftTrackCount);
  showMessage(`${draftTrackCount}本同時敷設に設定しました`);
}
countInput.addEventListener("change", () => setTrackCount(Number(countInput.value)));
required("#count-down").addEventListener("click", () => setTrackCount(draftTrackCount - 1));
required("#count-up").addEventListener("click", () => setTrackCount(draftTrackCount + 1));

const pressedKeys = new Set<string>();
window.addEventListener("keydown", (event) => {
  if (!isTextEntryTarget(event.target)) pressedKeys.add(event.key.toLowerCase());
});
window.addEventListener("keyup", (event) => pressedKeys.delete(event.key.toLowerCase()));

function isAnyTextFocused(): boolean {
  return isTextEntryTarget(document.activeElement);
}

window.addEventListener("keydown", (event) => {
  // グローバルキー（テキスト入力中も一部有効）
  if (event.key === "F1") { event.preventDefault(); setMode("map"); return; }
  if (event.key === "F2") { event.preventDefault(); setMode("construction"); return; }
  if (event.key === "F4") { event.preventDefault(); setMode("route"); return; }

  if (isTextEntryTarget(event.target)) return;

  if (matchesKey("simulation.togglePause", event)) { event.preventDefault(); dispatch({ type: "simulation.setPaused", paused: !state.clock.paused }); return; }

  // Ctrl+S: セーブ
  if (event.ctrlKey && event.key === "s") { event.preventDefault(); openSaveManager(); return; }

  // 接続調整（既存）
  if (matchesKey("connection.shiftEndBackward", event) && adjustEndConnectionAlignment(-1)) { event.preventDefault(); return; }
  if (matchesKey("connection.shiftEndForward", event) && adjustEndConnectionAlignment(1)) { event.preventDefault(); return; }
  if (matchesKey("connection.shiftLeft", event) && adjustConnectionAlignment(-1)) { event.preventDefault(); return; }
  if (matchesKey("connection.shiftRight", event) && adjustConnectionAlignment(1)) { event.preventDefault(); return; }
  if (matchesKey("connection.center", event) && resetConnectionAlignment()) { event.preventDefault(); return; }

  // Tab: 接続先候補切替 or 線形切替
  if (event.key === "Tab") {
    if (cycleConnectionCandidate()) { event.preventDefault(); return; }
    if (tool === "track" && !draftStartConnectionTrackId) {
      event.preventDefault();
      draftGeometry = draftGeometry === "straight" ? "curve" : "straight";
      document.querySelectorAll<HTMLElement>("[data-geometry]").forEach((candidate) => candidate.classList.toggle("active", candidate.dataset.geometry === draftGeometry));
      required("#instruction").textContent = draftGeometry === "curve"
        ? "最初の2点で方向を決め、以後の点まで一定半径の円弧を伸ばします"
        : "空地または既設線の先端から、方向を維持して直線を延長します";
      showMessage(`${draftGeometry === "curve" ? "曲線" : "直線"}モードに切り替えました`);
      updateUi();
      return;
    }
  }

  // 線路敷設キー
  if (matchesKey("track.finish", event)) { finishTrack(); return; }
  if (matchesKey("track.undoPoint", event)) { event.preventDefault(); undoPoint(); return; }

  // Escape: 敷設取消 → ツール解除
  if (event.key === "Escape") {
    if (draftPoints.length > 0 || stationRangeStart || extendingStationId) {
      cancelDraft();
    } else if (tool !== null) {
      setTool(null);
    } else {
      selectedTrackIds.clear();
      selectedStationIds.clear();
      selectedStationId = null;
      updateUi();
    }
    return;
  }

  if (matchesKey("selection.delete", event)) { deleteSelected(); return; }

  if (!event.ctrlKey) {
    // 建設モードのツール切替
    if (appMode === "construction") {
      if (event.key === "t") { setTool("track"); return; }
      if (event.key === "b") { setTool("station"); return; }
    }
    // ビュー操作（WASD/矢印はframe()で処理するが、ズームとホームはここで）
    if (!isAnyTextFocused()) {
      if (event.key === "h") { camera = createInitialCamera(); updateUi(); showMessage("原点へ戻りました"); return; }
      if (event.key === "+" || event.key === "=") { camera = zoomAt(camera, { x: canvas.width / 2, y: canvas.height / 2 }, camera.zoom * 1.25, viewport()); updateUi(); return; }
      if (event.key === "-") { camera = zoomAt(camera, { x: canvas.width / 2, y: canvas.height / 2 }, camera.zoom / 1.25, viewport()); updateUi(); return; }
    }
    // 線路ツール中の本数変更
    if (tool === "track") {
      if (event.key === "[") { setTrackCount(draftTrackCount - 1); return; }
      if (event.key === "]") { setTrackCount(draftTrackCount + 1); return; }
    }
  }
});

function adjustEndConnectionAlignment(delta: number): boolean {
  const targetTrackId = draftEndConnectionTrackId ?? hoverSnapTrackId;
  if (draftGeometry !== "curve" || !draftStartConnectionTrackId || !targetTrackId || draftPoints.length < 1) return false;
  const targetGroup = findTrackGroup(state, targetTrackId);
  const otherCount = targetGroup?.trackIds.length ?? 1;
  const count = connectionCandidateCount(draftTrackCount, otherCount);
  const next = Math.max(0, Math.min(count - 1, draftEndConnectionAlignmentIndex + delta));
  if (next === draftEndConnectionAlignmentIndex) {
    showMessage(delta < 0 ? "到着側はこれ以上左へ移動できません" : "到着側はこれ以上右へ移動できません");
    return true;
  }
  draftEndConnectionAlignmentIndex = next;
  draftEndAlignmentTargetId = targetGroup?.id ?? targetTrackId;
  showMessage(`到着側の接続対応 ${next + 1}/${count}`);
  updateUi();
  return true;
}

function adjustConnectionAlignment(delta: number): boolean {
  if (!draftStartConnectionTrackId || draftPoints.length === 0) return false;
  const otherCount = findTrackGroup(state, draftStartConnectionTrackId)?.trackIds.length ?? 1;
  const count = connectionCandidateCount(draftTrackCount, otherCount);
  const next = Math.max(0, Math.min(count - 1, draftConnectionAlignmentIndex + delta));
  if (next === draftConnectionAlignmentIndex) {
    showMessage(delta < 0 ? "これ以上左へ移動できません" : "これ以上右へ移動できません");
    return true;
  }
  draftConnectionAlignmentIndex = next;
  showMessage(`接続対応 ${next + 1}/${count}`);
  updateUi();
  return true;
}

function resetConnectionAlignment(): boolean {
  if (!draftStartConnectionTrackId || draftPoints.length === 0) return false;
  const otherCount = findTrackGroup(state, draftStartConnectionTrackId)?.trackIds.length ?? 1;
  draftConnectionAlignmentIndex = centeredConnectionCandidateIndex(draftTrackCount, otherCount);
  showMessage("接続対応を中央に戻しました");
  updateUi();
  return true;
}

function cycleConnectionCandidate(): boolean {
  if (connectionCandidates.length < 2 || draftPoints.length === 0) return false;
  connectionCandidateIndex = (connectionCandidateIndex + 1) % connectionCandidates.length;
  const next = connectionCandidates[connectionCandidateIndex];
  draftPoints[0] = { ...next.centerPoint };
  draftStartTangent = next.tangent;
  draftStartConnectionTrackId = next.trackId;
  const targetIds = findTrackGroup(state, next.trackId)?.trackIds ?? [next.trackId];
  draftConnectionAlignmentIndex = connectionCandidateIndexFromSelectedTrack(draftTrackCount, targetIds, next.trackId);
  showMessage(`接続先: ${next.trackId} (${connectionCandidateIndex + 1}/${connectionCandidates.length})`);
  updateUi();
  return true;
}

function showMessage(message: string, error = false): void {
  required("#message").textContent = message;
  const toast = required("#toast");
  toast.textContent = message;
  toast.classList.toggle("error", error);
  toast.classList.add("visible");
  window.setTimeout(() => toast.classList.remove("visible"), 1800);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function attachFleetPanelEvents(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-fleet-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      fleetUiState.leftSubTab = btn.dataset.fleetTab as typeof fleetUiState.leftSubTab;
      updateUi();
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      fleetUiState.formationFilter = btn.dataset.filter as typeof fleetUiState.formationFilter;
      updateUi();
    });
  });

  const createFormationBtn = document.querySelector<HTMLButtonElement>("#fleet-create-formation");
  if (createFormationBtn) {
    createFormationBtn.addEventListener("click", () => {
      const name = prompt("新規編成名を入力してください", `編成-${state.nextFormationId}`);
      if (!name) return;
      const succeeded = dispatch({ type: "fleet.formation.create", name });
      if (succeeded) {
        const created = state.fleet.formations.at(-1);
        if (created) fleetUiState.selectedFormationId = created.id;
      }
    });
  }

  document.querySelectorAll<HTMLElement>("[data-formation-id]").forEach((el) => {
    el.addEventListener("click", () => {
      fleetUiState.selectedFormationId = el.dataset.formationId || null;
      updateUi();
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-acquire-template]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tplId = btn.dataset.acquireTemplate;
      if (!tplId) return;
      const succeeded = dispatch({ type: "fleet.formation-template.acquire", templateId: tplId });
      if (succeeded) {
        const created = state.fleet.formations.at(-1);
        if (created) fleetUiState.selectedFormationId = created.id;
        fleetUiState.leftSubTab = "formations";
      }
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-acquire-design]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const designId = btn.dataset.acquireDesign;
      if (!designId) return;
      dispatch({ type: "fleet.vehicle.acquire", designId });
      fleetUiState.leftSubTab = "vehicles";
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-acquire-cat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      fleetUiState.acquireCategory = btn.dataset.acquireCat as typeof fleetUiState.acquireCategory;
      updateUi();
    });
  });

  const renameBtn = document.querySelector<HTMLButtonElement>("#fleet-rename-formation-btn");
  if (renameBtn && fleetUiState.selectedFormationId) {
    renameBtn.addEventListener("click", () => {
      const formation = state.fleet.formations.find((f) => f.id === fleetUiState.selectedFormationId);
      if (!formation) return;
      const name = prompt("新しい編成名を入力してください", formation.name);
      if (!name) return;
      dispatch({ type: "fleet.formation.rename", formationId: formation.id, name });
    });
  }

  document.querySelectorAll<HTMLButtonElement>("[data-v-move-up]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const vehicleId = btn.dataset.vMoveUp;
      if (!vehicleId || !fleetUiState.selectedFormationId) return;
      const formation = state.fleet.formations.find((f) => f.id === fleetUiState.selectedFormationId);
      if (!formation) return;
      const idx = formation.vehicles.findIndex((v) => v.vehicleId === vehicleId);
      if (idx > 0) dispatch({ type: "fleet.formation.vehicle.move", formationId: formation.id, vehicleId, targetIndex: idx - 1 });
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-v-move-down]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const vehicleId = btn.dataset.vMoveDown;
      if (!vehicleId || !fleetUiState.selectedFormationId) return;
      const formation = state.fleet.formations.find((f) => f.id === fleetUiState.selectedFormationId);
      if (!formation) return;
      const idx = formation.vehicles.findIndex((v) => v.vehicleId === vehicleId);
      if (idx >= 0 && idx < formation.vehicles.length - 1) dispatch({ type: "fleet.formation.vehicle.move", formationId: formation.id, vehicleId, targetIndex: idx + 1 });
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-v-reverse]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const vehicleId = btn.dataset.vReverse;
      if (!vehicleId || !fleetUiState.selectedFormationId) return;
      dispatch({ type: "fleet.formation.vehicle.reverse", formationId: fleetUiState.selectedFormationId, vehicleId });
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-v-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const vehicleId = btn.dataset.vRemove;
      if (!vehicleId || !fleetUiState.selectedFormationId) return;
      dispatch({ type: "fleet.formation.vehicle.remove", formationId: fleetUiState.selectedFormationId, vehicleId });
    });
  });

  const addVehicleBtn = document.querySelector<HTMLButtonElement>("#fleet-add-vehicle-btn");
  if (addVehicleBtn && fleetUiState.selectedFormationId) {
    addVehicleBtn.addEventListener("click", () => {
      const vehicleSelect = document.querySelector<HTMLSelectElement>("#fleet-add-vehicle-select");
      const posSelect = document.querySelector<HTMLSelectElement>("#fleet-add-vehicle-pos");
      const orientSelect = document.querySelector<HTMLSelectElement>("#fleet-add-vehicle-orient");
      if (!vehicleSelect || !vehicleSelect.value) return showMessage("追加する車両を選択してください", true);
      const placement = (posSelect?.value as "front" | "rear") || "rear";
      const orientation = (orientSelect?.value as Orientation) || "forward";
      dispatch({
        type: "fleet.formation.vehicle.add",
        formationId: fleetUiState.selectedFormationId!,
        vehicleId: vehicleSelect.value,
        placement,
        orientation,
      });
    });
  }

  const placeBtn = document.querySelector<HTMLButtonElement>("#fleet-place-btn");
  if (placeBtn) {
    placeBtn.addEventListener("click", () => {
      setTool("placement");
    });
  }

  const deleteFormationBtn = document.querySelector<HTMLButtonElement>("#fleet-delete-formation-btn");
  if (deleteFormationBtn && fleetUiState.selectedFormationId) {
    deleteFormationBtn.addEventListener("click", () => {
      const formationId = fleetUiState.selectedFormationId!;
      const succeeded = dispatch({ type: "fleet.formation.delete", formationId });
      if (succeeded) {
        fleetUiState.selectedFormationId = null;
      }
    });
  }

  const unplaceBtn = document.querySelector<HTMLButtonElement>("#fleet-unplace-btn");
  if (unplaceBtn && fleetUiState.selectedFormationId) {
    unplaceBtn.addEventListener("click", () => {
      dispatch({ type: "fleet.formation.unplace", formationId: fleetUiState.selectedFormationId! });
    });
  }

  document.querySelectorAll<HTMLButtonElement>("[data-dispatch-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      fleetUiState.dispatchMode = btn.dataset.dispatchMode as typeof fleetUiState.dispatchMode;
      updateUi();
    });
  });

  const dispatchExecuteBtn = document.querySelector<HTMLButtonElement>("#dispatch-execute-btn");
  if (dispatchExecuteBtn && fleetUiState.selectedFormationId) {
    dispatchExecuteBtn.addEventListener("click", () => {
      const routeSelect = document.querySelector<HTMLSelectElement>("#dispatch-route-select");
      const speedInput = document.querySelector<HTMLInputElement>("#dispatch-speed-input");
      const dwellInput = document.querySelector<HTMLInputElement>("#dispatch-dwell-input");

      if (!routeSelect || !routeSelect.value) return showMessage("運行経路を選択してください", true);
      const routeId = routeSelect.value;
      const requestedSpeedKph = Math.min(500, Math.max(1, Number(speedInput?.value) || 80));
      const dwellSeconds = Math.max(0, Number(dwellInput?.value) || 0);

      let departureTimeMs = state.clock.currentTimeMs;
      if (fleetUiState.dispatchMode === "scheduled") {
        const timeInput = document.querySelector<HTMLInputElement>("#dispatch-time-input");
        const timeText = timeInput?.value ?? "";
        fleetUiState.scheduledTimeText = timeText;
        const parsed = parseGameTimeText(timeText);
        if (parsed === null) {
          return showMessage("発車日時の形式が無効です。例: 1900/01/01 06:30", true);
        }
        if (parsed <= state.clock.currentTimeMs) {
          return showMessage("発車日時は現在時刻より未来を指定してください", true);
        }
        departureTimeMs = parsed;
      }

      dispatch({
        type: "fleet.dispatch.reserve",
        formationId: fleetUiState.selectedFormationId!,
        routeId,
        departureTimeMs,
        requestedSpeedKph,
        dwellSeconds,
      });
    });
  }

  const dispatchCancelBtn = document.querySelector<HTMLButtonElement>("#dispatch-cancel-btn");
  if (dispatchCancelBtn && fleetUiState.selectedFormationId) {
    dispatchCancelBtn.addEventListener("click", () => {
      const run = Object.values(state.trainRuns || {}).find(
        (r) => r.formationId === fleetUiState.selectedFormationId && r.status === "reserved"
      );
      if (run) {
        dispatch({ type: "fleet.dispatch.cancel", reservationId: run.id });
      }
    });
  }
}

let lineUiState: LineUiState = createInitialLineUiState();
let routeUiState: RouteUiState = createInitialRouteUiState();
let scheduleUiState: ScheduleUiState = createInitialScheduleUiState();
let returnToOperationAfterRouteCreate = false;
let vehicleDutyUiState: VehicleDutyUiState = createInitialVehicleDutyUiState();

function attachLinePanelEvents(): void {
  const createLineBtn = document.querySelector<HTMLButtonElement>("#line-create-open");
  if (createLineBtn) {
    createLineBtn.addEventListener("click", () => {
      lineUiState.isCreatingLine = true;
      lineUiState.editingLineId = undefined;
      updateUi();
    });
  }

  const editLineBtn = document.querySelector<HTMLButtonElement>("#line-edit-btn");
  if (editLineBtn && lineUiState.selectedLineId) {
    editLineBtn.addEventListener("click", () => {
      lineUiState.editingLineId = lineUiState.selectedLineId;
      lineUiState.isCreatingLine = false;
      updateUi();
    });
  }

  const saveSubmitBtn = document.querySelector<HTMLButtonElement>("#line-save-submit");
  if (saveSubmitBtn) {
    saveSubmitBtn.addEventListener("click", () => {
      const nameInput = document.querySelector<HTMLInputElement>("#line-name-input");
      const codeInput = document.querySelector<HTMLInputElement>("#line-code-input");
      const colorInput = document.querySelector<HTMLInputElement>("#line-color-input");
      const orderInput = document.querySelector<HTMLInputElement>("#line-order-input");
      const name = nameInput?.value ?? "";
      const code = codeInput?.value ?? "";
      const color = colorInput?.value ?? "#E65A00";
      const displayOrder = Number(orderInput?.value) || undefined;

      let succeeded = false;
      if (lineUiState.editingLineId) {
        succeeded = dispatch({ type: "line.update", payload: { id: lineUiState.editingLineId, name, code, color, displayOrder } });
      } else {
        succeeded = dispatch({ type: "line.create", payload: { name, code, color, displayOrder } });
      }

      if (succeeded) {
        lineUiState.isCreatingLine = false;
        lineUiState.editingLineId = undefined;
        if (!lineUiState.selectedLineId) {
          lineUiState.selectedLineId = Object.keys(state.lines).at(-1);
        }
        updateUi();
      }
    });
  }

  const saveCancelBtn = document.querySelector<HTMLButtonElement>("#line-save-cancel");
  if (saveCancelBtn) {
    saveCancelBtn.addEventListener("click", () => {
      lineUiState.isCreatingLine = false;
      lineUiState.editingLineId = undefined;
      updateUi();
    });
  }

  document.querySelectorAll<HTMLElement>("[data-line-id]").forEach((el) => {
    el.addEventListener("click", () => {
      lineUiState.selectedLineId = el.dataset.lineId;
      lineUiState.selectedServiceSystemId = undefined;
      lineUiState.isCreatingLine = false;
      lineUiState.editingLineId = undefined;
      lineUiState.isCreatingServiceSystem = false;
      lineUiState.editingServiceSystemId = undefined;
      updateUi();
    });
  });

  const lineDeleteBtn = document.querySelector<HTMLButtonElement>("#line-delete-btn");
  if (lineDeleteBtn && lineUiState.selectedLineId) {
    lineDeleteBtn.addEventListener("click", () => {
      const lineId = lineUiState.selectedLineId!;
      const succeeded = dispatch({ type: "line.delete", payload: { id: lineId } });
      if (succeeded) {
        lineUiState.selectedLineId = undefined;
        lineUiState.selectedServiceSystemId = undefined;
        updateUi();
      }
    });
  }

  // --- ServiceSystem Events ---
  const sysCreateBtn = document.querySelector<HTMLButtonElement>("#sys-create-open");
  if (sysCreateBtn && lineUiState.selectedLineId) {
    sysCreateBtn.addEventListener("click", () => {
      lineUiState.isCreatingServiceSystem = true;
      lineUiState.editingServiceSystemId = undefined;
      updateUi();
    });
  }

  document.querySelectorAll<HTMLButtonElement>(".sys-edit-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const sysId = btn.dataset.sysId;
      if (!sysId) return;
      lineUiState.editingServiceSystemId = sysId;
      lineUiState.isCreatingServiceSystem = false;
      updateUi();
    });
  });

  const sysSubmitBtn = document.querySelector<HTMLButtonElement>("#sys-save-submit");
  if (sysSubmitBtn && lineUiState.selectedLineId) {
    sysSubmitBtn.addEventListener("click", () => {
      const nameInput = document.querySelector<HTMLInputElement>("#sys-name-input");
      const shortInput = document.querySelector<HTMLInputElement>("#sys-shortname-input");
      const colorInput = document.querySelector<HTMLInputElement>("#sys-color-input");
      const inheritCb = document.querySelector<HTMLInputElement>("#sys-color-inherit-checkbox");
      const descInput = document.querySelector<HTMLInputElement>("#sys-desc-input");
      const orderInput = document.querySelector<HTMLInputElement>("#sys-order-input");

      const name = nameInput?.value ?? "";
      const shortName = shortInput?.value || undefined;
      const color = inheritCb?.checked ? undefined : (colorInput?.value || undefined);
      const description = descInput?.value || undefined;
      const displayOrder = Number(orderInput?.value) || undefined;

      let succeeded = false;
      if (lineUiState.editingServiceSystemId) {
        succeeded = dispatch({
          type: "serviceSystem.update",
          payload: { id: lineUiState.editingServiceSystemId, name, shortName, color, description, displayOrder },
        });
      } else {
        succeeded = dispatch({
          type: "serviceSystem.create",
          payload: { lineId: lineUiState.selectedLineId!, name, shortName, color, description, displayOrder },
        });
      }

      if (succeeded) {
        lineUiState.isCreatingServiceSystem = false;
        lineUiState.editingServiceSystemId = undefined;
        updateUi();
      }
    });
  }

  const sysCancelBtn = document.querySelector<HTMLButtonElement>("#sys-save-cancel");
  if (sysCancelBtn) {
    sysCancelBtn.addEventListener("click", () => {
      lineUiState.isCreatingServiceSystem = false;
      lineUiState.editingServiceSystemId = undefined;
      updateUi();
    });
  }

  document.querySelectorAll<HTMLButtonElement>(".sys-delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const sysId = btn.dataset.sysId;
      if (sysId) {
        const succeeded = dispatch({ type: "serviceSystem.delete", payload: { id: sysId } });
        if (succeeded && lineUiState.selectedServiceSystemId === sysId) {
          lineUiState.selectedServiceSystemId = undefined;
          updateUi();
        }
      }
    });
  });

  const lineCreateOpBtn = document.querySelector<HTMLButtonElement>("#line-create-op-btn");
  if (lineCreateOpBtn) {
    lineCreateOpBtn.addEventListener("click", () => {
      const lineId = lineCreateOpBtn.dataset.lineId;
      appMode = "schedule";
      scheduleUiState.isCreatingOperation = true;
      scheduleUiState.editingOperationId = undefined;
      scheduleUiState.draftName = "";
      scheduleUiState.draftOpNumber = "";
      scheduleUiState.draftCalendar = { weekdays: [1, 2, 3, 4, 5] };
      scheduleUiState.draftRouteId = undefined;
      scheduleUiState.draftStopTimes = undefined;
      scheduleUiState.draftLineAssignments = lineId ? [{ lineId }] : [];
      updateUi();
    });
  }

  document.querySelectorAll<HTMLButtonElement>(".sys-create-op-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const lineId = btn.dataset.lineId;
      const serviceSystemId = btn.dataset.sysId;
      if (lineId) {
        appMode = "schedule";
        scheduleUiState.isCreatingOperation = true;
        scheduleUiState.editingOperationId = undefined;
        scheduleUiState.draftName = "";
        scheduleUiState.draftOpNumber = "";
        scheduleUiState.draftCalendar = { weekdays: [1, 2, 3, 4, 5] };
        scheduleUiState.draftRouteId = undefined;
        scheduleUiState.draftStopTimes = undefined;
        scheduleUiState.draftLineAssignments = [{ lineId, serviceSystemId: serviceSystemId || undefined }];
        updateUi();
      }
    });
  });

  const lineAssignOpBtn = document.querySelector<HTMLButtonElement>("#line-assign-op-btn");
  if (lineAssignOpBtn) {
    lineAssignOpBtn.addEventListener("click", () => {
      const lineId = lineAssignOpBtn.dataset.lineId;
      const sel = document.querySelector<HTMLSelectElement>("#line-assign-op-select");
      const opId = sel?.value;
      if (lineId && opId) {
        dispatch({
          type: "operation.assignClassification",
          payload: { operationId: opId, lineId },
        });
      }
    });
  }

  document.querySelectorAll<HTMLButtonElement>(".sys-assign-op-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const lineId = btn.dataset.lineId;
      const sysId = btn.dataset.sysId;
      const sel = document.querySelector<HTMLSelectElement>(`.sys-assign-op-select[data-sys-id="${sysId}"]`);
      const opId = sel?.value;
      if (lineId && sysId && opId) {
        dispatch({
          type: "operation.assignClassification",
          payload: { operationId: opId, lineId, serviceSystemId: sysId },
        });
      }
    });
  });

  document.querySelectorAll<HTMLButtonElement>(".line-unassign-op-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const opId = btn.dataset.opId;
      const lineId = btn.dataset.lineId;
      if (opId && lineId) {
        dispatch({
          type: "operation.unassignClassification",
          payload: { operationId: opId, lineId },
        });
      }
    });
  });
}

function attachRoutePanelEvents(): void {
  const createRouteBtn = document.querySelector<HTMLButtonElement>("#route-create-open");
  if (createRouteBtn) {
    createRouteBtn.addEventListener("click", () => {
      routeUiState.isCreatingRoute = true;
      routeUiState.editingRouteId = undefined;
      routeUiState.draftName = "";
      routeUiState.draftDirectionName = "下り";
      routeUiState.draftStops = state.stations.slice(0, 2).map((s) => ({
        stationId: s.id,
        trackId: s.stopPoints[0]?.trackId || "",
        stopPointId: s.stopPoints[0]?.id,
        commercialType: "stop",
        dwellSeconds: 30,
      }));
      updateUi();
    });
  }

  document.querySelectorAll<HTMLElement>("[data-route-id]").forEach((el) => {
    el.addEventListener("click", () => {
      routeUiState.selectedRouteId = el.dataset.routeId;
      routeUiState.isCreatingRoute = false;
      routeUiState.editingRouteId = undefined;
      updateUi();
    });
  });

  const editRouteBtn = document.querySelector<HTMLButtonElement>("#route-edit-btn");
  if (editRouteBtn && routeUiState.selectedRouteId) {
    editRouteBtn.addEventListener("click", () => {
      const r = state.routes[routeUiState.selectedRouteId!];
      if (!r) return;
      routeUiState.editingRouteId = r.id;
      routeUiState.isCreatingRoute = false;
      routeUiState.draftName = r.name;
      routeUiState.draftDirectionName = r.directionName;
      routeUiState.draftStops = r.stops.map((s) => ({
        stationId: s.stationId,
        trackId: s.trackId,
        stopPointId: s.stopPointId,
        commercialType: s.commercialType,
        dwellSeconds: s.dwellSeconds,
      }));
      updateUi();
    });
  }

  const duplicateRevBtn = document.querySelector<HTMLButtonElement>("#route-duplicate-rev-btn");
  if (duplicateRevBtn && routeUiState.selectedRouteId) {
    duplicateRevBtn.addEventListener("click", () => {
      const sourceRouteId = routeUiState.selectedRouteId!;
      const succeeded = dispatch({
        type: "route.duplicateReverse",
        payload: { sourceRouteId },
      });
      if (succeeded) {
        routeUiState.selectedRouteId = Object.keys(state.routes).at(-1);
        updateUi();
      }
    });
  }

  const routeDeleteBtn = document.querySelector<HTMLButtonElement>("#route-delete-btn");
  if (routeDeleteBtn && routeUiState.selectedRouteId) {
    routeDeleteBtn.addEventListener("click", () => {
      const routeId = routeUiState.selectedRouteId!;
      const succeeded = dispatch({ type: "route.delete", payload: { id: routeId } });
      if (succeeded) {
        routeUiState.selectedRouteId = undefined;
        updateUi();
      }
    });
  }

  const addStationBtn = document.querySelector<HTMLButtonElement>("#route-station-add-btn");
  if (addStationBtn) {
    addStationBtn.addEventListener("click", () => {
      const select = document.querySelector<HTMLSelectElement>("#route-station-add-select");
      const stationId = select?.value;
      if (!stationId) return;
      const station = state.stations.find((s) => s.id === stationId);
      routeUiState.draftStops.push({
        stationId,
        trackId: station?.stopPoints[0]?.trackId || "",
        stopPointId: station?.stopPoints[0]?.id,
        commercialType: "stop",
        dwellSeconds: 30,
      });
      updateUi();
    });
  }

  document.querySelectorAll<HTMLButtonElement>(".route-stop-up").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.index);
      if (idx > 0) {
        const item = routeUiState.draftStops.splice(idx, 1)[0];
        routeUiState.draftStops.splice(idx - 1, 0, item);
        updateUi();
      }
    });
  });

  document.querySelectorAll<HTMLButtonElement>(".route-stop-down").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.index);
      if (idx < routeUiState.draftStops.length - 1) {
        const item = routeUiState.draftStops.splice(idx, 1)[0];
        routeUiState.draftStops.splice(idx + 1, 0, item);
        updateUi();
      }
    });
  });

  document.querySelectorAll<HTMLButtonElement>(".route-stop-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.index);
      routeUiState.draftStops.splice(idx, 1);
      updateUi();
    });
  });

  document.querySelectorAll<HTMLSelectElement>(".route-stop-track-select").forEach((sel) => {
    sel.addEventListener("change", () => {
      const idx = Number(sel.dataset.index);
      if (routeUiState.draftStops[idx]) {
        routeUiState.draftStops[idx].trackId = sel.value;
        const station = state.stations.find((s) => s.id === routeUiState.draftStops[idx].stationId);
        const sp = station?.stopPoints.find((p) => p.trackId === sel.value);
        routeUiState.draftStops[idx].stopPointId = sp?.id;
      }
    });
  });

  document.querySelectorAll<HTMLSelectElement>(".route-stop-comm-select").forEach((sel) => {
    sel.addEventListener("change", () => {
      const idx = Number(sel.dataset.index);
      if (routeUiState.draftStops[idx]) {
        routeUiState.draftStops[idx].commercialType = sel.value as any;
        updateUi();
      }
    });
  });

  document.querySelectorAll<HTMLInputElement>(".route-stop-dwell-input").forEach((inp) => {
    inp.addEventListener("change", () => {
      const idx = Number(inp.dataset.index);
      if (routeUiState.draftStops[idx]) {
        routeUiState.draftStops[idx].dwellSeconds = Number(inp.value) || 0;
      }
    });
  });

  const saveRouteSubmit = document.querySelector<HTMLButtonElement>("#route-save-submit");
  if (saveRouteSubmit) {
    saveRouteSubmit.addEventListener("click", () => {
      const nameInput = document.querySelector<HTMLInputElement>("#route-name-input");
      const dirInput = document.querySelector<HTMLInputElement>("#route-dir-input");
      const name = nameInput?.value || "";
      const directionName = dirInput?.value || "下り";

      const formattedStops = routeUiState.draftStops.map((st) => ({
        stationId: st.stationId,
        trackId: st.trackId,
        stopPointId: st.stopPointId,
        commercialType: st.commercialType || "stop",
        dwellSeconds: st.dwellSeconds,
      }));

      let succeeded = false;
      if (routeUiState.editingRouteId) {
        succeeded = dispatch({
          type: "route.update",
          payload: {
            id: routeUiState.editingRouteId,
            name,
            directionName,
            stops: formattedStops,
          },
        });
      } else {
        succeeded = dispatch({
          type: "route.create",
          payload: {
            name,
            directionName,
            stops: formattedStops,
          },
        });
      }

      if (succeeded) {
        routeUiState.isCreatingRoute = false;
        routeUiState.editingRouteId = undefined;
        routeUiState.selectedRouteId = Object.keys(state.routes).at(-1);
        if (returnToOperationAfterRouteCreate && scheduleUiState.editingOperationId && routeUiState.selectedRouteId) {
          scheduleUiState.draftRouteId = routeUiState.selectedRouteId;
          scheduleUiState.draftStopTimes = undefined;
          returnToOperationAfterRouteCreate = false;
          setMode("schedule");
          return;
        }
        updateUi();
      }
    });
  }

  const saveRouteCancel = document.querySelector<HTMLButtonElement>("#route-save-cancel");
  if (saveRouteCancel) {
    saveRouteCancel.addEventListener("click", () => {
      routeUiState.isCreatingRoute = false;
      routeUiState.editingRouteId = undefined;
      updateUi();
    });
  }
}

function attachSchedulePanelEvents(): void {
  const routeShortcutBtns = document.querySelectorAll<HTMLButtonElement>("#op-create-route-shortcut");
  routeShortcutBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!scheduleUiState.editingOperationId) {
        showMessage("先に経路未設定の運行を保存してください", true);
        return;
      }
      returnToOperationAfterRouteCreate = true;
      appMode = "route";
      routeUiState.isCreatingRoute = true;
      routeUiState.editingRouteId = undefined;
      routeUiState.draftName = "";
      routeUiState.draftDirectionName = "下り";
      routeUiState.draftStops = state.stations.slice(0, 2).map((s) => ({
        stationId: s.id,
        trackId: s.stopPoints[0]?.trackId || "",
        stopPointId: s.stopPoints[0]?.id,
        commercialType: "stop",
        dwellSeconds: 30,
      }));
      updateUi();
    });
  });

  const createOpBtn = document.querySelector<HTMLButtonElement>("#op-create-open");
  if (createOpBtn) {
    createOpBtn.addEventListener("click", () => {
      scheduleUiState.isCreatingOperation = true;
      scheduleUiState.editingOperationId = undefined;
      scheduleUiState.draftName = "";
      scheduleUiState.draftOpNumber = "";
      scheduleUiState.draftCalendar = { weekdays: [1, 2, 3, 4, 5] };
      scheduleUiState.draftRouteId = undefined;
      scheduleUiState.draftStopTimes = undefined;
      scheduleUiState.draftLineAssignments = [];
      updateUi();
    });
  }

  const operationRouteSelect = document.querySelector<HTMLSelectElement>("#op-route-select");
  if (operationRouteSelect) {
    operationRouteSelect.addEventListener("change", () => {
      scheduleUiState.draftRouteId = operationRouteSelect.value || undefined;
      scheduleUiState.draftStopTimes = undefined;
      updateUi();
    });
  }

  document.querySelectorAll<HTMLElement>("[data-operation-id]").forEach((el) => {
    el.addEventListener("click", () => {
      scheduleUiState.selectedOperationId = el.dataset.operationId;
      scheduleUiState.isCreatingOperation = false;
      scheduleUiState.editingOperationId = undefined;
      updateUi();
    });
  });

  const editOpBtn = document.querySelector<HTMLButtonElement>("#op-edit-btn");
  if (editOpBtn && scheduleUiState.selectedOperationId) {
    editOpBtn.addEventListener("click", () => {
      const op = state.operations[scheduleUiState.selectedOperationId!];
      if (!op) return;
      scheduleUiState.editingOperationId = op.id;
      scheduleUiState.isCreatingOperation = false;
      scheduleUiState.draftName = op.name;
      scheduleUiState.draftOpNumber = op.operationNumber;
      scheduleUiState.draftRouteId = op.routeId;
      scheduleUiState.draftCalendar = { ...op.calendar };
      scheduleUiState.draftStopTimes = op.stopTimes.map((st) => ({ ...st }));
      scheduleUiState.draftLineAssignments = op.lineAssignments ? op.lineAssignments.map((a) => ({ ...a })) : [];
      updateUi();
    });
  }

  const addOperationRouteBtn = document.querySelector<HTMLButtonElement>("#op-add-route-btn");
  if (addOperationRouteBtn && scheduleUiState.selectedOperationId) {
    addOperationRouteBtn.addEventListener("click", () => {
      const op = state.operations[scheduleUiState.selectedOperationId!];
      if (!op) return;
      scheduleUiState.editingOperationId = op.id;
      scheduleUiState.draftName = op.name;
      scheduleUiState.draftOpNumber = op.operationNumber;
      scheduleUiState.draftCalendar = { ...op.calendar };
      scheduleUiState.draftLineAssignments = op.lineAssignments?.map((a) => ({ ...a })) || [];
      returnToOperationAfterRouteCreate = true;
      appMode = "route";
      routeUiState.isCreatingRoute = true;
      routeUiState.editingRouteId = undefined;
      routeUiState.draftName = "";
      routeUiState.draftDirectionName = "下り";
      routeUiState.draftStops = state.stations.slice(0, 2).map((s) => ({
        stationId: s.id,
        trackId: s.stopPoints[0]?.trackId || "",
        stopPointId: s.stopPoints[0]?.id,
        commercialType: "stop",
        dwellSeconds: 30,
      }));
      updateUi();
    });
  }

  const duplicateOpBtn = document.querySelector<HTMLButtonElement>("#op-duplicate-btn");
  if (duplicateOpBtn && scheduleUiState.selectedOperationId) {
    duplicateOpBtn.addEventListener("click", () => {
      const sourceOpId = scheduleUiState.selectedOperationId!;
      const shiftMinStr = prompt("シフトする時間（分）を入力してください（例: 10, -5）", "10");
      if (shiftMinStr === null) return;
      const shiftMinutes = Number(shiftMinStr) || 0;
      const succeeded = dispatch({
        type: "operation.duplicate",
        payload: { sourceOperationId: sourceOpId, timeShiftMinutes: shiftMinutes },
      });
      if (succeeded) {
        scheduleUiState.selectedOperationId = Object.keys(state.operations).at(-1);
        updateUi();
      }
    });
  }

  const deleteOpBtn = document.querySelector<HTMLButtonElement>("#op-delete-btn");
  if (deleteOpBtn && scheduleUiState.selectedOperationId) {
    deleteOpBtn.addEventListener("click", () => {
      const opId = scheduleUiState.selectedOperationId!;
      const succeeded = dispatch({ type: "operation.delete", payload: { id: opId } });
      if (succeeded) {
        scheduleUiState.selectedOperationId = undefined;
        updateUi();
      }
    });
  }

  const markReviewedBtn = document.querySelector<HTMLButtonElement>("#op-mark-reviewed-btn");
  if (markReviewedBtn && scheduleUiState.selectedOperationId) {
    markReviewedBtn.addEventListener("click", () => {
      const opId = scheduleUiState.selectedOperationId!;
      dispatch({ type: "operation.update", payload: { id: opId, markReviewed: true } });
    });
  }

  // Weekday checkboxes and presets
  document.querySelectorAll<HTMLInputElement>(".op-weekday-checkbox").forEach((cb) => {
    cb.addEventListener("change", () => {
      const day = Number(cb.dataset.day);
      if (!scheduleUiState.draftCalendar) scheduleUiState.draftCalendar = { weekdays: [] };
      if (cb.checked) {
        if (!scheduleUiState.draftCalendar.weekdays.includes(day)) scheduleUiState.draftCalendar.weekdays.push(day);
      } else {
        scheduleUiState.draftCalendar.weekdays = scheduleUiState.draftCalendar.weekdays.filter((d) => d !== day);
      }
    });
  });

  const calAllBtn = document.querySelector<HTMLButtonElement>("#op-cal-all");
  if (calAllBtn) {
    calAllBtn.addEventListener("click", () => {
      scheduleUiState.draftCalendar = { weekdays: [0, 1, 2, 3, 4, 5, 6] };
      updateUi();
    });
  }
  const calWkBtn = document.querySelector<HTMLButtonElement>("#op-cal-weekday");
  if (calWkBtn) {
    calWkBtn.addEventListener("click", () => {
      scheduleUiState.draftCalendar = { weekdays: [1, 2, 3, 4, 5] };
      updateUi();
    });
  }
  const calWkendBtn = document.querySelector<HTMLButtonElement>("#op-cal-weekend");
  if (calWkendBtn) {
    calWkendBtn.addEventListener("click", () => {
      scheduleUiState.draftCalendar = { weekdays: [0, 6] };
      updateUi();
    });
  }

  // Draft classification selector
  const draftLineSelect = document.querySelector<HTMLSelectElement>("#op-draft-line-select");
  if (draftLineSelect) {
    draftLineSelect.addEventListener("change", () => {
      const sysSelect = document.querySelector<HTMLSelectElement>("#op-draft-sys-select");
      if (sysSelect) {
        const sysList = getServiceSystemsByLine(state, draftLineSelect.value);
        sysSelect.innerHTML =
          `<option value="">(系統なし・路線直属)</option>` +
          sysList.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");
      }
    });
  }

  const draftAssignBtn = document.querySelector<HTMLButtonElement>("#op-draft-assign-btn");
  if (draftAssignBtn) {
    draftAssignBtn.addEventListener("click", () => {
      const lineSel = document.querySelector<HTMLSelectElement>("#op-draft-line-select");
      const sysSel = document.querySelector<HTMLSelectElement>("#op-draft-sys-select");
      const lineId = lineSel?.value;
      const serviceSystemId = sysSel?.value || undefined;
      if (!lineId) return;
      if (!scheduleUiState.draftLineAssignments) scheduleUiState.draftLineAssignments = [];
      const existingIdx = scheduleUiState.draftLineAssignments.findIndex((a) => a.lineId === lineId);
      if (existingIdx >= 0) {
        scheduleUiState.draftLineAssignments[existingIdx] = { lineId, serviceSystemId };
      } else {
        scheduleUiState.draftLineAssignments.push({ lineId, serviceSystemId });
      }
      updateUi();
    });
  }

  document.querySelectorAll<HTMLButtonElement>(".op-draft-unassign-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.index);
      if (scheduleUiState.draftLineAssignments) {
        scheduleUiState.draftLineAssignments.splice(idx, 1);
        updateUi();
      }
    });
  });

  // Detail classification selectors
  const detailLineSelect = document.querySelector<HTMLSelectElement>("#op-detail-assign-line-select");
  if (detailLineSelect) {
    detailLineSelect.addEventListener("change", () => {
      const sysSelect = document.querySelector<HTMLSelectElement>("#op-detail-assign-sys-select");
      if (sysSelect) {
        const sysList = getServiceSystemsByLine(state, detailLineSelect.value);
        sysSelect.innerHTML =
          `<option value="">(系統なし・路線直属)</option>` +
          sysList.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");
      }
    });
  }

  const detailAssignBtn = document.querySelector<HTMLButtonElement>("#op-detail-assign-btn");
  if (detailAssignBtn) {
    detailAssignBtn.addEventListener("click", () => {
      const opId = detailAssignBtn.dataset.opId;
      const lineSel = document.querySelector<HTMLSelectElement>("#op-detail-assign-line-select");
      const sysSel = document.querySelector<HTMLSelectElement>("#op-detail-assign-sys-select");
      const lineId = lineSel?.value;
      const serviceSystemId = sysSel?.value || undefined;
      if (opId && lineId) {
        dispatch({
          type: "operation.assignClassification",
          payload: { operationId: opId, lineId, serviceSystemId },
        });
      }
    });
  }

  document.querySelectorAll<HTMLButtonElement>(".op-detail-unassign-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const opId = btn.dataset.opId;
      const lineId = btn.dataset.lineId;
      if (opId && lineId) {
        dispatch({
          type: "operation.unassignClassification",
          payload: { operationId: opId, lineId },
        });
      }
    });
  });

  const saveOpSubmit = document.querySelector<HTMLButtonElement>("#op-save-submit");
  if (saveOpSubmit) {
    saveOpSubmit.addEventListener("click", () => {
      const nameInput = document.querySelector<HTMLInputElement>("#op-name-input");
      const numInput = document.querySelector<HTMLInputElement>("#op-number-input");
      const routeSelect = document.querySelector<HTMLSelectElement>("#op-route-select");

      const name = nameInput?.value || "";
      const operationNumber = numInput?.value || undefined;
      const routeId = routeSelect?.value || scheduleUiState.draftRouteId || "";
      const route = routeId ? state.routes[routeId] : undefined;

      const stopTimes = (route?.stops || []).map((st, idx) => {
        const arrInp = document.querySelector<HTMLInputElement>(`.op-arr-input[data-index="${idx}"]`);
        const depInp = document.querySelector<HTMLInputElement>(`.op-dep-input[data-index="${idx}"]`);
        const dayInp = document.querySelector<HTMLInputElement>(`.op-dayoffset-input[data-index="${idx}"]`);

        return {
          routeStopId: st.id,
          arrivalTime: arrInp?.value || undefined,
          departureTime: depInp?.value || undefined,
          dayOffset: Number(dayInp?.value) || 0,
        };
      });

      const lineAssignments =
        scheduleUiState.draftLineAssignments && scheduleUiState.draftLineAssignments.length > 0
          ? scheduleUiState.draftLineAssignments
          : undefined;

      let succeeded = false;
      if (scheduleUiState.editingOperationId) {
        succeeded = dispatch({
          type: "operation.update",
          payload: {
            id: scheduleUiState.editingOperationId,
            name,
            operationNumber,
            routeId: routeId || undefined,
            calendar: scheduleUiState.draftCalendar || { weekdays: [1, 2, 3, 4, 5] },
            stopTimes,
            lineAssignments,
          },
        });
      } else {
        succeeded = dispatch({
          type: "operation.create",
          payload: {
            name,
            operationNumber,
            routeId: routeId || undefined,
            calendar: scheduleUiState.draftCalendar || { weekdays: [1, 2, 3, 4, 5] },
            stopTimes,
            lineAssignments,
          },
        });
      }

      if (succeeded) {
        scheduleUiState.isCreatingOperation = false;
        scheduleUiState.editingOperationId = undefined;
        scheduleUiState.selectedOperationId = Object.keys(state.operations).at(-1);
        updateUi();
      }
    });
  }

  const saveOpCancel = document.querySelector<HTMLButtonElement>("#op-save-cancel");
  if (saveOpCancel) {
    saveOpCancel.addEventListener("click", () => {
      scheduleUiState.isCreatingOperation = false;
      scheduleUiState.editingOperationId = undefined;
      updateUi();
    });
  }
}

function attachVehicleDutyPanelEvents(): void {
  const createDutyBtn = document.querySelector<HTMLButtonElement>("#duty-create-open");
  if (createDutyBtn) {
    createDutyBtn.addEventListener("click", () => {
      vehicleDutyUiState.isCreatingDuty = true;
      vehicleDutyUiState.editingDutyId = undefined;
      vehicleDutyUiState.draftName = "";
      vehicleDutyUiState.draftFormationId = undefined;
      vehicleDutyUiState.draftAssignments = [];
      updateUi();
    });
  }

  document.querySelectorAll<HTMLElement>("[data-duty-id]").forEach((el) => {
    el.addEventListener("click", () => {
      vehicleDutyUiState.selectedDutyId = el.dataset.dutyId;
      vehicleDutyUiState.isCreatingDuty = false;
      vehicleDutyUiState.editingDutyId = undefined;
      updateUi();
    });
  });

  const editDutyBtn = document.querySelector<HTMLButtonElement>("#duty-edit-btn");
  if (editDutyBtn && vehicleDutyUiState.selectedDutyId) {
    editDutyBtn.addEventListener("click", () => {
      const d = state.vehicleDuties[vehicleDutyUiState.selectedDutyId!];
      if (!d) return;
      vehicleDutyUiState.editingDutyId = d.id;
      vehicleDutyUiState.isCreatingDuty = false;
      vehicleDutyUiState.draftName = d.name;
      vehicleDutyUiState.draftFormationId = d.defaultFormationId;
      vehicleDutyUiState.draftAssignments = d.assignments.map((a) => ({ ...a }));
      updateUi();
    });
  }

  const deleteDutyBtn = document.querySelector<HTMLButtonElement>("#duty-delete-btn");
  if (deleteDutyBtn && vehicleDutyUiState.selectedDutyId) {
    deleteDutyBtn.addEventListener("click", () => {
      const dutyId = vehicleDutyUiState.selectedDutyId!;
      const succeeded = dispatch({ type: "vehicleDuty.delete", payload: { id: dutyId } });
      if (succeeded) {
        vehicleDutyUiState.selectedDutyId = undefined;
        updateUi();
      }
    });
  }

  const addOpBtn = document.querySelector<HTMLButtonElement>("#duty-op-add-btn");
  if (addOpBtn) {
    addOpBtn.addEventListener("click", () => {
      const select = document.querySelector<HTMLSelectElement>("#duty-op-add-select");
      const operationId = select?.value;
      if (!operationId) return;
      const seq = vehicleDutyUiState.draftAssignments.length + 1;
      const prev = vehicleDutyUiState.draftAssignments.at(-1);
      vehicleDutyUiState.draftAssignments.push({
        sequence: seq,
        operationId,
        serviceDayOffset: prev?.serviceDayOffset ?? 0,
      });
      updateUi();
    });
  }

  document.querySelectorAll<HTMLButtonElement>(".duty-assign-up").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.index);
      if (idx > 0) {
        const item = vehicleDutyUiState.draftAssignments.splice(idx, 1)[0];
        vehicleDutyUiState.draftAssignments.splice(idx - 1, 0, item);
        vehicleDutyUiState.draftAssignments.forEach((a, i) => (a.sequence = i + 1));
        updateUi();
      }
    });
  });

  document.querySelectorAll<HTMLButtonElement>(".duty-assign-down").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.index);
      if (idx < vehicleDutyUiState.draftAssignments.length - 1) {
        const item = vehicleDutyUiState.draftAssignments.splice(idx, 1)[0];
        vehicleDutyUiState.draftAssignments.splice(idx + 1, 0, item);
        vehicleDutyUiState.draftAssignments.forEach((a, i) => (a.sequence = i + 1));
        updateUi();
      }
    });
  });

  document.querySelectorAll<HTMLButtonElement>(".duty-assign-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.index);
      vehicleDutyUiState.draftAssignments.splice(idx, 1);
      vehicleDutyUiState.draftAssignments.forEach((a, i) => (a.sequence = i + 1));
      updateUi();
    });
  });

  document.querySelectorAll<HTMLInputElement>(".duty-service-day-input").forEach((inp) => {
    inp.addEventListener("change", () => {
      const idx = Number(inp.dataset.index);
      if (vehicleDutyUiState.draftAssignments[idx]) {
        vehicleDutyUiState.draftAssignments[idx].serviceDayOffset = Number(inp.value) || 0;
      }
    });
  });

  const replaceSubmitBtn = document.querySelector<HTMLButtonElement>("#duty-replace-submit-btn");
  if (replaceSubmitBtn && vehicleDutyUiState.selectedDutyId) {
    replaceSubmitBtn.addEventListener("click", () => {
      const dateInp = document.querySelector<HTMLInputElement>("#duty-date-input");
      const formSel = document.querySelector<HTMLSelectElement>("#duty-replace-formation-select");
      const serviceDate = dateInp?.value;
      const formationId = formSel?.value || undefined;
      if (!serviceDate) return showMessage("日付を指定してください", true);

      dispatch({
        type: "vehicleDutyExecution.replaceFormation",
        payload: {
          vehicleDutyId: vehicleDutyUiState.selectedDutyId!,
          serviceDate,
          formationId,
        },
      });
    });
  }

  const saveDutySubmit = document.querySelector<HTMLButtonElement>("#duty-save-submit");
  if (saveDutySubmit) {
    saveDutySubmit.addEventListener("click", () => {
      const nameInput = document.querySelector<HTMLInputElement>("#duty-name-input");
      const formSel = document.querySelector<HTMLSelectElement>("#duty-formation-select");
      const name = nameInput?.value || "";
      const defaultFormationId = formSel?.value || undefined;

      let succeeded = false;
      if (vehicleDutyUiState.editingDutyId) {
        succeeded = dispatch({
          type: "vehicleDuty.update",
          payload: {
            id: vehicleDutyUiState.editingDutyId,
            name,
            defaultFormationId,
            assignments: vehicleDutyUiState.draftAssignments,
          },
        });
      } else {
        succeeded = dispatch({
          type: "vehicleDuty.create",
          payload: {
            name,
            defaultFormationId,
            assignments: vehicleDutyUiState.draftAssignments,
          },
        });
      }

      if (succeeded) {
        vehicleDutyUiState.isCreatingDuty = false;
        vehicleDutyUiState.editingDutyId = undefined;
        vehicleDutyUiState.selectedDutyId = Object.keys(state.vehicleDuties).at(-1);
        updateUi();
      }
    });
  }

  const saveDutyCancel = document.querySelector<HTMLButtonElement>("#duty-save-cancel");
  if (saveDutyCancel) {
    saveDutyCancel.addEventListener("click", () => {
      vehicleDutyUiState.isCreatingDuty = false;
      vehicleDutyUiState.editingDutyId = undefined;
      updateUi();
    });
  }
}

function updateUi(): void {
  updateClockUi();

  const constructionTools = required<HTMLElement>("#construction-tools");
  const fleetLeftContainer = required<HTMLElement>("#fleet-left-container");
  const lineLeftContainer = required<HTMLElement>("#line-left-container");
  const routeLeftContainer = required<HTMLElement>("#route-left-container");
  const scheduleLeftContainer = required<HTMLElement>("#schedule-left-container");
  const dutyLeftContainer = required<HTMLElement>("#duty-left-container");

  const constructionInspector = required<HTMLElement>("#construction-inspector");
  const fleetRightContainer = required<HTMLElement>("#fleet-right-container");
  const lineRightContainer = required<HTMLElement>("#line-right-container");
  const routeRightContainer = required<HTMLElement>("#route-right-container");
  const scheduleRightContainer = required<HTMLElement>("#schedule-right-container");
  const dutyRightContainer = required<HTMLElement>("#duty-right-container");

  // Hide all dynamic containers by default
  fleetLeftContainer.hidden = true;
  lineLeftContainer.hidden = true;
  routeLeftContainer.hidden = true;
  scheduleLeftContainer.hidden = true;
  dutyLeftContainer.hidden = true;

  fleetRightContainer.hidden = true;
  lineRightContainer.hidden = true;
  routeRightContainer.hidden = true;
  scheduleRightContainer.hidden = true;
  dutyRightContainer.hidden = true;

  if (appMode === "vehicle") {
    constructionTools.hidden = true;
    constructionInspector.hidden = true;
    fleetLeftContainer.hidden = false;
    fleetRightContainer.hidden = false;
    fleetLeftContainer.innerHTML = renderFleetLeftPanel(state, fleetUiState);
    fleetRightContainer.innerHTML = renderFleetRightPanel(state, fleetUiState);
    attachFleetPanelEvents();
    return;
  }

  if (appMode === "line") {
    constructionTools.hidden = true;
    constructionInspector.hidden = true;
    lineLeftContainer.hidden = false;
    lineRightContainer.hidden = false;
    lineLeftContainer.innerHTML = renderLineLeftPanel(state, lineUiState);
    lineRightContainer.innerHTML = renderLineRightPanel(state, lineUiState);
    attachLinePanelEvents();
    return;
  }

  if (appMode === "route") {
    constructionTools.hidden = true;
    constructionInspector.hidden = true;
    routeLeftContainer.hidden = false;
    routeRightContainer.hidden = false;
    routeLeftContainer.innerHTML = renderRouteLeftPanel(state, routeUiState);
    routeRightContainer.innerHTML = renderRouteRightPanel(state, routeUiState);
    attachRoutePanelEvents();
    return;
  }

  if (appMode === "schedule") {
    constructionTools.hidden = true;
    constructionInspector.hidden = true;
    scheduleLeftContainer.hidden = false;
    scheduleRightContainer.hidden = false;
    scheduleLeftContainer.innerHTML = renderScheduleLeftPanel(state, scheduleUiState);
    scheduleRightContainer.innerHTML = renderScheduleRightPanel(state, scheduleUiState);
    attachSchedulePanelEvents();
    return;
  }

  if (appMode === "vehicleDuty") {
    constructionTools.hidden = true;
    constructionInspector.hidden = true;
    dutyLeftContainer.hidden = false;
    dutyRightContainer.hidden = false;
    dutyLeftContainer.innerHTML = renderVehicleDutyLeftPanel(state, vehicleDutyUiState);
    dutyRightContainer.innerHTML = renderVehicleDutyRightPanel(state, vehicleDutyUiState);
    attachVehicleDutyPanelEvents();
    return;
  }

  constructionTools.hidden = appMode !== "construction";
  fleetLeftContainer.hidden = true;
  lineLeftContainer.hidden = true;

  constructionInspector.hidden = false;
  fleetRightContainer.hidden = true;
  lineRightContainer.hidden = true;

  required("#track-count").textContent = String(state.tracks.length);
  required("#station-count").textContent = String(state.stations.length);
  required("#point-count").textContent = String(state.tracks.reduce((sum, track) => sum + track.points.length, 0));
  required("#zoom-label").textContent = `${Math.round(camera.zoom * 100)}%`;
  (required<HTMLButtonElement>("#finish")).disabled = draftPoints.length < 2;
  (required<HTMLButtonElement>("#finish")).hidden = tool !== "track" || draftGeometry === "straight";
  (required<HTMLButtonElement>("#undo")).disabled = draftPoints.length === 0;
  (required<HTMLButtonElement>("#cancel")).disabled = draftPoints.length === 0;
  const selectedTracks = state.tracks.filter((track) => selectedTrackIds.has(track.id));
  const selected = selectedTracks.length === 1 ? selectedTracks[0] : undefined;
  const selectedStations = state.stations.filter((station) => selectedStationIds.has(station.id));
  const selectedStation = selectedStations.length === 1 ? selectedStations[0] : undefined;
  const deleteButton = required<HTMLButtonElement>("#delete");
  deleteButton.disabled = selectedTrackIds.size === 0 && selectedStations.length === 0;
  deleteButton.innerHTML = selectedStations.length > 0
    ? `選択した${selectedStations.length}駅を撤去 <kbd>${shortcutLabel("selection.delete")}</kbd>`
    : `選択した線路を撤去 <kbd>${shortcutLabel("selection.delete")}</kbd>`;
  const connectionCount = selected
    ? state.junctions.filter((junction) => junction.ports.some((port) => port.trackId === selected.id)).length
    : 0;
  const selectedSpecification = selected
      ? [
        trackCatalog.getGauge(selected.specification.gaugeId).name,
        trackCatalog.getRailProfile(selected.specification.railProfileId).name,
        trackCatalog.getSupportSystem(selected.specification.supportSystemId).name,
        trackCatalog.getRoadbed(selected.specification.roadbedId).name,
      ].join(" / ")
    : "";
  required("#selection").innerHTML = selectedStation
    ? `<strong>${escapeHtml(selectedStation.name)}</strong><span>${selectedStation.id.replace("station-", "駅 ")} · 停車地点 ${selectedStation.stopPoints.length}箇所</span><span>${selectedStation.stopPoints.map((stopPoint) => `${stopPoint.trackId} · ${Math.round(stopPoint.endDistanceM - stopPoint.startDistanceM)} m`).join(" / ")}</span>`
    : selectedStations.length > 1
      ? `<strong>${selectedStations.length}駅を選択</strong><span>${selectedStations.map((station) => escapeHtml(station.name)).join(" / ")}</span><span>「駅を統合」で最初に選択した駅へまとめます</span>`
    : selected
    ? `<strong>${selected.id.replace("track-", "線路 ")}</strong><span>${selected.geometry === "curve" ? "曲線" : "直線"} · 接続 ${connectionCount}箇所${findTrackGroup(state, selected.id) ? ` · ${findTrackGroup(state, selected.id)!.name}` : " · 単独"}</span><span>${selectedSpecification}</span><span>最小半径 ${formatRadius(selected.engineering.builtMinimumRadiusM)} · 設計 ${selected.engineering.designSpeedKmh} km/h · カント ${selected.engineering.cantProfile[0]?.cantMm ?? 0} mm</span>`
    : selectedTracks.length > 1
      ? `<strong>${selectedTracks.length}本を選択</strong><span>${[...new Set(selectedTracks.map((track) => findTrackGroup(state, track.id)?.name ?? "単独線路"))].join(" / ")}</span><span>Shift＋クリックで選択を追加・解除できます</span>`
      : `<span>線路を選択していません</span>`;
  const selectedGroups = [...new Set(selectedTracks.flatMap((track) => findTrackGroup(state, track.id)?.id ?? []))];
  const ungroupedCount = selectedTracks.filter((track) => !findTrackGroup(state, track.id)).length;
  required<HTMLButtonElement>("#group-create").disabled = selectedTracks.length < 2 || ungroupedCount !== selectedTracks.length;
  required<HTMLButtonElement>("#group-add").disabled = selectedGroups.length !== 1 || ungroupedCount === 0;
  required<HTMLButtonElement>("#group-remove").disabled = selectedGroups.length === 0;
  required<HTMLButtonElement>("#group-dissolve").disabled = selectedGroups.length === 0;
  required<HTMLButtonElement>("#station-rename").disabled = selectedStations.length !== 1;
  required<HTMLButtonElement>("#station-delete").disabled = selectedStations.length === 0;
  required<HTMLButtonElement>("#station-extend").disabled = selectedStations.length !== 1;
  required<HTMLButtonElement>("#station-merge").disabled = selectedStations.length < 2;
  required<HTMLButtonElement>("#route-create").disabled = selectedStations.length < 2;
  required<HTMLElement>("#group-actions").hidden = selectedTracks.length === 0;
  required<HTMLElement>("#station-actions").hidden = selectedStations.length === 0;
  const routes = Object.values(state.operationRoutes || {});
  const routeSelect = required<HTMLSelectElement>("#route-select");
  if (selectedRouteId && !routes.some((route) => route.id === selectedRouteId)) selectedRouteId = null;
  if (!selectedRouteId && routes.length > 0) selectedRouteId = routes[0].id;
  routeSelect.replaceChildren(...routes.map((route) => {
    const option = document.createElement("option");
    option.value = route.id;
    option.textContent = `${route.name} (${Math.round(route.lengthM ?? route.totalDistanceM ?? 0)} m)`;
    option.selected = route.id === selectedRouteId;
    return option;
  }));
  if (routes.length === 0) routeSelect.append(new Option("運行経路なし", ""));
  required<HTMLButtonElement>("#train-dispatch").disabled = !selectedRouteId;
  const running = state.operatingTrains.filter((train) => train.state !== "completed").length;
  const pendingReservations = Object.values(state.trainRuns || {}).filter((r) => r.status === "reserved").length;
  required("#operation-summary").textContent = `経路 ${routes.length} · 運行中 ${running} · 予約中 ${pendingReservations} · 終着 ${state.operatingTrains.length - running}`;
  const connectionMetrics = required<HTMLElement>("#connection-metrics");
  if (draftStartConnectionTrackId) {
    const otherCount = findTrackGroup(state, draftStartConnectionTrackId)?.trackIds.length ?? 1;
    const count = connectionCandidateCount(draftTrackCount, otherCount);
    connectionMetrics.hidden = false;
    const candidateInfo = connectionCandidates.length > 1 ? `　Tab: 次候補 ${connectionCandidateIndex + 1}/${connectionCandidates.length}` : "";
    const endTargetTrackId = draftEndConnectionTrackId ?? hoverSnapTrackId;
    const endCount = endTargetTrackId ? connectionCandidateCount(draftTrackCount, findTrackGroup(state, endTargetTrackId)?.trackIds.length ?? 1) : 0;
    const positionInfo = draftGeometry === "curve" && endTargetTrackId
      ? `N/M: 出発側 左/右　,/. : 到着側 左/右 (${draftEndConnectionAlignmentIndex + 1}/${endCount})　クリック: 確定`
      : `N: 左　M: 右　0: 中央${candidateInfo}`;
    connectionMetrics.innerHTML = `<span>接続対応</span><strong>${draftConnectionAlignmentIndex + 1} / ${count}</strong><small>${positionInfo}</small>`;
  } else {
    connectionMetrics.hidden = true;
  }
  updateCurveMetrics();
}

function updateClockUi(): void {
  const value = new Date(state.clock.currentTimeMs);
  const date = `${value.getUTCFullYear().toString().padStart(4, "0")}/${String(value.getUTCMonth() + 1).padStart(2, "0")}/${String(value.getUTCDate()).padStart(2, "0")}`;
  const time = `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}:${String(value.getUTCSeconds()).padStart(2, "0")}`;
  required("#simulation-time").textContent = `${date} ${time}`;
  const toggle = required<HTMLButtonElement>("#time-toggle");
  toggle.textContent = state.clock.paused ? "▶" : "Ⅱ";
  toggle.classList.toggle("active", !state.clock.paused);
  document.querySelectorAll<HTMLButtonElement>("[data-time-speed]").forEach((button) => button.classList.toggle("active", Number(button.dataset.timeSpeed) === state.clock.speedMultiplier));
}

function updateCurveMetrics(): void {
  const element = required("#curve-metrics");
  if (draftGeometry !== "curve" || draftPoints.length === 0) {
    element.innerHTML = `<span>曲線半径</span><strong>—</strong><small>曲線の敷設中に計算します</small>`;
    return;
  }
  const points = [...draftPoints];
  const draftEnd = points.at(-1);
  if (!draftEndConnectionTrackId && pointerWorld && (!draftEnd || Math.hypot(pointerWorld.x - draftEnd.x, pointerWorld.y - draftEnd.y) > 1e-6)) points.push(pointerWorld);
  if (points.length < 2) return;
  const centerLine = sampleTrack({
    geometry: draftGeometry,
    points,
    ...(draftStartTangent ? { startTangent: draftStartTangent } : {}),
    ...(draftEndTangent ?? hoverSnapTangent ? { endTangent: draftEndTangent ?? hoverSnapTangent! } : {}),
  });
  const previewLines = createParallelLines(centerLine, draftTrackCount, draftTrackSpacing);
  if (draftStartConnectionTrackId) {
    alignPathsToConnection(state, previewLines, draftStartConnectionTrackId, draftConnectionAlignmentIndex, centerLine[0]);
  }
  const endTargetTrackId = draftEndConnectionTrackId ?? hoverSnapTrackId;
  if (endTargetTrackId) {
    alignPathEndsToConnection(state, previewLines, endTargetTrackId, draftEndConnectionAlignmentIndex, centerLine.at(-1)!);
  }
  const alignment = analyzeTrackLines(previewLines);
  const localRadii = alignment.lines.flatMap((line) => {
    const radius = line.samples.at(-1)?.radiusM;
    return radius === null || radius === undefined ? [] : [radius];
  });
  const localRadius = localRadii.length > 0 ? Math.min(...localRadii) : null;
  const cant = recommendedCantMm(trackCatalog.getGauge(draftSpecification.gaugeId).gaugeMm, draftDesignSpeedKmh, alignment.minimumRadiusM);
  element.innerHTML = `<span>曲線半径</span><strong>${formatRadius(localRadius)}</strong><small>最小 ${formatRadius(alignment.minimumRadiusM)} · 推奨カント ${cant} mm</small>`;
}

function formatRadius(radiusM: number | null): string {
  return radiusM === null ? "直線 ∞" : `R ${Math.round(radiusM).toLocaleString("ja-JP")} m`;
}

function resizeCanvas(): void {
  const rect = canvas.parentElement?.getBoundingClientRect();
  if (!rect) return;
  canvas.width = Math.max(1, Math.round(rect.width));
  canvas.height = Math.max(1, Math.round(rect.height));
}

function frame(timestamp: number): void {
  const dt = previousFrameTime !== null ? Math.min(0.1, (timestamp - previousFrameTime) / 1000) : 0;
  previousFrameTime = timestamp;

  if (dt > 0 && !state.clock.paused) {
    simulationAccumulatorSeconds += dt;
  } else if (state.clock.paused) {
    simulationAccumulatorSeconds = 0;
  }
  if (simulationAccumulatorSeconds >= 0.1) {
    state = executeCommand(state, { type: "simulation.tick", elapsedSeconds: simulationAccumulatorSeconds * state.clock.speedMultiplier }).state;
    simulationAccumulatorSeconds = 0;
    updateClockUi();
  }

  // WASD/矢印キーによるカメラパン（テキスト入力中は無効）
  if (!isAnyTextFocused()) {
    const panSpeed = 400 / camera.zoom;
    let dx = 0;
    let dy = 0;
    if (pressedKeys.has("w") || pressedKeys.has("arrowup")) dy -= panSpeed * dt;
    if (pressedKeys.has("s") || pressedKeys.has("arrowdown")) dy += panSpeed * dt;
    if (pressedKeys.has("a") || pressedKeys.has("arrowleft")) dx -= panSpeed * dt;
    if (pressedKeys.has("d") || pressedKeys.has("arrowright")) dx += panSpeed * dt;
    if (dx !== 0 || dy !== 0) {
      // 回転を考慮してパン方向を変換
      const cos = Math.cos(camera.rotation);
      const sin = Math.sin(camera.rotation);
      camera = {
        ...camera,
        x: camera.x + (dx * cos + dy * sin),
        y: camera.y + (-dx * sin + dy * cos),
      };
    }

    // Q/E による回転
    const rotSpeed = Math.PI / 2; // 90度/秒
    if (pressedKeys.has("q")) camera = { ...camera, rotation: camera.rotation - rotSpeed * dt };
    if (pressedKeys.has("e")) camera = { ...camera, rotation: camera.rotation + rotSpeed * dt };
  }

  let routeBuilderPreview: { legs: any[]; isValid: boolean } | null = null;
  if (appMode === "route" && (routeUiState.isCreatingRoute || routeUiState.editingRouteId)) {
    if (routeUiState.draftStops.length >= 2) {
      try {
        const route = buildOperationRoute(state, {
          name: routeUiState.draftName || "Preview Route",
          stops: routeUiState.draftStops,
        });
        routeBuilderPreview = { legs: route.legs, isValid: true };
      } catch {
        routeBuilderPreview = { legs: [], isValid: false };
      }
    }
  }

  drawMap(context, state, camera, {
    draftPoints,
    pointerWorld,
    selectedTrackIds: [...selectedTrackIds],
    selectedStationIds: [...selectedStationIds],
    draftGeometry,
    snapPoint,
    draftStartTangent,
    draftEndTangent: draftEndTangent ?? (draftPoints.length > 0 && hoverSnapTrackId ? hoverSnapTangent : null),
    draftTrackCount,
    draftTrackSpacing,
    draftGaugeMm: trackCatalog.getGauge(draftSpecification.gaugeId).gaugeMm,
    draftStartConnectionTrackId,
    draftEndConnectionTrackId: draftEndConnectionTrackId ?? (draftPoints.length > 0 ? hoverSnapTrackId : null),
    draftEndConnectionFixed: draftEndConnectionTrackId !== null,
    draftConnectionAlignmentIndex,
    draftEndConnectionAlignmentIndex,
    stationRangeStart,
    stationScope,
    placementPreview: placementPreviewState,
    routeBuilderPreview,
  });
  requestAnimationFrame(frame);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
updateUi();
requestAnimationFrame(frame);
