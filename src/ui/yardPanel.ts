import type { MapState } from "../simulation/model";
import { cutLength, type YardCommand } from "../simulation/yard";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export interface YardUiState { cutId: string; trackId: string; distanceM: number; rearCount: number; otherCutId: string; follow: boolean }
export function yardSummary(state: MapState): string {
  const y = state.yard;
  if (!y) return "操車試験は未準備";
  const status = y.error ? `停止: ${y.error}` : y.automatic ? "仕分計画実行中" : y.planIndex === y.plan.length && y.plan.length ? "仕分・出発計画完了" : "手動操作／計画停止中";
  return `${status} · ${y.planIndex}/${y.plan.length}工程\n${y.cuts.map((c) => `${c.name}: ${c.vehicleIds.length}両 · ${c.waiting ?? (c.move ? "移動中" : "停止")} · ${c.spans.at(-1)!.trackId} ${c.spans.at(-1)!.toM.toFixed(1)} m`).join("\n")}`;
}
export function renderYardPanel(left: HTMLElement, right: HTMLElement, state: MapState, ui: YardUiState, command: (c: YardCommand) => void, prepare: () => void, focus: () => void): void {
  const y = state.yard;
  if (!y?.cuts.some((c) => c.id === ui.cutId)) ui.cutId = y?.cuts[0]?.id ?? "";
  const cut = y?.cuts.find((c) => c.id === ui.cutId);
  const options = y?.cuts.map((c) => `<option value="${esc(c.id)}" ${c.id === ui.cutId ? "selected" : ""}>${esc(c.name)} (${c.vehicleIds.length}両)</option>`).join("") ?? "";
  left.innerHTML = `<p class="eyebrow">操車・入換</p><button id="yard-prepare" ${y?.cuts.length ? "disabled" : ""}>この配線で仕分試験を準備</button><small>実配線に試験車両7両を配置。元セーブは上書きせず、新規保存で保持できる。</small><div class="divider"></div><button id="yard-auto" ${!y ? "disabled" : ""}>${y?.automatic ? "計画を中断" : "仕分・出発計画を実行"}</button><button id="yard-focus" ${!y ? "disabled" : ""}>選択車両を地図中央へ</button><pre id="yard-status" aria-live="polite">${esc(yardSummary(state))}</pre><label>操作する車両列<select id="yard-cut">${options}</select></label>${cut ? `<ol class="yard-vehicles">${cut.vehicleIds.map((id) => { const v = y!.vehicles.find((v) => v.id === id)!; return `<li>${esc(v.name)} · ${esc(v.destination || "動力車")} · ${v.lengthM} m</li>`; }).join("")}</ol><small>上が後端、下が進行先端。全長${cutLength(y!, cut)} m。</small>` : ""}`;
  right.innerHTML = `<p class="eyebrow">入換操作</p><div class="yard-form"><label>移動先の線路<select id="yard-track">${state.tracks.map((t) => `<option value="${esc(t.id)}" ${t.id === ui.trackId ? "selected" : ""}>${esc(t.id)} ${esc(y?.roles.find((r) => r.trackId === t.id)?.name ?? "")}</option>`).join("")}</select></label><label>先端の到着距離 (m)<input id="yard-distance" type="number" step="0.1" value="${ui.distanceM}"></label><button id="yard-move" ${!cut ? "disabled" : ""}>経路を探索して移動</button><button id="yard-reverse" ${!cut ? "disabled" : ""}>進行方向を反転</button><button id="yard-cancel" ${!cut ? "disabled" : ""}>移動取消</button><div class="divider"></div><label>後端から切り離す両数<input id="yard-count" type="number" min="1" value="${ui.rearCount}"></label><button id="yard-split" ${!cut ? "disabled" : ""}>指定両数を解結</button><label>連結する相手<select id="yard-other">${y?.cuts.filter((c) => c.id !== ui.cutId).map((c) => `<option value="${esc(c.id)}" ${c.id === ui.otherCutId ? "selected" : ""}>${esc(c.name)}</option>`).join("") ?? ""}</select></label><button id="yard-approach" ${!cut ? "disabled" : ""}>相手の後端まで接近</button><button id="yard-couple" ${!cut ? "disabled" : ""}>接触した相手と連結</button></div><div class="divider"></div><p>試験上の線路割当</p>${y?.roles.map((r) => `<p>${esc(r.name)}<br><strong>${esc(r.trackId)} · ${r.distanceM.toFixed(1)} m</strong></p>`).join("") ?? ""}<small>速度10 km/h。推進・牽引は同じ速度で動く。ハンプ・信号連動・実車性能は未実装。</small>`;
  const on = (id: string, action: () => void) => (left.querySelector(`#${id}`) ?? right.querySelector(`#${id}`))?.addEventListener("click", action);
  const input = (id: string) => (left.querySelector(`#${id}`) ?? right.querySelector(`#${id}`)) as HTMLInputElement;
  const capture = () => { ui.cutId = input("yard-cut").value; ui.trackId = input("yard-track").value; ui.distanceM = Number(input("yard-distance").value); ui.rearCount = Number(input("yard-count").value); ui.otherCutId = input("yard-other").value; };
  const followLabel = document.createElement("label"), follow = document.createElement("input");
  follow.type = "checkbox"; follow.checked = ui.follow;
  followLabel.append(follow, "移動する車両をカメラで追う");
  follow.addEventListener("change", () => { ui.follow = follow.checked; });
  left.querySelector("#yard-focus")!.after(followLabel);
  const run = (c: YardCommand) => { command(c); };
  input("yard-cut").addEventListener("change", () => { capture(); command({ type: "yard.automatic", running: false }); });
  on("yard-prepare", prepare); on("yard-focus", () => { capture(); focus(); });
  on("yard-auto", () => run({ type: "yard.automatic", running: !y?.automatic }));
  on("yard-move", () => { capture(); run({ type: "yard.move", cutId: ui.cutId, trackId: ui.trackId, distanceM: ui.distanceM }); });
  on("yard-reverse", () => { capture(); run({ type: "yard.reverse", cutId: ui.cutId }); });
  on("yard-cancel", () => { capture(); run({ type: "yard.cancel", cutId: ui.cutId }); });
  on("yard-split", () => { capture(); run({ type: "yard.split", cutId: ui.cutId, rearCount: ui.rearCount, newCutId: `cut-${Date.now()}` }); });
  on("yard-couple", () => { capture(); run({ type: "yard.couple", cutId: ui.cutId, otherCutId: ui.otherCutId }); });
  on("yard-approach", () => { capture(); const other = y?.cuts.find((c) => c.id === ui.otherCutId); if (other) run({ type: "yard.move", cutId: ui.cutId, trackId: other.spans[0].trackId, distanceM: other.spans[0].fromM, couplingTarget: other.id }); });
}
