import type { MapState } from "../simulation/model";
import { getServiceSystemEffectiveColor } from "../simulation/lineServiceSystem";
import {
  getLines,
  getOperations,
  getOperationsByLine,
  getOperationsByServiceSystem,
  getServiceSystemsByLine,
} from "../simulation/selectors";

export interface LineUiState {
  selectedLineId?: string;
  selectedServiceSystemId?: string;
  isCreatingLine: boolean;
  editingLineId?: string;
  isCreatingServiceSystem: boolean;
  editingServiceSystemId?: string;
}

export function createInitialLineUiState(): LineUiState {
  return {
    isCreatingLine: false,
    isCreatingServiceSystem: false,
  };
}

export function renderLineLeftPanel(
  state: MapState,
  uiState: LineUiState
): string {
  const lines = getLines(state);

  const lineCardsHtml = lines
    .map((line) => {
      const systems = getServiceSystemsByLine(state, line.id);
      const ops = getOperationsByLine(state, line.id);
      const isActive = line.id === uiState.selectedLineId ? "active" : "";

      const systemsBadges = systems
        .map((sys) => {
          const color = getServiceSystemEffectiveColor(sys, line);
          const sysOps = getOperationsByServiceSystem(state, sys.id);
          return `
            <span class="badge" style="background: ${color}22; color: ${color}; border: 1px solid ${color}44; font-size: 10px; margin-right: 4px; margin-top: 2px;">
              ${sys.shortName || sys.name} (${sysOps.length})
            </span>
          `;
        })
        .join("");

      return `
        <div class="card clickable ${isActive}" data-line-id="${line.id}" data-testid="line-card-${line.id}" style="margin-bottom: 8px; border-left: 4px solid ${line.color}; padding: 8px 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong>${line.name} ${line.code ? `<small style="color: #9ca3af;">(${line.code})</small>` : ""}</strong>
            <span style="font-size: 10px; color: #9ca3af;">運行: ${ops.length}件</span>
          </div>
          <div style="margin-top: 6px; display: flex; flex-wrap: wrap; gap: 2px;">
            ${systems.length > 0 ? systemsBadges : `<span style="font-size: 10px; color: #6b7280;">系統未登録</span>`}
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <div class="panel-section">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <p class="eyebrow" style="margin: 0;">路線一覧 (${lines.length})</p>
        <button id="line-create-open" data-testid="line-create-open" class="flat-action">＋ 路線追加</button>
      </div>
      <div class="line-list" style="max-height: calc(100vh - 200px); overflow-y: auto;">
        ${lines.length === 0 ? `<p class="muted">路線が登録されていません</p>` : lineCardsHtml}
      </div>
    </div>
  `;
}

export function renderLineRightPanel(
  state: MapState,
  uiState: LineUiState
): string {
  // 1. Create or Edit Line Form
  if (uiState.isCreatingLine || uiState.editingLineId) {
    const editingLine = uiState.editingLineId ? state.lines[uiState.editingLineId] : undefined;
    const isEdit = !!editingLine;

    return `
      <div class="panel-section">
        <p class="eyebrow">${isEdit ? "路線編集" : "新規路線作成"}</p>
        <div class="form-group" style="margin-bottom: 8px;">
          <label style="font-size: 11px;">路線名 <span style="color: #ef4444;">*</span></label>
          <input id="line-name-input" data-testid="line-name-input" type="text" value="${editingLine?.name || ""}" placeholder="例: 本線" style="width: 100%; margin-top: 4px;" />
        </div>
        <div class="form-group" style="margin-bottom: 8px;">
          <label style="font-size: 11px;">路線記号 (Code)</label>
          <input id="line-code-input" data-testid="line-code-input" type="text" value="${editingLine?.code || ""}" placeholder="例: ML" style="width: 100%; margin-top: 4px;" />
        </div>
        <div class="form-group" style="margin-bottom: 8px;">
          <label style="font-size: 11px;">ラインカラー <span style="color: #ef4444;">*</span></label>
          <input id="line-color-input" data-testid="line-color-input" type="color" value="${editingLine?.color || "#E65A00"}" style="width: 100%; height: 36px; margin-top: 4px;" />
        </div>
        <div class="form-group" style="margin-bottom: 12px;">
          <label style="font-size: 11px;">表示順 (並び順)</label>
          <input id="line-order-input" data-testid="line-order-input" type="number" value="${editingLine?.displayOrder ?? Object.keys(state.lines).length + 1}" style="width: 100%; margin-top: 4px;" />
        </div>
        <div style="display: flex; gap: 8px;">
          <button id="line-save-submit" data-testid="line-save-submit" class="primary full">${isEdit ? "保存" : "作成"}</button>
          <button id="line-save-cancel" data-testid="line-save-cancel" class="ghost full">キャンセル</button>
        </div>
      </div>
    `;
  }

  const selectedLine = uiState.selectedLineId ? state.lines[uiState.selectedLineId] : undefined;
  if (!selectedLine) {
    return `
      <div class="panel-section">
        <p class="muted">左パネルから路線を選択してください。</p>
      </div>
    `;
  }

  // 2. Create or Edit ServiceSystem Form
  if (uiState.isCreatingServiceSystem || uiState.editingServiceSystemId) {
    const editingSys = uiState.editingServiceSystemId ? state.serviceSystems[uiState.editingServiceSystemId] : undefined;
    const isEdit = !!editingSys;

    return `
      <div class="panel-section">
        <p class="eyebrow">${isEdit ? "系統編集" : `新規系統追加 (${selectedLine.name})`}</p>
        <div class="form-group" style="margin-bottom: 8px;">
          <label style="font-size: 11px;">系統名 <span style="color: #ef4444;">*</span></label>
          <input id="sys-name-input" data-testid="sys-name-input" type="text" value="${editingSys?.name || ""}" placeholder="例: 快速" style="width: 100%; margin-top: 4px;" />
        </div>
        <div class="form-group" style="margin-bottom: 8px;">
          <label style="font-size: 11px;">略称 (Short Name)</label>
          <input id="sys-shortname-input" data-testid="sys-shortname-input" type="text" value="${editingSys?.shortName || ""}" placeholder="例: 快" style="width: 100%; margin-top: 4px;" />
        </div>
        <div class="form-group" style="margin-bottom: 8px;">
          <label style="font-size: 11px;">独自カラー (未指定時は親路線色「${selectedLine.color}」)</label>
          <div style="display: flex; gap: 6px; align-items: center; margin-top: 4px;">
            <input id="sys-color-input" data-testid="sys-color-input" type="color" value="${editingSys?.color || selectedLine.color}" style="height: 32px; flex: 1;" />
            <label style="font-size: 11px; display: inline-flex; align-items: center; gap: 4px;">
              <input id="sys-color-inherit-checkbox" type="checkbox" ${!editingSys?.color ? "checked" : ""} /> 親路線色を使用
            </label>
          </div>
        </div>
        <div class="form-group" style="margin-bottom: 8px;">
          <label style="font-size: 11px;">説明</label>
          <input id="sys-desc-input" data-testid="sys-desc-input" type="text" value="${editingSys?.description || ""}" placeholder="例: 主要駅のみ停車の速達系統" style="width: 100%; margin-top: 4px;" />
        </div>
        <div class="form-group" style="margin-bottom: 12px;">
          <label style="font-size: 11px;">表示順</label>
          <input id="sys-order-input" data-testid="sys-order-input" type="number" value="${editingSys?.displayOrder ?? getServiceSystemsByLine(state, selectedLine.id).length + 1}" style="width: 100%; margin-top: 4px;" />
        </div>
        <div style="display: flex; gap: 8px;">
          <button id="sys-save-submit" data-testid="sys-save-submit" class="primary full">${isEdit ? "保存" : "作成"}</button>
          <button id="sys-save-cancel" data-testid="sys-save-cancel" class="ghost full">キャンセル</button>
        </div>
      </div>
    `;
  }

  // 3. Line Detail & Systems & Assigned Operations
  const systems = getServiceSystemsByLine(state, selectedLine.id);
  const allOps = getOperations(state);
  const directLineOps = Object.values(state.operations || {}).filter((op) =>
    op.lineAssignments?.some((a) => a.lineId === selectedLine.id && !a.serviceSystemId)
  );

  // Unassigned or assignable operations options
  const unassignedToThisLineOps = allOps.filter(
    (op) => !op.lineAssignments?.some((a) => a.lineId === selectedLine.id)
  );
  const assignOptionsHtml = unassignedToThisLineOps
    .map((op) => `<option value="${op.id}">${op.name}${op.operationNumber ? ` (${op.operationNumber})` : ""}</option>`)
    .join("");

  const directOpsListHtml = directLineOps
    .map((op) => {
      const route = op.routeId ? state.routes[op.routeId] : undefined;
      return `
        <div class="card" style="margin-bottom: 4px; padding: 6px 8px; font-size: 11px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong>${op.name}</strong> ${op.operationNumber ? `<small style="color: #9ca3af;">(${op.operationNumber})</small>` : ""}
            <span style="font-size: 10px; color: #9ca3af; margin-left: 4px;">[${route?.name || op.routeId}]</span>
          </div>
          <button class="ghost line-unassign-op-btn" data-op-id="${op.id}" data-line-id="${selectedLine.id}" style="font-size: 10px; padding: 1px 6px;">所属解除</button>
        </div>
      `;
    })
    .join("");

  const systemsListHtml = systems
    .map((sys) => {
      const color = getServiceSystemEffectiveColor(sys, selectedLine);
      const sysOps = getOperationsByServiceSystem(state, sys.id);

      const sysOpsHtml = sysOps
        .map((op) => {
          const route = op.routeId ? state.routes[op.routeId] : undefined;
          return `
            <div class="card" style="margin-top: 4px; padding: 4px 6px; font-size: 10px; display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.15);">
              <div>
                <strong>${op.name}</strong> ${op.operationNumber ? `(${op.operationNumber})` : ""}
                <span style="color: #9ca3af; margin-left: 4px;">[${route?.name || op.routeId}]</span>
              </div>
              <button class="ghost line-unassign-op-btn" data-op-id="${op.id}" data-line-id="${selectedLine.id}" style="font-size: 9px; padding: 1px 4px;">所属解除</button>
            </div>
          `;
        })
        .join("");

      return `
        <div class="card" data-testid="sys-item-${sys.id}" style="margin-bottom: 8px; padding: 8px; border-left: 3px solid ${color};">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong>${sys.name}</strong>
              ${sys.shortName ? `<small style="color: #9ca3af; margin-left: 4px;">[${sys.shortName}]</small>` : ""}
              <span style="font-size: 10px; color: #9ca3af; margin-left: 6px;">運行: ${sysOps.length}件</span>
            </div>
            <div style="display: flex; gap: 4px;">
              <button class="flat-action sys-create-op-btn" data-line-id="${selectedLine.id}" data-sys-id="${sys.id}" data-testid="sys-create-op-${sys.id}" style="font-size: 10px; padding: 1px 6px;">＋ 運行作成</button>
              <button class="ghost sys-edit-btn" data-sys-id="${sys.id}" data-testid="sys-edit-${sys.id}" style="font-size: 10px; padding: 1px 6px;">編集</button>
              <button class="danger sys-delete-btn" data-sys-id="${sys.id}" data-testid="sys-delete-${sys.id}" style="font-size: 10px; padding: 1px 6px;">削除</button>
            </div>
          </div>
          ${sys.description ? `<p style="font-size: 10px; color: #9ca3af; margin: 3px 0 0 0;">${sys.description}</p>` : ""}
          <div style="margin-top: 6px;">
            ${sysOps.length > 0 ? sysOpsHtml : `<p class="muted" style="font-size: 10px; margin: 2px 0;">所属運行なし</p>`}
          </div>
          <div style="margin-top: 6px; display: flex; gap: 4px; align-items: center;">
            <select class="sys-assign-op-select" data-sys-id="${sys.id}" style="font-size: 10px; flex: 1;">
              <option value="">-- 既存運行を系統に所属 --</option>
              ${allOps
                .filter((op) => !op.lineAssignments?.some((a) => a.serviceSystemId === sys.id))
                .map((op) => `<option value="${op.id}">${op.name}${op.operationNumber ? ` (${op.operationNumber})` : ""}</option>`)
                .join("")}
            </select>
            <button class="ghost sys-assign-op-btn" data-line-id="${selectedLine.id}" data-sys-id="${sys.id}" style="font-size: 10px; padding: 2px 6px;">所属</button>
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <div class="panel-section" style="max-height: calc(100vh - 120px); overflow-y: auto;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.08);">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="display: inline-block; width: 14px; height: 14px; border-radius: 50%; background: ${selectedLine.color};"></span>
          <h3 style="margin: 0; font-size: 15px;">${selectedLine.name} ${selectedLine.code ? `(${selectedLine.code})` : ""}</h3>
        </div>
        <div style="display: flex; gap: 4px;">
          <button id="line-create-op-btn" data-line-id="${selectedLine.id}" class="flat-action" style="font-size: 11px; padding: 3px 8px;">＋ 運行作成</button>
          <button id="line-edit-btn" data-testid="line-edit-btn" class="ghost" style="font-size: 11px; padding: 3px 8px;">編集</button>
          <button id="line-delete-btn" data-testid="line-delete-btn" class="danger" style="font-size: 11px; padding: 3px 8px;">削除</button>
        </div>
      </div>

      <!-- Service Systems Section -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin: 12px 0 8px 0;">
        <p class="eyebrow" style="margin: 0;">所属系統 (${systems.length})</p>
        <button id="sys-create-open" data-testid="sys-create-open" class="flat-action">＋ 系統追加</button>
      </div>

      <div class="systems-list" style="margin-bottom: 16px;">
        ${systems.length === 0 ? `<p class="muted" style="font-size: 11px;">この路線にはまだ系統が登録されていません</p>` : systemsListHtml}
      </div>

      <!-- Direct Line Operations Section -->
      <div style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <p class="eyebrow" style="margin: 0;">路線直属運行 (${directLineOps.length})</p>
        </div>
        <div style="margin-bottom: 8px;">
          ${directLineOps.length === 0 ? `<p class="muted" style="font-size: 11px;">系統に属さない直属運行はありません</p>` : directOpsListHtml}
        </div>
        <div style="display: flex; gap: 4px; align-items: center;">
          <select id="line-assign-op-select" style="font-size: 10px; flex: 1;">
            <option value="">-- 既存運行を路線に所属 --</option>
            ${assignOptionsHtml}
          </select>
          <button id="line-assign-op-btn" data-line-id="${selectedLine.id}" class="ghost" style="font-size: 10px; padding: 2px 6px;">所属</button>
        </div>
      </div>
    </div>
  `;
}
