import { assertAreaAllowsStabling } from "./stationAreas";
import { parse } from "yaml";
import settingsYaml from "../../data/yard/facility-trial.yaml?raw";
import { vehicleCatalog } from "../data/vehicleCatalog";
import { trackCatalog } from "../data/trackCatalog";
import { FACILITY_USES, type FacilityUse, type MapState, type Station } from "./model";
import { getUsableStablingSpans, assertStablingClearOfJunctions } from "./stabling";
import { createYardFormation } from "./yardFleet";
import { executeYardCommand, findYardPath, trackLength, yardPoint, spanLength, type YardSpan } from "./yard";

const settings = parse(settingsYaml) as { minimumRangeM: number; platformClearanceM: number; mainlineClearanceM: number; maximumPathM: number; speedKph: number; vehicleDesignId: string };
export function getFacilityTrialVehicleSpec() {
  const design = vehicleCatalog.getVehicleDesign(settings.vehicleDesignId);
  return { name: design.name, lengthM: design.dimensions!.lengthOverCouplersM!, gaugeMm: design.runningGear!.gaugeMm!, speedKph: settings.speedKph };
}
export type FacilityCommand =
  | { type: "facility.registerTrack"; trackId: string; name: string }
  | { type: "facility.setUse"; stationId: string; use: FacilityUse }
  | { type: "facility.prepareTrial"; stationId: string }
  | { type: "facility.runTrial" }
  | { type: "facility.removeTrial" };
function facility(state: MapState, id: string): Station {
  const station = state.stations.find((s) => s.id === id);
  if (!station || station.kind === "station" || station.unresolvedReason) throw new Error("旅客駅ではなく側線施設を選択してください");
  return station;
}
export function facilityTrialAtHome(state: MapState): boolean {
  const trial = state.yard?.facilityTrial, cuts = state.yard?.cuts;
  if (!trial || cuts?.length !== 1 || cuts[0].id !== trial.formationId || cuts[0].move || cuts[0].spans.length !== 1) return false;
  const s = cuts[0].spans[0], home = trial.home;
  return s.trackId === home.trackId && Math.abs(s.fromM - home.fromM) < 0.01 && Math.abs(s.toM - home.toM) < 0.01;
}
export function registerFacilityTrack(state: MapState, trackId: string, name: string): Station {
  if (state.yard?.cuts.length || state.vehiclePlacements.length || state.operatingTrains.some((t) => t.state !== "completed")) throw new Error("車両配置・運転のない状態で施設を登録してください");
  const track = state.tracks.find((t) => t.id === trackId);
  if (!track || track.kind !== "side") throw new Error("側線を選択してください");
  name = name.trim(); if (!name || name.length > 60) throw new Error("施設名は1〜60文字です");
  let spans = getUsableStablingSpans(state, track, 0, trackLength(state, trackId));
  for (const point of state.stations.flatMap((s) => s.stopPoints).filter((p) => p.trackId === trackId)) {
    spans = spans.flatMap((s) => [{ startM: s.startM, endM: Math.min(s.endM, point.startDistanceM - settings.platformClearanceM) }, { startM: Math.max(s.startM, point.endDistanceM + settings.platformClearanceM), endM: s.endM }].filter((p) => p.endM > p.startM));
  }
  spans = spans.filter((s) => s.endM - s.startM >= settings.minimumRangeM);
  if (!spans.length) throw new Error("既存施設・ホーム・分岐支障を除くと登録可能な範囲がありません");
  const id = `station-${state.nextStationId++}`;
  const stopPoints = spans.map((s, i) => ({ id: `${id}-sp-${i + 1}`, trackId, startDistanceM: s.startM, endDistanceM: s.endM, startPosition: yardPoint(state, trackId, s.startM), endPosition: yardPoint(state, trackId, s.endM), direction: "both" as const }));
  const center = spans.reduce((a, b) => b.endM - b.startM > a.endM - a.startM ? b : a);
  const station: Station = { id, name, kind: "yard", facilityUse: "unknown", position: yardPoint(state, trackId, (center.startM + center.endM) / 2), stopPoints };
  state.stations.push(station); return station;
}
/** 既存保存の広すぎる施設範囲も、他施設・旅客ホーム・分岐支障を除いて確認する。 */
export function getFacilityUsableRanges(state: MapState, station: Station): { trackId: string; startM: number; endM: number }[] {
  return station.stopPoints.flatMap((point) => {
    const track = state.tracks.find((t) => t.id === point.trackId)!;
    let spans = getUsableStablingSpans(state, track, point.startDistanceM, point.endDistanceM);
    for (const other of state.stations.filter((s) => s.id !== station.id).flatMap((s) => s.stopPoints).filter((p) => p.trackId === track.id)) {
      spans = spans.flatMap((s) => [{ startM: s.startM, endM: Math.min(s.endM, other.startDistanceM - settings.platformClearanceM) }, { startM: Math.max(s.startM, other.endDistanceM + settings.platformClearanceM), endM: s.endM }].filter((p) => p.endM > p.startM));
    }
    return spans.filter((s) => s.endM - s.startM >= settings.minimumRangeM).map((s) => ({ trackId: track.id, ...s }));
  });
}
function assertTrialGauge(state: MapState, ids: string[]): void {
  const gauge = vehicleCatalog.getVehicleDesign(settings.vehicleDesignId).runningGear?.gaugeMm;
  for (const id of new Set(ids)) {
    const track = state.tracks.find((t) => t.id === id)!;
    if (trackCatalog.getGauge(track.specification.gaugeId).gaugeMm !== gauge) throw new Error(`試験車の軌間${gauge} mmと線路の軌間が一致しません`);
  }
}
export function prepareFacilityTrial(state: MapState, stationId: string): void {
  const station = facility(state, stationId);
  if (!["stabling", "maintenance", "depot"].includes(station.facilityUse ?? "unknown")) throw new Error("留置線・保守用側線・車庫のいずれかに用途を設定してください（引上げ線は留置用にしない）");
  if (state.yard?.cuts.length || state.vehiclePlacements.length || state.operatingTrains.some((t) => t.state !== "completed")) throw new Error("既存車両を撤収してから試験車を配置してください");
  const length = vehicleCatalog.getVehicleDesign(settings.vehicleDesignId).dimensions!.lengthOverCouplersM!;
  let best: { home: YardSpan; mainline: YardSpan; distance: number } | undefined;
  const failures: string[] = [];
  const mainPorts = state.junctions.flatMap((j) => j.ports).filter((p) => state.tracks.find((t) => t.id === p.trackId)?.kind === "main" && Math.hypot(yardPoint(state, p.trackId, p.distanceM).x - station.position.x, yardPoint(state, p.trackId, p.distanceM).y - station.position.y) < settings.maximumPathM);
  for (const point of getFacilityUsableRanges(state, station)) {
    const track = state.tracks.find((t) => t.id === point.trackId)!;
    if (track.kind !== "side") continue;
    const usable = [point].filter((s) => s.endM - s.startM > length + 2);
    for (const span of usable) for (const direction of [1, -1] as const) {
      const head = (span.startM + span.endM) / 2 + direction * length / 2;
      const home = { trackId: track.id, fromM: head - direction * length, toM: head };
      for (const port of mainPorts) for (const sign of [1, -1]) {
        const destination = port.distanceM + sign * (length + settings.mainlineClearanceM);
        if (destination <= length || destination >= trackLength(state, port.trackId) - length) continue;
        try {
          assertAreaAllowsStabling(state, home.trackId, Math.min(home.fromM,home.toM), Math.max(home.fromM,home.toM));
          const out = findYardPath(state, { trackId: home.trackId, distanceM: home.toM, direction }, { trackId: port.trackId, distanceM: destination });
          if (!out.length) continue;
          const arrivalDirection = Math.sign(out.at(-1)!.toM - out.at(-1)!.fromM);
          const mainline = { trackId: port.trackId, fromM: destination - arrivalDirection * length, toM: destination };
          const back = findYardPath(state, { trackId: mainline.trackId, distanceM: mainline.fromM, direction: -arrivalDirection }, { trackId: home.trackId, distanceM: home.fromM });
          const distance = out.reduce((n, s) => n + spanLength(s), 0) + back.reduce((n, s) => n + spanLength(s), 0);
          if (!back.length || distance > settings.maximumPathM) continue;
          assertTrialGauge(state, [...out, ...back].map((p) => p.trackId));
          assertStablingClearOfJunctions(state, track, Math.min(home.fromM, home.toM), Math.max(home.fromM, home.toM));
          assertStablingClearOfJunctions(state, state.tracks.find((t) => t.id === mainline.trackId)!, Math.min(mainline.fromM, mainline.toM), Math.max(mainline.fromM, mainline.toM));
          if (!best || distance < best.distance) best = { home, mainline, distance };
        } catch (error) { failures.push((error as Error).message); }
      }
    }
  }
  if (!best) throw new Error(`車長に合う留置範囲と本線往復経路を確保できません。${failures.find((f) => f.includes("軌間")) ?? failures[0] ?? "範囲長・接続・用途を確認してください"}`);
  const formationId = `facility-trial-${station.id}`;
  createYardFormation(state, formationId, "試験用保守車", [{ id: `${formationId}-vehicle`, name: "保守車（操作試験）", designId: settings.vehicleDesignId }]);
  executeYardCommand(state, { type: "yard.place", cutId: formationId, trackId: best.home.trackId, headM: best.home.toM, direction: Math.sign(best.home.toM - best.home.fromM) as 1 | -1 });
  const yard = state.yard!;
  yard.facilityTrial = { stationId, formationId, home: best.home, mainline: best.mainline };
  yard.roles = [{ name: "側線の留置位置（試験指定）", trackId: best.home.trackId, distanceM: best.home.toM }, { name: "本線の折返し位置（試験指定）", trackId: best.mainline.trackId, distanceM: best.mainline.toM }];
  yard.plan = [{ type: "yard.move", cutId: formationId, trackId: best.mainline.trackId, distanceM: best.mainline.toM, speedKph: settings.speedKph }, { type: "yard.reverse", cutId: formationId }, { type: "yard.move", cutId: formationId, trackId: best.home.trackId, distanceM: best.home.fromM, speedKph: settings.speedKph }, { type: "yard.reverse", cutId: formationId }];
  yard.planLabels = ["本線へ出る", "停止して反転", "側線へ戻る", "留置方向へ反転"];
  yard.planIndex = 0; yard.automatic = false; yard.error = undefined;
  state.clock.paused = true;
}
export function executeFacilityCommand(state: MapState, command: FacilityCommand): string {
  if (command.type === "facility.registerTrack") { const station = registerFacilityTrack(state, command.trackId, command.name); return `${station.name}を用途未確認の側線施設として登録`; }
  if (command.type === "facility.setUse") {
    const station = facility(state, command.stationId);
    if (!FACILITY_USES.includes(command.use)) throw new Error("施設用途が不正です");
    if (state.yard?.facilityTrial?.stationId === station.id) throw new Error("試験車を撤収してから用途を変更してください");
    station.facilityUse = command.use; return "施設用途を設定しました（ゲーム内の指定）";
  }
  if (command.type === "facility.prepareTrial") { prepareFacilityTrial(state, command.stationId); return `${getFacilityTrialVehicleSpec().lengthM} mの試験用保守車を配置。本線往復経路を確認しました`; }
  const trial = state.yard?.facilityTrial;
  if (!trial) throw new Error("側線の試験車がありません");
  if (command.type === "facility.runTrial") {
    if (!facilityTrialAtHome(state)) throw new Error("留置位置で停止してから往復を開始してください");
    state.yard!.planIndex = 0; executeYardCommand(state, { type: "yard.automatic", running: true }); state.clock.paused = false; return "本線への往復を開始しました";
  }
  if (!facilityTrialAtHome(state) || state.yard!.automatic) throw new Error("側線へ戻って停止してから試験車を撤収してください");
  const formation = state.fleet.formations.find((f) => f.id === trial.formationId)!;
  const vehicles = new Set(formation.vehicles.map((v) => v.vehicleId));
  state.fleet.vehicleUnits = state.fleet.vehicleUnits.filter((v) => !vehicles.has(v.id));
  state.fleet.formations = state.fleet.formations.filter((f) => f.id !== trial.formationId);
  delete state.yard; return "試験車を撤収しました";
}

/** 保存時も試験の施設・車両・留置位置の参照を検査する。 */
export function validateFacilityTrial(state: MapState): void {
  const trial = state.yard?.facilityTrial;
  if (trial === undefined) return;
  if (!trial || typeof trial.stationId !== "string" || typeof trial.formationId !== "string") throw new Error("側線試験の参照が不正です");
  const station = facility(state, trial.stationId);
  if (!["stabling", "maintenance", "depot"].includes(station.facilityUse ?? "unknown")) throw new Error("側線試験の用途が不正です");
  const formation = state.fleet.formations.find((f) => f.id === trial.formationId);
  if (!formation || formation.vehicles.length !== 1 || state.yard!.cuts.length !== 1 || state.yard!.cuts[0].id !== trial.formationId) throw new Error("側線試験の車両が不正です");
  const unit = state.fleet.vehicleUnits.find((v) => v.id === formation.vehicles[0].vehicleId);
  if (state.fleet.operatorClasses.find((c) => c.id === unit?.operatorClassId)?.baseVehicleDesignId !== settings.vehicleDesignId) throw new Error("側線試験車の設計が不正です");
  const length = vehicleCatalog.getVehicleDesign(settings.vehicleDesignId).dimensions!.lengthOverCouplersM!;
  for (const span of [trial.home, trial.mainline]) {
    if (!span || typeof span.trackId !== "string" || !Number.isFinite(span.fromM) || !Number.isFinite(span.toM) || Math.abs(spanLength(span) - length) > 0.01 || Math.min(span.fromM, span.toM) < 0 || Math.max(span.fromM, span.toM) > trackLength(state, span.trackId)) throw new Error("側線試験の停車位置が不正です");
    assertTrialGauge(state, [span.trackId]);
    assertStablingClearOfJunctions(state, state.tracks.find((t) => t.id === span.trackId)!, Math.min(span.fromM, span.toM), Math.max(span.fromM, span.toM));
  }
  if (!station.stopPoints.some((p) => p.trackId === trial.home.trackId && p.startDistanceM <= Math.min(trial.home.fromM, trial.home.toM) && p.endDistanceM >= Math.max(trial.home.fromM, trial.home.toM))) throw new Error("側線試験の留置位置が施設外です");
  if (state.tracks.find((t) => t.id === trial.mainline.trackId)?.kind !== "main") throw new Error("試験の折返し位置が本線ではありません");
}
