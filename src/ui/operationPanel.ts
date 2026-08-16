import { formatGameTime } from "./fleetView";
import type { MapState } from "../simulation/model";
import { getEligibleRoutesForPlacement, getIneligibleRouteReasons } from "../simulation/selectors";
import { getExactStopPointOptions, getPreflightInspectionResult } from "./uiHelpers";
import type { CreateRouteStopInput } from "../simulation/pathfinding";

export interface OperationUiState {
  selectedRouteId?: string;
  selectedRunId?: string;
  isCreatingRoute: boolean;
  createRouteServicePatternId?: string;
  createRouteDirectionId?: string;
  createRouteName?: string;
  createRouteStops?: Record<string, { trackId: string; stopPointId?: string; commercialType?: "stop" | "pass"; dwellSeconds?: number }>;
  activeMapSelectStationId?: string;
  filterStatus?: string;
}

export function createInitialOperationUiState(): OperationUiState {
  return {
    isCreatingRoute: false,
  };
}

export function renderOperationLeftPanel(
  state: MapState,
  uiState: OperationUiState
): string {
  const routes = Object.values(state.operationRoutes || {});
  const trainRuns = Object.values(state.trainRuns || {});

  const routeCardsHtml = routes
    .map((route) => {
      const isActive = route.id === uiState.selectedRouteId ? "active" : "";
      const sp = state.servicePatterns[route.servicePatternId || ""];
      const dir = sp?.directions?.find((d: any) => d.id === route.directionId);
      const stationNames = route.stationIds
        .map((stId: string) => state.stations.find((s) => s.id === stId)?.name || stId)
        .join(" → ");

      return `
        <div class="card clickable ${isActive}" data-route-id="${route.id}" data-testid="op-route-card-${route.id}" style="margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong>${route.name}</strong>
            <span class="badge" style="font-size: 10px;">${sp?.name || "系統"}${dir ? ` (${dir.name})` : ""}</span>
          </div>
          <p style="font-size: 11px; color: #9ca3af; margin: 4px 0 0 0;">${stationNames}</p>
          <p style="font-size: 10px; color: #6b7280; margin: 2px 0 0 0;">総延長: ${Math.round(route.totalDistanceM)} m · ${route.stops?.length ?? 0} 駅</p>
        </div>
      `;
    })
    .join("");

  const filteredRuns = trainRuns.filter((run) => {
    if (!uiState.filterStatus || uiState.filterStatus === "all") return true;
    return run.status === uiState.filterStatus;
  });

  const statusLabels: Record<string, string> = {
    planned: "計画",
    reserved: "予約",
    operating: "運行中",
    completed: "完了",
    cancelled: "取消",
    failed: "失敗",
  };

  const runCardsHtml = filteredRuns
    .map((run) => {
      const route = state.operationRoutes[run.routeId];
      const formation = state.fleet.formations.find((f) => f.id === run.formationId);
      const isActive = run.id === uiState.selectedRunId ? "active" : "";
      const statusLabel = statusLabels[run.status] || run.status;

      return `
        <div class="card clickable ${isActive}" data-run-id="${run.id}" data-testid="op-run-card-${run.id}" style="margin-bottom: 6px; padding: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong style="font-size: 12px;">${run.id}</strong>
            <span class="badge status-${run.status}" style="font-size: 10px;">${statusLabel}</span>
          </div>
          <div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">
            経路: ${route?.name || run.routeId} · 編成: ${formation?.name || run.formationId}
          </div>
          <div style="font-size: 10px; color: #6b7280; margin-top: 2px;">
            発車予定: ${formatGameTime(run.scheduledDepartureTimeMs)} (${run.requestedSpeedKph} km/h)
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <div class="panel-section">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <p class="eyebrow" style="margin: 0;">物理運行経路 (${routes.length})</p>
        <button id="op-route-create-open" data-testid="op-route-create-open" class="flat-action">＋ 経路作成</button>
      </div>
      <div class="route-list" style="max-height: 200px; overflow-y: auto; margin-bottom: 16px;">
        ${routes.length === 0 ? `<p class="muted" style="font-size: 12px;">運行経路が登録されていません</p>` : routeCardsHtml}
      </div>

      <div class="divider"></div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <p class="eyebrow" style="margin: 0;">個別運行 (TrainRun)</p>
        <select id="op-run-filter" data-testid="op-run-filter" style="font-size: 11px; padding: 2px 4px;">
          <option value="all">すべて</option>
          <option value="reserved">予約済</option>
          <option value="operating">運行中</option>
          <option value="completed">完了</option>
          <option value="cancelled">取消</option>
          <option value="failed">失敗</option>
        </select>
      </div>

      <div class="run-list" style="max-height: 250px; overflow-y: auto;">
        ${filteredRuns.length === 0 ? `<p class="muted" style="font-size: 12px;">対象の個別運行がありません</p>` : runCardsHtml}
      </div>
    </div>
  `;
}

export function renderOperationRightPanel(
  state: MapState,
  uiState: OperationUiState
): string {
  // --- Operation Route Builder View ---
  if (uiState.isCreatingRoute) {
    const servicePatterns = Object.values(state.servicePatterns || {});

    // Selected ServicePattern
    const selectedSpId = uiState.createRouteServicePatternId || (servicePatterns[0]?.id ?? "");
    const selectedSp = state.servicePatterns[selectedSpId];
    const availableDirections = selectedSp?.directions || [];

    // Selected Direction
    const selectedDirId = uiState.createRouteDirectionId || (availableDirections[0]?.id ?? "");
    const selectedDir = availableDirections.find((d: any) => d.id === selectedDirId);

    // StopPattern for selected direction
    const spat = selectedDir ? state.stopPatterns[selectedDir.stopPatternId] : undefined;
    const spatStops = spat?.stops || [];

    // Check if a physical route already exists for this (servicePatternId, directionId)
    const existingRoute = selectedDir && selectedSp
      ? Object.values(state.operationRoutes || {}).find(
          (r) => r.servicePatternId === selectedSp.id && r.directionId === selectedDir.id
        )
      : undefined;

    // Prepared stops inputs
    const stopsPayload: CreateRouteStopInput[] = spatStops.map((st: any) => {
      const saved = uiState.createRouteStops?.[st.stationId];
      const station = state.stations.find((s) => s.id === st.stationId);
      const defaultSp = station?.stopPoints?.[0];
      return {
        stationId: st.stationId,
        trackId: saved?.trackId || defaultSp?.trackId || "",
        stopPointId: saved?.stopPointId || defaultSp?.id || "",
        commercialType: st.commercialType,
        dwellSeconds: saved?.dwellSeconds ?? st.defaultDwellSeconds ?? 30,
      };
    });

    // Run Preflight Route Inspection
    let isPreflightValid = false;
    let preflightSummaryHtml = "";

    if (spatStops.length >= 2 && selectedSpId && selectedDirId) {
      const inspection = getPreflightInspectionResult(state, {
        servicePatternId: selectedSpId,
        directionId: selectedDirId,
        stops: stopsPayload,
      });

      if (inspection.valid && inspection.summary) {
        isPreflightValid = true;
        preflightSummaryHtml = `
          <div class="preflight-status success" data-testid="preflight-status" style="background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; color: #10b981; padding: 8px; border-radius: 4px; font-size: 11px; margin-bottom: 12px;">
            <strong>✓ 接線適合経路確立:</strong> 全長 ${Math.round(inspection.summary.totalDistanceM)} m (${inspection.summary.legCount} 区間)
          </div>
        `;
      } else {
        const errorMsg = inspection.errors[0]?.message || "経路作成事前検証に失敗しました";
        preflightSummaryHtml = `
          <div class="preflight-status error" data-testid="preflight-status" style="background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; color: #ef4444; padding: 8px; border-radius: 4px; font-size: 11px; margin-bottom: 12px;">
            <strong>✕ 経路エラー:</strong> ${errorMsg}
          </div>
        `;
      }
    } else {
      preflightSummaryHtml = `
        <div class="preflight-status info" data-testid="preflight-status" style="background: rgba(59, 130, 246, 0.15); border: 1px solid #3b82f6; color: #93c5fd; padding: 8px; border-radius: 4px; font-size: 11px; margin-bottom: 12px;">
          ℹ 2駅以上の停車パターンを持つ運行系統・方向を選択してください。
        </div>
      `;
    }

    // Render ordered StopPattern entries builder rows
    const stopsBuilderRowsHtml = spatStops
      .map((st: any, idx: number) => {
        const station = state.stations.find((s) => s.id === st.stationId);
        const options = getExactStopPointOptions(state, st.stationId);
        const isPass = st.commercialType === "pass";
        const currentSel = stopsPayload[idx];
        const isMapPicking = uiState.activeMapSelectStationId === st.stationId;

        const optionsHtml = options
          .map(
            (opt: any) => `
            <option value="${opt.id}" ${currentSel?.stopPointId === opt.id ? "selected" : ""}>
              ${opt.label}
            </option>
          `
          )
          .join("");

        return `
          <div class="route-stop-builder-row ${isMapPicking ? "map-picking" : ""}" data-testid="route-stop-row-${idx}" style="padding: 8px; margin-bottom: 6px; background: rgba(255,255,255,0.04); border: 1px solid ${isMapPicking ? "#3b82f6" : "rgba(255,255,255,0.1)"}; border-radius: 4px; font-size: 11px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <div>
                <strong style="color: #60a5fa;">${idx + 1}. ${station?.name || st.stationId}</strong>
                <span class="badge" style="font-size: 9px; margin-left: 4px; background: ${isPass ? "#f59e0b" : "#10b981"}; color: #fff;">
                  ${isPass ? "通過" : `停車 (${currentSel?.dwellSeconds ?? 30}s)`}
                </span>
              </div>
              <button class="ghost op-stop-map-pick-btn" data-station-id="${st.stationId}" data-testid="op-stop-map-pick-${idx}" style="font-size: 10px; padding: 2px 6px; color: ${isMapPicking ? "#3b82f6" : "#9ca3af"};">
                ${isMapPicking ? "📍 地図選択中..." : "📍 地図上で選択"}
              </button>
            </div>
            <div>
              <label style="font-size: 10px; color: #9ca3af; display: block; margin-bottom: 2px;">指定停車ホーム / 停車地点 (StationStopPoint):</label>
              <select class="op-stop-point-select" data-station-id="${st.stationId}" data-testid="op-stop-point-select-${idx}" style="width: 100%; font-size: 11px;">
                ${options.length === 0 ? `<option value="">停車地点なし</option>` : optionsHtml}
              </select>
            </div>
          </div>
        `;
      })
      .join("");

    return `
      <div class="panel-section">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <p class="eyebrow" style="margin: 0;">物理運行経路の構築 (Route Builder)</p>
          <span class="badge" style="font-size: 10px;">Phase-1 Single Active Route</span>
        </div>

        <div style="margin-bottom: 8px;">
          <label style="font-size: 11px;">1. 運行系統選択</label>
          <select id="op-create-sp-select" data-testid="op-create-sp-select" style="width: 100%; font-size: 12px; margin-top: 2px;">
            ${servicePatterns.map((sp: any) => `<option value="${sp.id}" ${sp.id === selectedSpId ? "selected" : ""}>${sp.name} (${sp.type})</option>`).join("")}
          </select>
        </div>

        <div style="margin-bottom: 8px;">
          <label style="font-size: 11px;">2. 運行方向選択</label>
          <select id="op-create-dir-select" data-testid="op-create-dir-select" style="width: 100%; font-size: 12px; margin-top: 2px;" ${availableDirections.length === 0 ? "disabled" : ""}>
            ${availableDirections.length === 0 ? `<option value="">方向未登録</option>` : availableDirections.map((d: any) => `<option value="${d.id}" ${d.id === selectedDirId ? "selected" : ""}>${d.name}</option>`).join("")}
          </select>
        </div>

        <div style="margin-bottom: 10px;">
          <label style="font-size: 11px;">3. 経路名</label>
          <input id="op-create-name-input" data-testid="op-create-name-input" type="text" value="${uiState.createRouteName || (selectedSp && selectedDir ? `${selectedSp.name} ${selectedDir.name}` : "")}" placeholder="例: 下り本線各停" style="width: 100%; font-size: 12px; margin-top: 2px;" />
        </div>

        ${existingRoute ? `
          <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid #f59e0b; color: #fbbf24; padding: 6px 8px; border-radius: 4px; font-size: 10px; margin-bottom: 10px;">
            ℹ この運行方向には既に経路「${existingRoute.name}」が存在します。保存すると経路が置き換わります。
          </div>
        ` : ""}

        <div style="margin-bottom: 12px;">
          <label style="font-size: 11px; font-weight: bold; display: block; margin-bottom: 4px;">4. 各駅の停車線路 (StationStopPoint) 選択</label>
          <div id="op-create-stops-builder" style="max-height: 240px; overflow-y: auto; border: 1px solid rgba(255,255,255,0.1); padding: 4px; border-radius: 4px; margin-bottom: 8px;">
            ${spatStops.length === 0 ? `<p class="muted" style="font-size: 11px; text-align: center; margin: 8px 0;">選択した方向の停車パターンが未定義です</p>` : stopsBuilderRowsHtml}
          </div>
        </div>

        ${preflightSummaryHtml}

        <div style="display: flex; gap: 6px;">
          <button id="op-create-submit-btn" data-testid="op-create-submit-btn" class="primary full" ${!isPreflightValid ? "disabled" : ""} style="font-size: 11px;">経路作成・確定</button>
          <button id="op-create-cancel-btn" data-testid="op-create-cancel-btn" class="ghost full" style="font-size: 11px;">キャンセル</button>
        </div>
      </div>
    `;
  }

  // --- TrainRun Details View ---
  const selectedRoute = uiState.selectedRouteId ? state.operationRoutes[uiState.selectedRouteId] : undefined;
  const selectedRun = uiState.selectedRunId ? state.trainRuns[uiState.selectedRunId] : undefined;

  if (selectedRun) {
    const route = state.operationRoutes[selectedRun.routeId];
    const formation = state.fleet.formations.find((f) => f.id === selectedRun.formationId);
    const canCancel = selectedRun.status === "planned" || selectedRun.status === "reserved";

    return `
      <div class="panel-section">
        <p class="eyebrow">個別運行詳細 (${selectedRun.id})</p>

        <div class="card" style="margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between;">
            <span>ステータス</span>
            <strong class="badge status-${selectedRun.status}">${selectedRun.status}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 4px;">
            <span>運行経路</span>
            <strong>${route?.name || selectedRun.routeId}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 4px;">
            <span>充当編成</span>
            <strong>${formation?.name || selectedRun.formationId}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 4px;">
            <span>発車予定時刻</span>
            <strong>${formatGameTime(selectedRun.scheduledDepartureTimeMs)}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 4px;">
            <span>要求速度</span>
            <strong>${selectedRun.requestedSpeedKph} km/h</strong>
          </div>
          ${selectedRun.failureReason ? `
            <div style="margin-top: 8px; color: #ef4444; font-size: 11px;">
              エラー: ${selectedRun.failureReason}
            </div>
          ` : ""}
        </div>

        ${canCancel ? `
          <button id="op-run-cancel-btn" data-testid="op-run-cancel-btn" class="danger full" data-run-id="${selectedRun.id}" style="font-size: 11px;">運行予約をキャンセル</button>
        ` : ""}
      </div>
    `;
  }

  // --- OperationRoute Details View & TrainRun Dispatch ---
  if (selectedRoute) {
    const placedFormations = state.vehiclePlacements.map((p) => {
      const f = state.fleet.formations.find((form) => form.id === p.formationId);
      const eligibleRoutes = getEligibleRoutesForPlacement(state, p.id);
      const isEligible = eligibleRoutes.some((r) => r.id === selectedRoute.id);
      const reasons = isEligible ? [] : getIneligibleRouteReasons(state, p.id, selectedRoute.id);

      return {
        placement: p,
        formation: f,
        isEligible,
        reasons,
      };
    });

    const stopsListHtml = (selectedRoute.stops || [])
      .map((st: any) => {
        const station = state.stations.find((s) => s.id === st.stationId);
        const commLabel = st.commercialType === "pass" ? "通過" : `停車 (${st.dwellSeconds}s)`;
        return `
          <div style="display: flex; justify-content: space-between; font-size: 11px; padding: 4px 0; border-bottom: 1px dashed rgba(255,255,255,0.1);">
            <span>${st.sequence}. ${station?.name || st.stationId} (${st.trackId})</span>
            <span style="color: ${st.commercialType === "pass" ? "#f59e0b" : "#10b981"};">${commLabel}</span>
          </div>
        `;
      })
      .join("");

    return `
      <div class="panel-section">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <strong style="font-size: 15px;">${selectedRoute.name}</strong>
          <button id="op-route-delete-btn" data-testid="op-route-delete-btn" class="danger" data-route-id="${selectedRoute.id}" style="font-size: 10px; padding: 2px 6px;">経路削除</button>
        </div>
        <p style="font-size: 11px; color: #9ca3af; margin-bottom: 12px;">総距離: ${Math.round(selectedRoute.totalDistanceM)} m · 区間数: ${selectedRoute.legs?.length ?? 0}</p>

        <p class="eyebrow" style="margin-bottom: 4px;">停車駅・停車線路一覧</p>
        <div style="margin-bottom: 16px; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px;">
          ${stopsListHtml}
        </div>

        <div class="divider"></div>

        <p class="eyebrow">個別運行 (TrainRun) の作成・発車予約</p>
        <div style="margin-bottom: 8px;">
          <label style="font-size: 11px;">充当編成選択 (適合性フィルタ済)</label>
          <select id="op-schedule-formation-select" data-testid="op-schedule-formation-select" style="width: 100%; font-size: 12px;">
            <option value="">-- 編成を選択 --</option>
            ${placedFormations
              .map(
                (item) => `
                <option value="${item.formation?.id}" ${!item.isEligible ? "disabled" : ""}>
                  ${item.formation?.name || item.placement.formationId} ${item.isEligible ? "(適合)" : `(不適合: ${item.reasons[0] || ""})`}
                </option>
              `
              )
              .join("")}
          </select>
        </div>

        <div style="margin-bottom: 8px;">
          <label style="font-size: 11px;">発車方法</label>
          <select id="op-schedule-type" data-testid="op-schedule-type" style="width: 100%; font-size: 12px;">
            <option value="immediate">即時発車</option>
            <option value="scheduled">時刻指定予約</option>
          </select>
        </div>

        <div id="op-scheduled-time-wrap" style="margin-bottom: 8px;" hidden>
          <label style="font-size: 11px;">発車指定時刻 (YYYY/MM/DD HH:MM:SS)</label>
          <input id="op-scheduled-time-input" data-testid="op-scheduled-time-input" type="text" placeholder="${formatGameTime(state.clock.currentTimeMs)}" style="width: 100%; font-size: 12px;" />
        </div>

        <div style="margin-bottom: 12px;">
          <label style="font-size: 11px;">最高速度 (km/h)</label>
          <input id="op-schedule-speed-input" data-testid="op-schedule-speed-input" type="number" min="10" max="500" value="80" style="width: 100%; font-size: 12px;" />
        </div>

        <button id="op-schedule-submit-btn" data-testid="op-schedule-submit-btn" class="primary full" style="font-size: 11px;">運行指示を登録</button>
      </div>
    `;
  }

  return `
    <div class="panel-section">
      <p class="muted">左パネルから物理運行経路または個別運行を選択してください。</p>
    </div>
  `;
}
