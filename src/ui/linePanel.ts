import type { MapState } from "../simulation/model";
import { getServiceSystemEffectiveColor } from "../simulation/lineServiceSystem";
import { getLines, getServiceSystemsByLine } from "../simulation/selectors";

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
      const isActive = line.id === uiState.selectedLineId ? "active" : "";

      const systemsBadges = systems
        .map((sys) => {
          const color = getServiceSystemEffectiveColor(sys, line);
          return `
            <span class="badge" style="background: ${color}22; color: ${color}; border: 1px solid ${color}44; font-size: 10px; margin-right: 4px; margin-top: 2px;">
              ${sys.shortName || sys.name}
            </span>
          `;
        })
        .join("");

      return `
        <div class="card clickable ${isActive}" data-line-id="${line.id}" data-testid="line-card-${line.id}" style="margin-bottom: 8px; border-left: 4px solid ${line.color}; padding: 8px 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong>${line.name} ${line.code ? `<small style="color: #9ca3af;">(${line.code})</small>` : ""}</strong>
            <span style="font-size: 11px; color: #6b7280;">順序: ${line.displayOrder}</span>
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
          <input id="line-name-input" data-testid="line-name-input" type="text" value="${editingLine?.name || ""}" placeholder="例: 東海道本線" style="width: 100%; margin-top: 4px;" />
        </div>
        <div class="form-group" style="margin-bottom: 8px;">
          <label style="font-size: 11px;">路線記号 (Code)</label>
          <input id="line-code-input" data-testid="line-code-input" type="text" value="${editingLine?.code || ""}" placeholder="例: JT" style="width: 100%; margin-top: 4px;" />
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
          <input id="sys-name-input" data-testid="sys-name-input" type="text" value="${editingSys?.name || ""}" placeholder="例: 快速アクティー" style="width: 100%; margin-top: 4px;" />
        </div>
        <div class="form-group" style="margin-bottom: 8px;">
          <label style="font-size: 11px;">略称 (Short Name)</label>
          <input id="sys-shortname-input" data-testid="sys-shortname-input" type="text" value="${editingSys?.shortName || ""}" placeholder="例: アクティー" style="width: 100%; margin-top: 4px;" />
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
          <input id="sys-desc-input" data-testid="sys-desc-input" type="text" value="${editingSys?.description || ""}" placeholder="例: 湘南エリアと都心を結ぶ快速系統" style="width: 100%; margin-top: 4px;" />
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

  // 3. Line Detail & Systems List
  const systems = getServiceSystemsByLine(state, selectedLine.id);

  const systemsListHtml = systems
    .map((sys) => {
      const color = getServiceSystemEffectiveColor(sys, selectedLine);
      return `
        <div class="card" data-testid="sys-item-${sys.id}" style="margin-bottom: 6px; padding: 8px; border-left: 3px solid ${color};">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong>${sys.name}</strong>
              ${sys.shortName ? `<small style="color: #9ca3af; margin-left: 4px;">[${sys.shortName}]</small>` : ""}
            </div>
            <div style="display: flex; gap: 4px;">
              <button class="ghost sys-edit-btn" data-sys-id="${sys.id}" data-testid="sys-edit-${sys.id}" style="font-size: 11px; padding: 2px 6px;">編集</button>
              <button class="danger sys-delete-btn" data-sys-id="${sys.id}" data-testid="sys-delete-${sys.id}" style="font-size: 11px; padding: 2px 6px;">削除</button>
            </div>
          </div>
          ${sys.description ? `<p style="font-size: 11px; color: #9ca3af; margin: 4px 0 0 0;">${sys.description}</p>` : ""}
        </div>
      `;
    })
    .join("");

  return `
    <div class="panel-section">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.08);">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="display: inline-block; width: 14px; height: 14px; border-radius: 50%; background: ${selectedLine.color};"></span>
          <h3 style="margin: 0; font-size: 15px;">${selectedLine.name} ${selectedLine.code ? `(${selectedLine.code})` : ""}</h3>
        </div>
        <div style="display: flex; gap: 4px;">
          <button id="line-edit-btn" data-testid="line-edit-btn" class="ghost" style="font-size: 11px; padding: 3px 8px;">路線編集</button>
          <button id="line-delete-btn" data-testid="line-delete-btn" class="danger" style="font-size: 11px; padding: 3px 8px;">路線削除</button>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin: 12px 0 8px 0;">
        <p class="eyebrow" style="margin: 0;">所属系統 (${systems.length})</p>
        <button id="sys-create-open" data-testid="sys-create-open" class="flat-action">＋ 系統追加</button>
      </div>

      <div class="systems-list" style="max-height: 320px; overflow-y: auto;">
        ${systems.length === 0 ? `<p class="muted">この路線にはまだ系統が登録されていません</p>` : systemsListHtml}
      </div>
    </div>
  `;
}
