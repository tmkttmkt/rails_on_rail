import { vehicleCatalog } from "../data/vehicleCatalog";
import { formationTemplateCatalog, type FormationTemplate } from "../data/formationTemplateCatalog";
import { getFormationLengthM } from "../simulation/fleet";
import { getFormationOperationalStatus, type MapState } from "../simulation/model";
import { getEligibleRoutesForPlacement, getIneligibleRouteReasons } from "../simulation/selectors";
import { formatGameTime, getStatusBadgeClass, getStatusLabel, type FleetUiState } from "./fleetView";

function formationStatusLabel(state: MapState, id: string, status: Parameters<typeof getStatusLabel>[0]): string {
  const cut = state.yard?.cuts.find((c) => c.id === id);
  return cut ? cut.move ? "入換中" : "構内留置" : getStatusLabel(status);
}

export function renderFleetLeftPanel(state: MapState, uiState: FleetUiState): string {
  const { leftSubTab, acquireCategory, formationFilter, selectedFormationId } = uiState;

  const tabSwitchHtml = `
    <div class="fleet-tab-switch">
      <button data-fleet-tab="formations" class="${leftSubTab === "formations" ? "active" : ""}">編成 (${state.fleet.formations.length})</button>
      <button data-fleet-tab="vehicles" class="${leftSubTab === "vehicles" ? "active" : ""}">保有車両 (${state.fleet.vehicleUnits.length})</button>
      <button data-fleet-tab="acquire" class="${leftSubTab === "acquire" ? "active" : ""}">テスト取得</button>
    </div>
  `;

  if (leftSubTab === "formations") {
    const filteredFormations = state.fleet.formations.filter((f) => {
      const status = getFormationOperationalStatus(state, f.id);
      if (formationFilter === "all") return true;
      return status === formationFilter;
    });

    const filterBarHtml = `
      <div class="fleet-filter-bar">
        <button data-filter="all" class="${formationFilter === "all" ? "active" : ""}">全件</button>
        <button data-filter="unplaced" class="${formationFilter === "unplaced" ? "active" : ""}">未配置</button>
        <button data-filter="placed" class="${formationFilter === "placed" ? "active" : ""}">配置済</button>
        <button data-filter="reserved" class="${formationFilter === "reserved" ? "active" : ""}">予約済</button>
        <button data-filter="operating" class="${formationFilter === "operating" ? "active" : ""}">運行中</button>
        <button data-filter="awaiting-placement" class="${formationFilter === "awaiting-placement" ? "active" : ""}">回収待ち</button>
      </div>
    `;

    const listItemsHtml = filteredFormations.length > 0
      ? filteredFormations.map((f) => {
          const status = getFormationOperationalStatus(state, f.id);
          const { lengthM, estimatedLength } = getFormationLengthM(state.fleet, f);
          const hasWarnings = f.warnings.length > 0;
          const isSelected = f.id === selectedFormationId;
          return `
            <li class="fleet-item ${isSelected ? "selected" : ""}" data-formation-id="${f.id}">
              <div class="fleet-item-header">
                <strong>${f.name}</strong>
                <span class="badge ${getStatusBadgeClass(status)}">${formationStatusLabel(state, f.id, status)}</span>
              </div>
              <div class="fleet-item-sub">
                <span>${f.vehicles.length}両</span>
                <span>約 ${Math.round(lengthM)} m${estimatedLength ? " (推定)" : ""}</span>
                ${hasWarnings ? '<span class="warning-tag">⚠️ ブレーキ</span>' : ""}
              </div>
            </li>
          `;
        }).join("")
      : `<div class="empty-list">該当する編成がありません</div>`;

    return `
      ${tabSwitchHtml}
      <button id="fleet-create-formation" class="primary full mb-2">＋ 新規編成を作成</button>
      ${filterBarHtml}
      <ul class="fleet-list">${listItemsHtml}</ul>
    `;
  }

  if (leftSubTab === "vehicles") {
    const unassignedUnits = state.fleet.vehicleUnits.filter((u) =>
      !state.fleet.formations.some((f) => f.vehicles.some((v) => v.vehicleId === u.id))
    );

    const listHtml = state.fleet.vehicleUnits.length > 0
      ? state.fleet.vehicleUnits.map((u) => {
          const cls = state.fleet.operatorClasses.find((c) => c.id === u.operatorClassId);
          const design = cls ? vehicleCatalog.getVehicleDesign(cls.baseVehicleDesignId) : null;
          const ownerFormation = state.fleet.formations.find((f) => f.vehicles.some((v) => v.vehicleId === u.id));
          return `
            <li class="fleet-item">
              <div class="fleet-item-header">
                <strong>${u.operatorNumber}</strong>
                <small>${design?.name ?? u.operatorClassId}</small>
              </div>
              <div class="fleet-item-sub">
                ${ownerFormation ? `<span>所属: ${ownerFormation.name}</span>` : '<span class="text-accent">未所属</span>'}
              </div>
            </li>
          `;
        }).join("")
      : `<div class="empty-list">保有車両はありません。「テスト取得」タブから取得できます。</div>`;

    return `
      ${tabSwitchHtml}
      <p class="eyebrow">保有車両一覧 (未所属 ${unassignedUnits.length} / 全 ${state.fleet.vehicleUnits.length} 両)</p>
      <ul class="fleet-list">${listHtml}</ul>
    `;
  }

  // leftSubTab === "acquire"
  const catSwitchHtml = `
    <div class="geometry-switch mb-2">
      <button data-acquire-cat="templates" class="${acquireCategory === "templates" ? "active" : ""}">完成編成テンプレート</button>
      <button data-acquire-cat="units" class="${acquireCategory === "units" ? "active" : ""}">個別車両</button>
    </div>
  `;

  let itemsHtml = "";
  if (acquireCategory === "templates") {
    itemsHtml = formationTemplateCatalog.templates.map((tpl: FormationTemplate) => `
      <div class="acquire-card">
        <div class="acquire-card-header">
          <strong>${tpl.name}</strong>
          <button data-acquire-template="${tpl.id}" class="primary small">無償取得</button>
        </div>
        <div class="acquire-card-sub">
          <span>${tpl.vehicles.length}両構成</span>
          <span>連結方向: ${tpl.vehicles[0]?.orientation ?? "forward"}</span>
        </div>
      </div>
    `).join("");
  } else {
    itemsHtml = vehicleCatalog.vehicleDesigns.map((design) => {
      const lengthStr = design.dimensions?.lengthOverCouplersM ? `${design.dimensions.lengthOverCouplersM} m` : "20 m";
      const frontCoupler = vehicleCatalog.couplerSystems.find((c) => c.id === design.connections.front.couplerSystemId)?.name ?? design.connections.front.couplerSystemId;
      return `
        <div class="acquire-card">
          <div class="acquire-card-header">
            <strong>${design.name}</strong>
            <button data-acquire-design="${design.id}" class="primary small">無償取得</button>
          </div>
          <div class="acquire-card-sub">
            <span>型式: ${design.manufacturerModelName}</span>
            <span>全長: ${lengthStr}</span>
            <span>連結器: ${frontCoupler}</span>
          </div>
        </div>
      `;
    }).join("");
  }

  return `
    ${tabSwitchHtml}
    <div class="acquire-notice">※ テスト用のため無償で取得できます</div>
    ${catSwitchHtml}
    <div class="acquire-list">${itemsHtml}</div>
  `;
}

export function renderFleetRightPanel(state: MapState, uiState: FleetUiState): string {
  const formation = uiState.selectedFormationId
    ? state.fleet.formations.find((f) => f.id === uiState.selectedFormationId)
    : null;

  if (!formation) {
    return `
      <p class="eyebrow">編成詳細・編集</p>
      <div class="selection">
        <span>左パネルの「編成一覧」から編成を選択するか、「＋ 新規編成を作成」を押してください。</span>
      </div>
    `;
  }

  const status = getFormationOperationalStatus(state, formation.id);
  const { lengthM, estimatedLength } = getFormationLengthM(state.fleet, formation);
  const isEditable = status === "unplaced";

  // Placed info / Reservation info / Train info
  const placement = state.vehiclePlacements.find((p) => p.formationId === formation.id);
  const yardCut = state.yard?.cuts.find((c) => c.id === formation.id);
  const station = placement ? state.stations.find((s) => s.id === placement.stationId) : null;
  const reservation = Object.values(state.trainRuns || {}).find((r) => r.formationId === formation.id && r.status === "reserved");
  const reservationRoute = reservation ? state.operationRoutes[reservation.routeId] : null;
  const operatingTrain = state.operatingTrains.find((t) => t.formationId === formation.id && t.state !== "completed");

  let statusDetailHtml = "";
  if (yardCut) {
    const head = yardCut.spans.at(-1)!;
    statusDetailHtml = `<div class="status-box">操車場上の同じ車両個体 · ${head.trackId} / ${head.toM.toFixed(1)} m<br>${yardCut.move ? "入換中" : "停止中"}。連結・解結は「操車」画面で操作する。</div>`;
  } else if (status === "placed" && station && placement) {
    statusDetailHtml = `<div class="status-box">配置位置: <strong>${station.name}</strong> (線路 ${placement.trackId})</div>`;
  } else if (status === "reserved" && reservation) {
    statusDetailHtml = `
      <div class="status-box warning">
        発車予約: <strong>${reservationRoute?.name ?? reservation.routeId}</strong><br>
        予定時刻: ${formatGameTime(reservation.scheduledDepartureTimeMs)} (${Math.max(0, Math.round((reservation.scheduledDepartureTimeMs - state.clock.currentTimeMs) / 1000))}秒後)
      </div>
    `;
  } else if (status === "operating" && operatingTrain) {
    statusDetailHtml = `<div class="status-box">運行中: 列車ID <strong>${operatingTrain.id}</strong> (状態: ${operatingTrain.state})</div>`;
  } else if (status === "awaiting-placement") {
    statusDetailHtml = `<div class="status-box alert">⚠️ 終着駅での配置回収待ちです。空き線路を指定して再配置してください。</div>`;
  }

  // Vehicles sequence list
  const vehicleCardsHtml = formation.vehicles.map((v, idx) => {
    const unit = state.fleet.vehicleUnits.find((u) => u.id === v.vehicleId);
    const cls = unit ? state.fleet.operatorClasses.find((c) => c.id === unit.operatorClassId) : null;
    const design = cls ? vehicleCatalog.getVehicleDesign(cls.baseVehicleDesignId) : null;
    const dirArrow = v.orientation === "forward" ? "→" : "←";
    const cargoLabel = unit?.cargoDestination?.replace(/[&<>"']/g, "") ?? "";

    return `
      <div class="vehicle-card">
        <div class="vehicle-card-main">
          <span class="vehicle-num">#${idx + 1}</span>
          <div class="vehicle-info">
            <strong>${unit?.operatorNumber ?? v.vehicleId}</strong>
            <small>${design?.name ?? "未知の設計"} (${dirArrow})${cargoLabel ? ` · 行先 ${cargoLabel}` : ""}</small>
          </div>
        </div>
        ${isEditable ? `
          <div class="vehicle-card-actions">
            <button data-v-move-up="${v.vehicleId}" ${idx === 0 ? "disabled" : ""} title="前へ">←</button>
            <button data-v-move-down="${v.vehicleId}" ${idx === formation.vehicles.length - 1 ? "disabled" : ""} title="後へ">→</button>
            <button data-v-reverse="${v.vehicleId}" title="向き反転">⟲</button>
            <button data-v-remove="${v.vehicleId}" class="danger" title="外す">✕</button>
          </div>
        ` : ""}
      </div>
    `;
  }).join("");

  // Warnings box
  const warningsHtml = formation.warnings.length > 0
    ? `<div class="warnings-box">⚠️ 貫通ブレーキ不連続: ${formation.warnings.map((w) => `${w.firstId} - ${w.secondId}`).join(", ")}</div>`
    : "";

  // Add vehicle section (unplaced only)
  let addVehicleSectionHtml = "";
  if (isEditable) {
    const unassignedUnits = state.fleet.vehicleUnits.filter((u) =>
      !state.fleet.formations.some((f) => f.vehicles.some((v) => v.vehicleId === u.id))
    );

    const unassignedOptions = unassignedUnits.map((u) => {
      const cls = state.fleet.operatorClasses.find((c) => c.id === u.operatorClassId);
      const design = cls ? vehicleCatalog.getVehicleDesign(cls.baseVehicleDesignId) : null;
      return `<option value="${u.id}">${u.operatorNumber} (${design?.name ?? u.operatorClassId})</option>`;
    }).join("");

    addVehicleSectionHtml = `
      <div class="divider"></div>
      <p class="eyebrow">未所属車両を編成に追加</p>
      ${unassignedUnits.length > 0 ? `
        <div class="add-vehicle-form">
          <select id="fleet-add-vehicle-select">${unassignedOptions}</select>
          <div class="form-row">
            <select id="fleet-add-vehicle-pos">
              <option value="rear">後端に追加</option>
              <option value="front">前端に追加</option>
            </select>
            <select id="fleet-add-vehicle-orient">
              <option value="forward">順方向 (→)</option>
              <option value="reversed">逆方向 (←)</option>
            </select>
          </div>
          <button id="fleet-add-vehicle-btn" class="secondary full">車両を編成に追加</button>
        </div>
      ` : '<small class="text-muted">追加可能な未所属車両がありません。「テスト取得」から車両を取得してください。</small>'}
    `;
  }

  // Action buttons & Dispatch controls
  let actionSectionHtml = "";
  if (yardCut) {
    actionSectionHtml = `<div class="status-box">操車画面の編成と連動している。線路上で解結・連結するとこの所属一覧も更新される。</div>`;
  } else if (status === "unplaced" || status === "awaiting-placement") {
    actionSectionHtml = `
      <div class="divider"></div>
      <button id="fleet-place-btn" class="primary full mb-2" ${formation.vehicles.length === 0 ? "disabled" : ""}>駅へ配置 (地図上で指示)</button>
      ${status === "unplaced" ? `<button id="fleet-delete-formation-btn" class="danger full" ${formation.vehicles.length > 0 ? "disabled" : ""}>編成を削除</button>` : ""}
    `;
  } else if (status === "placed") {
    // Route options filtering
    const eligibleRoutes = placement ? getEligibleRoutesForPlacement(state, placement.id) : [];
    const allRoutes = Object.values(state.operationRoutes || {});

    const routesHtml = allRoutes.map((r) => {
      const isEligible = eligibleRoutes.some((er) => er.id === r.id);
      const reasons = isEligible || !placement ? [] : getIneligibleRouteReasons(state, placement.id, r.id);
      const matchLabel = isEligible ? " [適合]" : ` (不適合: ${reasons[0] || "発車条件不一致"})`;
      return `<option value="${r.id}" ${!isEligible ? "disabled" : ""}>${r.name}${matchLabel}</option>`;
    }).join("");

    const defaultScheduledText = uiState.scheduledTimeText || formatGameTime(state.clock.currentTimeMs + 60000);

    actionSectionHtml = `
      <div class="divider"></div>
      <button id="fleet-unplace-btn" class="ghost full mb-2">配置解除</button>
      <div class="divider"></div>
      <p class="eyebrow">発車・予約設定</p>
      ${allRoutes.length > 0 ? `
        <div class="dispatch-form">
          <label for="dispatch-route-select">運行経路</label>
          <select id="dispatch-route-select">${routesHtml}</select>

          <label>発車方式</label>
          <div class="geometry-switch mb-2">
            <button data-dispatch-mode="immediate" class="${uiState.dispatchMode === "immediate" ? "active" : ""}">今すぐ発車</button>
            <button data-dispatch-mode="scheduled" class="${uiState.dispatchMode === "scheduled" ? "active" : ""}">日時指定発車</button>
          </div>

          ${uiState.dispatchMode === "scheduled" ? `
            <label for="dispatch-time-input">発車日時 (ゲーム内 YYYY/MM/DD HH:mm)</label>
            <input id="dispatch-time-input" value="${defaultScheduledText}">
            <small class="text-muted">現在: ${formatGameTime(state.clock.currentTimeMs)}</small>
          ` : ""}

          <label for="dispatch-speed-input">運転速度 <small>(テスト用一定速度)</small></label>
          <div class="input-with-unit">
            <input id="dispatch-speed-input" type="number" min="1" max="500" value="80">
            <span>km/h</span>
          </div>

          <label for="dispatch-dwell-input">停車時間</label>
          <div class="input-with-unit mb-2">
            <input id="dispatch-dwell-input" type="number" min="0" max="600" value="5">
            <span>秒</span>
          </div>

          <button id="dispatch-execute-btn" class="primary full">${uiState.dispatchMode === "immediate" ? "今すぐ発車" : "発車予約を作成"}</button>
        </div>
      ` : '<small class="text-muted">運行経路が登録されていません。先に路線モード/運行モードで経路を作成してください。</small>'}
    `;
  } else if (status === "reserved" && reservation) {
    actionSectionHtml = `
      <div class="divider"></div>
      <button id="dispatch-cancel-btn" class="danger full">発車予約をキャンセル</button>
    `;
  }

  return `
    <div class="formation-detail-header">
      <div class="formation-name-row">
        <strong id="formation-name-display">${formation.name}</strong>
        <button id="fleet-rename-formation-btn" class="ghost small">改名</button>
      </div>
      <span class="badge ${getStatusBadgeClass(status)}">${formationStatusLabel(state, formation.id, status)}</span>
    </div>
    <div class="formation-meta">
      <span>構成: ${formation.vehicles.length}両</span>
      <span>編成長: 約 ${Math.round(lengthM)} m${estimatedLength ? " (推定)" : ""}</span>
    </div>

    ${statusDetailHtml}

    <p class="eyebrow mt-2">編成車両構成 (前後順)</p>
    <div class="vehicle-sequence">
      ${formation.vehicles.length > 0 ? vehicleCardsHtml : '<div class="empty-list">編成内に車両がありません</div>'}
    </div>
    ${warningsHtml}

    ${addVehicleSectionHtml}
    ${actionSectionHtml}
  `;
}
