import type { MapState } from "../simulation/model";
import { getRoutes } from "../simulation/selectors";
import { getRoutePreflightInspection, getExactStopPointOptions } from "./uiHelpers";
import type { CreateRouteStopInput } from "../simulation/routeDomain";

export interface RouteUiState {
  selectedRouteId?: string;
  isCreatingRoute: boolean;
  editingRouteId?: string;
  draftName?: string;
  draftDirectionName?: string;
  draftStops: CreateRouteStopInput[];
}

export function createInitialRouteUiState(): RouteUiState {
  return {
    isCreatingRoute: false,
    draftStops: [],
  };
}

export function renderRouteLeftPanel(
  state: MapState,
  uiState: RouteUiState
): string {
  const routes = getRoutes(state);

  const routeCardsHtml = routes
    .map((route) => {
      const isActive = route.id === uiState.selectedRouteId ? "active" : "";
      const stopNames = route.stops.map((st) => state.stations.find((s) => s.id === st.stationId)?.name || st.stationId).join(" → ");

      return `
        <div class="card clickable ${isActive}" data-route-id="${route.id}" data-testid="route-card-${route.id}" style="margin-bottom: 8px; padding: 8px 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong>${route.name}</strong>
            <span class="badge" style="font-size: 10px;">${route.directionName}</span>
          </div>
          <div style="font-size: 11px; color: #9ca3af; margin: 4px 0 2px 0;">${stopNames}</div>
          <div style="font-size: 10px; color: #6b7280;">
            延長: ${Math.round(route.totalDistanceM ?? (route as any).lengthM ?? 0)} m · ${route.stops.length} 駅 (${route.legs.length} 区間)
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <div class="panel-section">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <p class="eyebrow" style="margin: 0;">経路一覧 (${routes.length})</p>
        <button id="route-create-open" data-testid="route-create-open" class="flat-action">＋ 経路追加</button>
      </div>
      <div class="route-list" style="max-height: calc(100vh - 200px); overflow-y: auto;">
        ${routes.length === 0 ? `<p class="muted">経路が登録されていません</p>` : routeCardsHtml}
      </div>
    </div>
  `;
}

export function renderRouteRightPanel(
  state: MapState,
  uiState: RouteUiState
): string {
  // 1. Create or Edit Route Builder
  if (uiState.isCreatingRoute || uiState.editingRouteId) {
    const isEdit = !!uiState.editingRouteId;
    const editingRoute = uiState.editingRouteId ? state.routes[uiState.editingRouteId] : undefined;

    const stops = uiState.draftStops;

    // Preflight inspection
    let preflightHtml = "";
    if (stops.length >= 2) {
      const inspection = getRoutePreflightInspection(state, {
        stops,
      });

      if (inspection.valid && inspection.details?.type === "route") {
        const d = inspection.details.data;
        preflightHtml = `
          <div class="preflight-status success" data-testid="route-preflight-status" style="background: rgba(16, 185, 129, 0.12); border: 1px solid #10b981; color: #10b981; padding: 8px; border-radius: 4px; font-size: 11px; margin-bottom: 12px;">
            <strong>✓ 接線適合経路確立:</strong> 全長 ${Math.round(d.totalDistanceM)} m · ${d.legCount} 区間 · 最小曲線半径: ${d.minimumRadiusM ? `${Math.round(d.minimumRadiusM)}m` : "直線のみ"}
          </div>
        `;
      } else {
        const msg = inspection.errors[0]?.message || "経路の接続に失敗しました";
        preflightHtml = `
          <div class="preflight-status error" data-testid="route-preflight-status" style="background: rgba(239, 68, 68, 0.12); border: 1px solid #ef4444; color: #ef4444; padding: 8px; border-radius: 4px; font-size: 11px; margin-bottom: 12px;">
            <strong>✕ 経路エラー:</strong> ${msg}
          </div>
        `;
      }
    } else {
      preflightHtml = `
        <div class="preflight-status info" style="background: rgba(59, 130, 246, 0.12); border: 1px solid #3b82f6; color: #93c5fd; padding: 8px; border-radius: 4px; font-size: 11px; margin-bottom: 12px;">
          ℹ 2駅以上の停車地点を指定してください。
        </div>
      `;
    }

    const stopsRowsHtml = stops
      .map((st, idx) => {
        const station = state.stations.find((s) => s.id === st.stationId);
        const options = getExactStopPointOptions(state, st.stationId);
        const isPass = st.commercialType === "pass";

        const trackOptionsHtml = options
          .map((opt) => `<option value="${opt.trackId}" ${opt.trackId === st.trackId ? "selected" : ""}>${opt.label}</option>`)
          .join("");

        return `
          <div class="card" data-testid="route-stop-row-${idx}" style="margin-bottom: 6px; padding: 6px 8px; font-size: 11px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <strong>${idx + 1}. ${station?.name || st.stationId}</strong>
              <div style="display: flex; gap: 2px;">
                <button class="ghost route-stop-up" data-index="${idx}" ${idx === 0 ? "disabled" : ""} style="padding: 1px 4px; font-size: 9px;">▲</button>
                <button class="ghost route-stop-down" data-index="${idx}" ${idx === stops.length - 1 ? "disabled" : ""} style="padding: 1px 4px; font-size: 9px;">▼</button>
                <button class="danger route-stop-remove" data-index="${idx}" style="padding: 1px 4px; font-size: 9px;">✕</button>
              </div>
            </div>
            <div style="display: flex; gap: 4px; align-items: center;">
              <select class="route-stop-track-select" data-index="${idx}" style="font-size: 10px; flex: 1;">
                ${trackOptionsHtml}
              </select>
              <select class="route-stop-comm-select" data-index="${idx}" style="font-size: 10px; width: 60px;">
                <option value="stop" ${!isPass ? "selected" : ""}>停車</option>
                <option value="pass" ${isPass ? "selected" : ""}>通過</option>
              </select>
              <input type="number" class="route-stop-dwell-input" data-index="${idx}" value="${st.dwellSeconds ?? 30}" min="0" max="600" ${isPass ? "disabled" : ""} style="width: 44px; font-size: 10px;" />
              <span style="font-size: 9px; color: #6b7280;">秒</span>
            </div>
          </div>
        `;
      })
      .join("");

    const stationAddOptionsHtml = state.stations
      .map((s) => `<option value="${s.id}">${s.name}</option>`)
      .join("");

    return `
      <div class="panel-section" style="max-height: calc(100vh - 120px); overflow-y: auto;">
        <p class="eyebrow">${isEdit ? `経路編集: ${editingRoute?.name}` : "新規経路作成"}</p>

        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
          <div style="flex: 2;">
            <label style="font-size: 11px;">経路名 <span style="color: #ef4444;">*</span></label>
            <input id="route-name-input" data-testid="route-name-input" type="text" value="${uiState.draftName || editingRoute?.name || ""}" placeholder="例: 本線下り快速" style="width: 100%; margin-top: 2px;" />
          </div>
          <div style="flex: 1;">
            <label style="font-size: 11px;">方向名</label>
            <input id="route-dir-input" data-testid="route-dir-input" type="text" value="${uiState.draftDirectionName || editingRoute?.directionName || "下り"}" placeholder="例: 下り" style="width: 100%; margin-top: 2px;" />
          </div>
        </div>

        ${preflightHtml}

        <div style="margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <label style="font-size: 11px; font-weight: bold;">停車地点順序 (${stops.length}駅)</label>
          </div>
          <div style="max-height: 220px; overflow-y: auto; margin-bottom: 6px;">
            ${stops.length === 0 ? `<p class="muted">地点が選択されていません</p>` : stopsRowsHtml}
          </div>
          <div style="display: flex; gap: 4px;">
            <select id="route-station-add-select" style="font-size: 11px; flex: 1;">
              ${stationAddOptionsHtml}
            </select>
            <button id="route-station-add-btn" class="ghost" style="font-size: 11px; padding: 2px 8px;">地点追加</button>
          </div>
        </div>

        <div style="display: flex; gap: 8px;">
          <button id="route-save-submit" data-testid="route-save-submit" class="primary full">${isEdit ? "保存" : "作成"}</button>
          <button id="route-save-cancel" data-testid="route-save-cancel" class="ghost full">キャンセル</button>
        </div>
      </div>
    `;
  }

  // 2. Route Detail View
  const selectedRoute = uiState.selectedRouteId ? state.routes[uiState.selectedRouteId] : undefined;
  if (!selectedRoute) {
    return `
      <div class="panel-section">
        <p class="muted">左パネルから経路を選択してください。</p>
      </div>
    `;
  }

  const stopsTableHtml = selectedRoute.stops
    .map((st, idx) => {
      const station = state.stations.find((s) => s.id === st.stationId);
      const isPass = st.commercialType === "pass";
      return `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 11px;">
          <td style="padding: 4px;">${idx + 1}</td>
          <td style="padding: 4px; font-weight: bold;">${station?.name || st.stationId}</td>
          <td style="padding: 4px; color: #9ca3af;">線路 ${st.trackId}</td>
          <td style="padding: 4px;"><span class="badge ${isPass ? "warning" : "success"}" style="font-size: 9px;">${isPass ? "通過" : "停車"}</span></td>
          <td style="padding: 4px; color: #9ca3af;">${isPass ? "-" : `${st.dwellSeconds}秒`}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="panel-section">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.08);">
        <div>
          <h3 style="margin: 0; font-size: 15px;">${selectedRoute.name}</h3>
          <span class="badge" style="font-size: 10px; margin-top: 2px;">方向: ${selectedRoute.directionName}</span>
        </div>
        <div style="display: flex; gap: 4px;">
          <button id="route-duplicate-rev-btn" data-testid="route-duplicate-rev-btn" class="ghost" style="font-size: 11px; padding: 3px 8px;">復路複製</button>
          <button id="route-edit-btn" data-testid="route-edit-btn" class="ghost" style="font-size: 11px; padding: 3px 8px;">編集</button>
          <button id="route-delete-btn" data-testid="route-delete-btn" class="danger" style="font-size: 11px; padding: 3px 8px;">削除</button>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; font-size: 11px; color: #9ca3af;">
        <div>総延長: <strong style="color: #fff;">${Math.round(selectedRoute.totalDistanceM ?? (selectedRoute as any).lengthM ?? 0)} m</strong></div>
        <div>区間数: <strong style="color: #fff;">${selectedRoute.legs.length}</strong></div>
      </div>

      <p class="eyebrow" style="margin-bottom: 6px;">停車地点一覧 (${selectedRoute.stops.length}駅)</p>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px;">
        <thead>
          <tr style="text-align: left; font-size: 10px; color: #6b7280; border-bottom: 1px solid rgba(255,255,255,0.1);">
            <th style="padding: 4px;">順</th>
            <th style="padding: 4px;">駅名</th>
            <th style="padding: 4px;">線路</th>
            <th style="padding: 4px;">種別</th>
            <th style="padding: 4px;">停車</th>
          </tr>
        </thead>
        <tbody>
          ${stopsTableHtml}
        </tbody>
      </table>
    </div>
  `;
}
