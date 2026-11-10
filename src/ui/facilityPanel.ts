import { FACILITY_USES, FACILITY_USE_LABELS, type MapState } from "../simulation/model";
import { getFacilityTrialVehicleSpec, getFacilityUsableRanges, facilityTrialAtHome, type FacilityCommand } from "../simulation/facilities";
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export function renderFacilityPanel(root: HTMLElement, state: MapState, stationId: string | null, trackId: string | null, enabled: boolean, command: (c: FacilityCommand) => void, mode: "management" | "construction" = "construction"): void {
  const station = state.stations.find((s) => s.id === stationId && s.kind !== "station");
  const track = state.tracks.find((t) => t.id === trackId && t.kind === "side");
  root.hidden = !enabled || (!station && (!track || mode !== "construction"));
  if (root.hidden) return;
  const trial = state.yard?.facilityTrial, ownTrial = trial?.stationId === station?.id;
  const signature = JSON.stringify([mode, station, track?.id, trial, state.yard?.planIndex, state.yard?.automatic, state.yard?.error, state.yard?.cuts.map((c) => !!c.move)]);
  if (root.dataset.signature === signature) return;
  root.dataset.signature = signature;
  if (!station) {
    root.innerHTML = `<strong>側線施設を作る</strong><p>分岐・既存ホーム・施設を除いて使える範囲を登録する。</p><label>施設名<input id="facility-name" value="用途未確認の側線" maxlength="60"></label><button id="facility-register">この側線を施設として登録</button>`;
    root.querySelector("#facility-register")!.addEventListener("click", () => command({ type: "facility.registerTrack", trackId: track!.id, name: root.querySelector<HTMLInputElement>("#facility-name")!.value })); return;
  }
  const lengths = getFacilityUsableRanges(state, station).map((p) => p.endM - p.startM);
  const use = station.facilityUse ?? "unknown", vehicle = getFacilityTrialVehicleSpec();
  const status = ownTrial ? state.yard!.error ? `停止：${state.yard!.error}` : state.yard!.automatic || state.yard!.cuts.some((c) => c.move) ? `実行中：${state.yard!.planLabels[Math.max(0, state.yard!.planIndex - 1)] ?? "往復"}` : state.yard!.planIndex === state.yard!.plan.length ? "本線往復完了・側線に留置" : "試験車を配置済み・往復開始待ち" : "車両未配置";
  root.innerHTML = `<strong>${esc(station.name)}</strong><p>${lengths.length}区間 · 最長 ${Math.max(0, ...lengths).toFixed(1)} m<br>他施設・旅客ホーム・分岐支障を除いた範囲。配置時にも再検査する。</p><label>施設用途<select id="facility-use" aria-label="施設用途" ${ownTrial ? "disabled" : ""}>${FACILITY_USES.map((u) => `<option value="${u}" ${u === use ? "selected" : ""}>${FACILITY_USE_LABELS[u]}</option>`).join("")}</select></label><small>ゲーム内の指定。現地の正式用途を確定するものではない。</small><p>${use === "headshunt" ? "引上げ線は折返し・入換用。留置用として配置しない。" : use === "unknown" ? "用途を設定してから試験車を配置する。" : `${vehicle.lengthM} m・${vehicle.gaugeMm} mmの自走保守車で操作を試せる。`}</p><button id="facility-prepare" ${state.yard?.cuts.length || !["maintenance", "stabling", "depot"].includes(use) ? "disabled" : ""}>試験用保守車を配置</button><p id="facility-trial-status" aria-live="polite">${esc(status)}</p>${ownTrial ? `<button id="facility-run" ${!facilityTrialAtHome(state) || state.yard!.automatic ? "disabled" : ""}>本線へ出て側線へ戻る</button><button id="facility-remove" ${!facilityTrialAtHome(state) || state.yard!.automatic ? "disabled" : ""}>試験車を撤収</button><small>速度${vehicle.speedKph} km/h。上の時間操作で早送り・一時停止できる。ダイヤや信号のある営業運転は対象外。</small>` : ""}`;
  if (mode === "management") {
    for (const id of ["facility-prepare", "facility-run", "facility-remove", "facility-trial-status"]) root.querySelector(`#${id}`)?.remove();
  } else {
    root.querySelector("#facility-use")?.closest("label")?.remove();
  }
  root.querySelector<HTMLSelectElement>("#facility-use")?.addEventListener("change", (e) => command({ type: "facility.setUse", stationId: station.id, use: (e.target as HTMLSelectElement).value as typeof use }));
  root.querySelector("#facility-prepare")?.addEventListener("click", () => command({ type: "facility.prepareTrial", stationId: station.id }));
  root.querySelector("#facility-run")?.addEventListener("click", () => command({ type: "facility.runTrial" }));
  root.querySelector("#facility-remove")?.addEventListener("click", () => command({ type: "facility.removeTrial" }));
}
