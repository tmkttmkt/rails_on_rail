import type { MapState, Route } from "../simulation/model";
import { getOperations, getRoutes } from "../simulation/selectors";
import { getOperationPreflightInspection } from "./uiHelpers";
import { formatTimeWithDayOffset, type OperationStopTime, type ServiceCalendar } from "../simulation/serviceModel";

export interface ScheduleUiState {
  selectedOperationId?: string;
  isCreatingOperation: boolean;
  editingOperationId?: string;
  draftName?: string;
  draftOpNumber?: string;
  draftRouteId?: string;
  draftCalendar?: ServiceCalendar;
  draftStopTimes?: OperationStopTime[];
  duplicateShiftMinutes?: number;
}

export function createInitialScheduleUiState(): ScheduleUiState {
  return {
    isCreatingOperation: false,
    draftCalendar: { weekdays: [1, 2, 3, 4, 5] },
  };
}

export function renderScheduleLeftPanel(
  state: MapState,
  uiState: ScheduleUiState
): string {
  const operations = getOperations(state);

  const weekdayNames = ["日", "月", "火", "水", "木", "金", "土"];

  const opCardsHtml = operations
    .map((op) => {
      const isActive = op.id === uiState.selectedOperationId ? "active" : "";
      const route = state.routes[op.routeId];
      const firstStop = op.stopTimes[0];
      const lastStop = op.stopTimes.at(-1);

      const firstTimeStr = firstStop ? formatTimeWithDayOffset(firstStop.departureTime || firstStop.arrivalTime, firstStop.dayOffset) : "--:--";
      const lastTimeStr = lastStop ? formatTimeWithDayOffset(lastStop.arrivalTime || lastStop.departureTime, lastStop.dayOffset) : "--:--";

      const daysBadges = (op.calendar.weekdays || [])
        .map((d) => `<span class="badge" style="font-size: 9px; padding: 1px 3px; margin-right: 1px;">${weekdayNames[d]}</span>`)
        .join("");

      return `
        <div class="card clickable ${isActive}" data-operation-id="${op.id}" data-testid="operation-card-${op.id}" style="margin-bottom: 8px; padding: 8px 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong>${op.name} ${op.operationNumber ? `<small style="color: #9ca3af;">(${op.operationNumber})</small>` : ""}</strong>
            ${op.requiresReview ? `<span class="badge danger" style="font-size: 9px;">要確認</span>` : ""}
          </div>
          <div style="font-size: 11px; color: #9ca3af; margin: 3px 0 1px 0;">
            経路: ${route?.name || op.routeId}
          </div>
          <div style="font-size: 10px; color: #6b7280; margin-bottom: 4px;">
            時刻: ${firstTimeStr} → ${lastTimeStr} (${op.stopTimes.length}駅)
          </div>
          <div style="display: flex; flex-wrap: wrap;">
            ${daysBadges}
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <div class="panel-section">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <p class="eyebrow" style="margin: 0;">運行一覧 (${operations.length})</p>
        <button id="op-create-open" data-testid="op-create-open" class="flat-action">＋ 運行追加</button>
      </div>
      <div class="operation-list" style="max-height: calc(100vh - 200px); overflow-y: auto;">
        ${operations.length === 0 ? `<p class="muted">運行が登録されていません</p>` : opCardsHtml}
      </div>
    </div>
  `;
}

export function renderScheduleRightPanel(
  state: MapState,
  uiState: ScheduleUiState
): string {
  // 1. Create or Edit Operation
  if (uiState.isCreatingOperation || uiState.editingOperationId) {
    const isEdit = !!uiState.editingOperationId;
    const editingOp = uiState.editingOperationId ? state.operations[uiState.editingOperationId] : undefined;
    const routes = getRoutes(state);

    const selectedRouteId = uiState.draftRouteId || editingOp?.routeId || (routes[0]?.id ?? "");
    const selectedRoute = state.routes[selectedRouteId];

    const calendar = uiState.draftCalendar || editingOp?.calendar || { weekdays: [1, 2, 3, 4, 5] };
    const stopTimes = uiState.draftStopTimes || (editingOp ? editingOp.stopTimes : (selectedRoute ? defaultStopTimesFromRoute(selectedRoute) : []));

    // Preflight inspection
    let preflightHtml = "";
    if (selectedRoute && stopTimes.length === selectedRoute.stops.length) {
      const inspection = getOperationPreflightInspection(state, {
        routeId: selectedRoute.id,
        calendar,
        stopTimes,
      });

      if (inspection.valid && inspection.details?.type === "operation") {
        const d = inspection.details.data;
        preflightHtml = `
          <div class="preflight-status success" data-testid="op-preflight-status" style="background: rgba(16, 185, 129, 0.12); border: 1px solid #10b981; color: #10b981; padding: 8px; border-radius: 4px; font-size: 11px; margin-bottom: 12px;">
            <strong>✓ 運行時刻順当:</strong> 始発 ${d.initialDepartureTime} → 終着 ${d.finalArrivalTime} (最大日跨ぎ: ${d.multiDayMaxOffset}日後)
          </div>
        `;
      } else {
        const msg = inspection.errors[0]?.message || "着発時刻またはカレンダー順序に不整合があります";
        preflightHtml = `
          <div class="preflight-status error" data-testid="op-preflight-status" style="background: rgba(239, 68, 68, 0.12); border: 1px solid #ef4444; color: #ef4444; padding: 8px; border-radius: 4px; font-size: 11px; margin-bottom: 12px;">
            <strong>✕ 時刻順エラー:</strong> ${msg}
          </div>
        `;
      }
    }

    const routeOptionsHtml = routes
      .map((r) => `<option value="${r.id}" ${r.id === selectedRouteId ? "selected" : ""}>${r.name} (${r.directionName})</option>`)
      .join("");

    const weekdayLabels = [
      { day: 1, label: "月" },
      { day: 2, label: "火" },
      { day: 3, label: "水" },
      { day: 4, label: "木" },
      { day: 5, label: "金" },
      { day: 6, label: "土" },
      { day: 0, label: "日" },
    ];

    const weekdayCheckboxesHtml = weekdayLabels
      .map((w) => {
        const checked = calendar.weekdays.includes(w.day) ? "checked" : "";
        return `
          <label style="font-size: 11px; display: inline-flex; align-items: center; gap: 2px; cursor: pointer;">
            <input type="checkbox" class="op-weekday-checkbox" data-day="${w.day}" ${checked} /> ${w.label}
          </label>
        `;
      })
      .join("");

    // StopTimes Rows
    const stopTimeRowsHtml = (selectedRoute?.stops || [])
      .map((st, idx) => {
        const station = state.stations.find((s) => s.id === st.stationId);
        const curStTime = stopTimes.find((t) => t.routeStopId === st.id) || stopTimes[idx];
        const isFirst = idx === 0;
        const isLast = idx === (selectedRoute.stops.length - 1);
        const isPass = st.commercialType === "pass";

        return `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 11px;">
            <td style="padding: 4px;"><strong>${station?.name || st.stationId}</strong></td>
            <td style="padding: 4px; color: #9ca3af;">${isPass ? "通過" : "停車"}</td>
            <td style="padding: 4px;">
              <input type="time" step="1" class="op-arr-input" data-index="${idx}" value="${curStTime?.arrivalTime || ""}" ${isFirst ? "disabled" : ""} style="font-size: 10px; padding: 1px 3px;" />
            </td>
            <td style="padding: 4px;">
              <input type="time" step="1" class="op-dep-input" data-index="${idx}" value="${curStTime?.departureTime || ""}" ${isLast ? "disabled" : ""} style="font-size: 10px; padding: 1px 3px;" />
            </td>
            <td style="padding: 4px;">
              <input type="number" min="0" max="10" class="op-dayoffset-input" data-index="${idx}" value="${curStTime?.dayOffset ?? 0}" style="width: 38px; font-size: 10px; padding: 1px 3px;" />
            </td>
          </tr>
        `;
      })
      .join("");

    return `
      <div class="panel-section" style="max-height: calc(100vh - 120px); overflow-y: auto;">
        <p class="eyebrow">${isEdit ? `運行編集: ${editingOp?.name}` : "新規運行作成"}</p>

        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
          <div style="flex: 2;">
            <label style="font-size: 11px;">運行名 <span style="color: #ef4444;">*</span></label>
            <input id="op-name-input" data-testid="op-name-input" type="text" value="${uiState.draftName || editingOp?.name || ""}" placeholder="例: 普通 101M" style="width: 100%; margin-top: 2px;" />
          </div>
          <div style="flex: 1;">
            <label style="font-size: 11px;">運行番号 (列車番号)</label>
            <input id="op-number-input" data-testid="op-number-input" type="text" value="${uiState.draftOpNumber || editingOp?.operationNumber || ""}" placeholder="例: 101M" style="width: 100%; margin-top: 2px;" />
          </div>
        </div>

        <div class="form-group" style="margin-bottom: 8px;">
          <label style="font-size: 11px;">参照経路 <span style="color: #ef4444;">*</span></label>
          <select id="op-route-select" data-testid="op-route-select" style="width: 100%; font-size: 11px; margin-top: 2px;">
            ${routeOptionsHtml}
          </select>
        </div>

        <div class="form-group" style="margin-bottom: 12px; background: rgba(0,0,0,0.15); padding: 8px; border-radius: 4px;">
          <label style="font-size: 11px; font-weight: bold; display: block; margin-bottom: 4px;">運行日カレンダー</label>
          <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 6px;">
            ${weekdayCheckboxesHtml}
          </div>
          <div style="display: flex; gap: 4px;">
            <button id="op-cal-all" class="ghost" style="font-size: 9px; padding: 1px 6px;">全日</button>
            <button id="op-cal-weekday" class="ghost" style="font-size: 9px; padding: 1px 6px;">平日</button>
            <button id="op-cal-weekend" class="ghost" style="font-size: 9px; padding: 1px 6px;">休日</button>
          </div>
        </div>

        ${preflightHtml}

        <p class="eyebrow" style="margin-bottom: 4px;">各駅着発時刻・日跨ぎ設定 (dayOffset)</p>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px;">
          <thead>
            <tr style="text-align: left; font-size: 10px; color: #6b7280; border-bottom: 1px solid rgba(255,255,255,0.1);">
              <th style="padding: 4px;">駅名</th>
              <th style="padding: 4px;">種別</th>
              <th style="padding: 4px;">着時刻</th>
              <th style="padding: 4px;">発時刻</th>
              <th style="padding: 4px;">日跨ぎ</th>
            </tr>
          </thead>
          <tbody>
            ${stopTimeRowsHtml}
          </tbody>
        </table>

        <div style="display: flex; gap: 8px;">
          <button id="op-save-submit" data-testid="op-save-submit" class="primary full">${isEdit ? "保存" : "作成"}</button>
          <button id="op-save-cancel" data-testid="op-save-cancel" class="ghost full">キャンセル</button>
        </div>
      </div>
    `;
  }

  // 2. Operation Detail View
  const selectedOp = uiState.selectedOperationId ? state.operations[uiState.selectedOperationId] : undefined;
  if (!selectedOp) {
    return `
      <div class="panel-section">
        <p class="muted">左パネルから運行を選択してください。</p>
      </div>
    `;
  }

  const route = state.routes[selectedOp.routeId];

  const stopTimesTableHtml = selectedOp.stopTimes
    .map((st) => {
      const rStop = route?.stops.find((s) => s.id === st.routeStopId);
      const station = rStop ? state.stations.find((s) => s.id === rStop.stationId) : undefined;
      return `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 11px;">
          <td style="padding: 4px; font-weight: bold;">${station?.name || st.routeStopId}</td>
          <td style="padding: 4px; color: #9ca3af;">${st.arrivalTime || "-"}</td>
          <td style="padding: 4px; color: #9ca3af;">${st.departureTime || "-"}</td>
          <td style="padding: 4px;">${st.dayOffset > 0 ? `<span class="badge warning" style="font-size: 9px;">+${st.dayOffset}日</span>` : "当日"}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="panel-section">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.08);">
        <div>
          <h3 style="margin: 0; font-size: 15px;">${selectedOp.name} ${selectedOp.operationNumber ? `(${selectedOp.operationNumber})` : ""}</h3>
          <span style="font-size: 11px; color: #9ca3af;">経路: ${route?.name || selectedOp.routeId}</span>
        </div>
        <div style="display: flex; gap: 4px;">
          <button id="op-duplicate-btn" data-testid="op-duplicate-btn" class="ghost" style="font-size: 11px; padding: 3px 8px;">運行複製</button>
          <button id="op-edit-btn" data-testid="op-edit-btn" class="ghost" style="font-size: 11px; padding: 3px 8px;">編集</button>
          <button id="op-delete-btn" data-testid="op-delete-btn" class="danger" style="font-size: 11px; padding: 3px 8px;">削除</button>
        </div>
      </div>

      ${
        selectedOp.requiresReview
          ? `
        <div class="card warning" style="margin-bottom: 12px; padding: 8px; border: 1px solid #f59e0b; background: rgba(245, 158, 11, 0.12);">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #fbbf24; font-size: 11px; font-weight: bold;">⚠ 参照経路の停車駅構造が変更されました。時刻を確認してください。</span>
            <button id="op-mark-reviewed-btn" data-testid="op-mark-reviewed-btn" class="primary" style="font-size: 10px; padding: 2px 8px;">確認済みにする</button>
          </div>
        </div>
      `
          : ""
      }

      <p class="eyebrow" style="margin-bottom: 6px;">各駅時刻表</p>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px;">
        <thead>
          <tr style="text-align: left; font-size: 10px; color: #6b7280; border-bottom: 1px solid rgba(255,255,255,0.1);">
            <th style="padding: 4px;">駅名</th>
            <th style="padding: 4px;">着時刻</th>
            <th style="padding: 4px;">発時刻</th>
            <th style="padding: 4px;">日跨ぎ</th>
          </tr>
        </thead>
        <tbody>
          ${stopTimesTableHtml}
        </tbody>
      </table>
    </div>
  `;
}

function defaultStopTimesFromRoute(route: Route): OperationStopTime[] {
  return route.stops.map((st, idx) => {
    const isFirst = idx === 0;
    const isLast = idx === route.stops.length - 1;
    const baseSec = 28800 + idx * 180; // 08:00 + 3 min per stop
    const arrSec = isFirst ? undefined : baseSec - 30;
    const depSec = isLast ? undefined : baseSec;

    return {
      routeStopId: st.id,
      arrivalTime: arrSec !== undefined ? formatTimeSec(arrSec) : undefined,
      departureTime: depSec !== undefined ? formatTimeSec(depSec) : undefined,
      dayOffset: 0,
    };
  });
}

function formatTimeSec(s: number): string {
  const sec = ((s % 86400) + 86400) % 86400;
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const second = String(sec % 60).padStart(2, "0");
  return `${h}:${m}:${second}`;
}
