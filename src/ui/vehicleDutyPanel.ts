import type { MapState } from "../simulation/model";
import { getOperations, getVehicleDuties } from "../simulation/selectors";
import { getVehicleDutyPreflightInspection } from "./uiHelpers";
import { getEffectiveFormationForDutyDate } from "../simulation/vehicleDuty";
import { formatServiceDateUtc, type VehicleDutyAssignment } from "../simulation/serviceModel";

export interface VehicleDutyUiState {
  selectedDutyId?: string;
  isCreatingDuty: boolean;
  editingDutyId?: string;
  draftName?: string;
  draftFormationId?: string;
  draftAssignments: VehicleDutyAssignment[];
  executionDateInput?: string;
  replacingFormationId?: string;
}

export function createInitialVehicleDutyUiState(): VehicleDutyUiState {
  return {
    isCreatingDuty: false,
    draftAssignments: [],
    executionDateInput: formatServiceDateUtc(Date.now()),
  };
}

export function renderVehicleDutyLeftPanel(
  state: MapState,
  uiState: VehicleDutyUiState
): string {
  const duties = getVehicleDuties(state);

  const dutyCardsHtml = duties
    .map((duty) => {
      const isActive = duty.id === uiState.selectedDutyId ? "active" : "";
      const formation = duty.defaultFormationId ? state.fleet.formations.find((f) => f.id === duty.defaultFormationId) : undefined;
      const maxDay = Math.max(...duty.assignments.map((a) => a.serviceDayOffset), 0);

      return `
        <div class="card clickable ${isActive}" data-duty-id="${duty.id}" data-testid="duty-card-${duty.id}" style="margin-bottom: 8px; padding: 8px 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong>${duty.name}</strong>
            <span class="badge" style="font-size: 10px;">${maxDay + 1}日行程</span>
          </div>
          <div style="font-size: 11px; color: #9ca3af; margin: 3px 0 1px 0;">
            通常編成: ${formation?.name || "未割当"}
          </div>
          <div style="font-size: 10px; color: #6b7280;">
            割当運行数: ${duty.assignments.length}便
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <div class="panel-section">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <p class="eyebrow" style="margin: 0;">運用一覧 (${duties.length})</p>
        <button id="duty-create-open" data-testid="duty-create-open" class="flat-action">＋ 運用追加</button>
      </div>
      <div class="duty-list" style="max-height: calc(100vh - 200px); overflow-y: auto;">
        ${duties.length === 0 ? `<p class="muted">運用が登録されていません</p>` : dutyCardsHtml}
      </div>
    </div>
  `;
}

export function renderVehicleDutyRightPanel(
  state: MapState,
  uiState: VehicleDutyUiState
): string {
  // 1. Create or Edit Duty Builder
  if (uiState.isCreatingDuty || uiState.editingDutyId) {
    const isEdit = !!uiState.editingDutyId;
    const editingDuty = uiState.editingDutyId ? state.vehicleDuties[uiState.editingDutyId] : undefined;

    const assignments = uiState.draftAssignments;
    const operations = getOperations(state).filter((op) => Boolean(op.routeId && state.routes[op.routeId]));
    const formations = state.fleet.formations;

    // Preflight inspection
    let preflightHtml = "";
    if (assignments.length > 0) {
      const inspection = getVehicleDutyPreflightInspection(state, {
        assignments,
        defaultFormationId: uiState.draftFormationId || editingDuty?.defaultFormationId,
      });

      if (inspection.valid && inspection.details?.type === "vehicleDuty") {
        const d = inspection.details.data;
        preflightHtml = `
          <div class="preflight-status success" data-testid="duty-preflight-status" style="background: rgba(16, 185, 129, 0.12); border: 1px solid #10b981; color: #10b981; padding: 8px; border-radius: 4px; font-size: 11px; margin-bottom: 12px;">
            <strong>✓ 運用連続性適合:</strong> ${d.assignmentCount} 便 · ${d.totalDays} 日間行程 (同駅・同線路接続)
          </div>
        `;
      } else {
        const msg = inspection.errors[0]?.message || "運行間の接続駅・番線または時刻順序に不整合があります";
        preflightHtml = `
          <div class="preflight-status error" data-testid="duty-preflight-status" style="background: rgba(239, 68, 68, 0.12); border: 1px solid #ef4444; color: #ef4444; padding: 8px; border-radius: 4px; font-size: 11px; margin-bottom: 12px;">
            <strong>✕ 運用接続エラー:</strong> ${msg}
          </div>
        `;
      }
    }

    const formationOptionsHtml = [
      `<option value="">(未指定 - 運用保存可能)</option>`,
      ...formations.map((f) => `<option value="${f.id}" ${f.id === (uiState.draftFormationId ?? editingDuty?.defaultFormationId) ? "selected" : ""}>${f.name}</option>`),
    ].join("");

    const assignmentRowsHtml = assignments
      .map((a, idx) => {
        const op = state.operations[a.operationId];
        const route = op?.routeId ? state.routes[op.routeId] : undefined;
        const startStop = route?.stops[0];
        const endStop = route?.stops.at(-1);

        return `
          <div class="card" data-testid="duty-assign-row-${idx}" style="margin-bottom: 6px; padding: 6px 8px; font-size: 11px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <strong>${idx + 1}. ${op?.name || a.operationId}</strong>
              <div style="display: flex; gap: 2px;">
                <button class="ghost duty-assign-up" data-index="${idx}" ${idx === 0 ? "disabled" : ""} style="padding: 1px 4px; font-size: 9px;">▲</button>
                <button class="ghost duty-assign-down" data-index="${idx}" ${idx === assignments.length - 1 ? "disabled" : ""} style="padding: 1px 4px; font-size: 9px;">▼</button>
                <button class="danger duty-assign-remove" data-index="${idx}" style="padding: 1px 4px; font-size: 9px;">✕</button>
              </div>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; color: #9ca3af; font-size: 10px;">
              <span>区間: ${startStop?.stationId || "?"} (${startStop?.trackId || "?"}) → ${endStop?.stationId || "?"} (${endStop?.trackId || "?"})</span>
              <div style="display: flex; align-items: center; gap: 4px;">
                <span>日次:</span>
                <input type="number" min="0" max="10" class="duty-service-day-input" data-index="${idx}" value="${a.serviceDayOffset}" style="width: 38px; font-size: 10px; padding: 1px 3px;" />
                <span>日目</span>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    const opAddOptionsHtml = operations
      .map((op) => `<option value="${op.id}">${op.name} (${op.routeId ? state.routes[op.routeId]?.name || op.routeId : "経路未設定"})</option>`)
      .join("");

    return `
      <div class="panel-section" style="max-height: calc(100vh - 120px); overflow-y: auto;">
        <p class="eyebrow">${isEdit ? `運用編集: ${editingDuty?.name}` : "新規運用作成"}</p>

        <div class="form-group" style="margin-bottom: 8px;">
          <label style="font-size: 11px;">運用名 <span style="color: #ef4444;">*</span></label>
          <input id="duty-name-input" data-testid="duty-name-input" type="text" value="${uiState.draftName || editingDuty?.name || ""}" placeholder="例: 運用01 (東海道系統)" style="width: 100%; margin-top: 2px;" />
        </div>

        <div class="form-group" style="margin-bottom: 12px;">
          <label style="font-size: 11px;">通常割当編成 (任意)</label>
          <select id="duty-formation-select" data-testid="duty-formation-select" style="width: 100%; font-size: 11px; margin-top: 2px;">
            ${formationOptionsHtml}
          </select>
        </div>

        ${preflightHtml}

        <div style="margin-bottom: 12px;">
          <label style="font-size: 11px; font-weight: bold; display: block; margin-bottom: 4px;">運行割当順序 (${assignments.length}便)</label>
          <div style="max-height: 220px; overflow-y: auto; margin-bottom: 6px;">
            ${assignments.length === 0 ? `<p class="muted">運行が割り当てられていません</p>` : assignmentRowsHtml}
          </div>
          <div style="display: flex; gap: 4px;">
            <select id="duty-op-add-select" style="font-size: 11px; flex: 1;">
              ${opAddOptionsHtml}
            </select>
            <button id="duty-op-add-btn" class="ghost" style="font-size: 11px; padding: 2px 8px;">運行追加</button>
          </div>
        </div>

        <div style="display: flex; gap: 8px;">
          <button id="duty-save-submit" data-testid="duty-save-submit" class="primary full">${isEdit ? "保存" : "作成"}</button>
          <button id="duty-save-cancel" data-testid="duty-save-cancel" class="ghost full">キャンセル</button>
        </div>
      </div>
    `;
  }

  // 2. VehicleDuty Detail & Daily Execution Controller
  const selectedDuty = uiState.selectedDutyId ? state.vehicleDuties[uiState.selectedDutyId] : undefined;
  if (!selectedDuty) {
    return `
      <div class="panel-section">
        <p class="muted">左パネルから運用を選択してください。</p>
      </div>
    `;
  }

  const currentDate = uiState.executionDateInput || formatServiceDateUtc(state.clock.currentTimeMs);
  const effectiveFormationId = getEffectiveFormationForDutyDate(state, selectedDuty.id, currentDate);
  const effectiveFormation = effectiveFormationId ? state.fleet.formations.find((f) => f.id === effectiveFormationId) : undefined;
  const isCustomReplacement = effectiveFormationId !== selectedDuty.defaultFormationId;

  const formationOptionsHtml = [
    `<option value="">(編成未指定)</option>`,
    ...state.fleet.formations.map((f) => `<option value="${f.id}" ${f.id === effectiveFormationId ? "selected" : ""}>${f.name}</option>`),
  ].join("");

  const assignmentsListHtml = selectedDuty.assignments
    .map((a) => {
      const op = state.operations[a.operationId];
      const route = op?.routeId ? state.routes[op.routeId] : undefined;
      return `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 11px;">
          <td style="padding: 4px;">${a.sequence}</td>
          <td style="padding: 4px; font-weight: bold;">${op?.name || a.operationId}</td>
          <td style="padding: 4px; color: #9ca3af;">${route?.name || "-"}</td>
          <td style="padding: 4px;">${a.serviceDayOffset + 1}日目</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="panel-section">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.08);">
        <div>
          <h3 style="margin: 0; font-size: 15px;">${selectedDuty.name}</h3>
          <span style="font-size: 11px; color: #9ca3af;">割当便数: ${selectedDuty.assignments.length}便</span>
        </div>
        <div style="display: flex; gap: 4px;">
          <button id="duty-edit-btn" data-testid="duty-edit-btn" class="ghost" style="font-size: 11px; padding: 3px 8px;">編集</button>
          <button id="duty-delete-btn" data-testid="duty-delete-btn" class="danger" style="font-size: 11px; padding: 3px 8px;">削除</button>
        </div>
      </div>

      <div class="card" style="margin-bottom: 12px; padding: 8px; background: rgba(0,0,0,0.15);">
        <p class="eyebrow" style="margin-bottom: 6px;">日別運用実施・編成差し替え</p>
        <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 6px;">
          <label style="font-size: 11px;">対象日付:</label>
          <input type="date" id="duty-date-input" value="${currentDate}" style="font-size: 11px; padding: 2px 4px;" />
        </div>
        <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 6px;">
          <label style="font-size: 11px;">充当編成:</label>
          <select id="duty-replace-formation-select" style="font-size: 11px; flex: 1;">
            ${formationOptionsHtml}
          </select>
          <button id="duty-replace-submit-btn" class="ghost" style="font-size: 11px; padding: 2px 8px;">差し替え適用</button>
        </div>
        <div style="font-size: 10px; color: #9ca3af;">
          現在状態: ${effectiveFormation ? `<strong>${effectiveFormation.name}</strong>` : "未割当"}
          ${isCustomReplacement ? `<span class="badge warning" style="font-size: 8px; margin-left: 4px;">特定日差し替え中</span>` : ""}
        </div>
      </div>

      <p class="eyebrow" style="margin-bottom: 4px;">運用割当一覧</p>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px;">
        <thead>
          <tr style="text-align: left; font-size: 10px; color: #6b7280; border-bottom: 1px solid rgba(255,255,255,0.1);">
            <th style="padding: 4px;">順</th>
            <th style="padding: 4px;">運行名</th>
            <th style="padding: 4px;">経路</th>
            <th style="padding: 4px;">日次</th>
          </tr>
        </thead>
        <tbody>
          ${assignmentsListHtml}
        </tbody>
      </table>
    </div>
  `;
}
