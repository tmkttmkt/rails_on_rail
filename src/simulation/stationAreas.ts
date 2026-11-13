import { STATION_AREA_ROLES, type StationArea, type StationAreaRange, type StationAreaRole, type StationComplex, type MapState, type Point, type FacilityUse } from "./model";
import { analyzeLine, sampleTrack } from "./geometry";
import { getUsableStablingSpans, assertStablingClearOfJunctions } from "./stabling";
import { yardPoint } from "./yard";
import { assertStationCanBeDeleted } from "./guards";

export const AREA_COLORS: Record<StationAreaRole, string> = { platform: "#d99a20", stabling: "#278b70", headshunt: "#3a74b5", workshop: "#9b5dba", maintenance: "#b57838", throat: "#ba5b55", transit: "#687b8e", unknown: "#93908a" };
export type AreaInput = Omit<StationArea, "id"> & { id?: string };
export type StationAreaCommand =
  | { type: "stationComplex.create"; id?: string; name: string }
  | { type: "stationComplex.rename"; complexId: string; name: string }
  | { type: "stationComplex.delete"; complexId: string }
  | { type: "stationArea.create"; area: AreaInput }
  | { type: "stationArea.rename"; areaId: string; name: string }
  | { type: "stationArea.setRole"; areaId: string; role: StationAreaRole }
  | { type: "stationArea.move"; areaId: string; complexId: string }
  | { type: "stationArea.split"; areaId: string; parts: { id?: string; name: string; role: StationAreaRole; ranges: StationAreaRange[] }[] }
  | { type: "stationArea.delete"; areaId: string };
const overlap = (a: StationAreaRange, b: StationAreaRange) => a.trackId === b.trackId && Math.min(a.endM, b.endM) - Math.max(a.startM, b.startM) > 0.001;
const cleanName = (name: string) => { if (typeof name !== "string" || !name.trim() || name.trim().length > 60) throw new Error("名称は1〜60文字です"); return name.trim(); };
export function areaFacilityUse(role: StationAreaRole): FacilityUse | undefined { return ({ stabling: "stabling", headshunt: "headshunt", workshop: "depot", maintenance: "maintenance" } as Partial<Record<StationAreaRole, FacilityUse>>)[role]; }
function editable(state: MapState): void {
  if (state.yard?.cuts.length || state.vehiclePlacements.length || state.operatingTrains.some((t) => t.state !== "completed") || Object.values(state.operationExecutions).some((e) => !["completed", "cancelled"].includes(e.status))) throw new Error("車両配置・運転を解除してから構内領域を編集してください");
}
function requireArea(state: MapState, id: string): StationArea { const area = state.stationAreas.find((a) => a.id === id); if (!area) throw new Error("領域がありません"); return area; }
function requireComplex(state: MapState, id: string): StationComplex { const group = state.stationComplexes.find((g) => g.id === id); if (!group) throw new Error("構内グループがありません"); return group; }
function checkRange(state: MapState, range: StationAreaRange): void {
  const track = state.tracks.find((t) => t.id === range?.trackId);
  if (!track || !Number.isFinite(range.startM) || !Number.isFinite(range.endM) || range.startM < 0 || range.endM <= range.startM || range.endM > analyzeLine(sampleTrack(track)).lengthM + 0.001) throw new Error("領域の線路区間が不正です");
}
function covered(range: StationAreaRange, ranges: StationAreaRange[]): boolean {
  let cursor = range.startM;
  for (const part of ranges.filter((r) => r.trackId === range.trackId).sort((a,b) => a.startM - b.startM)) {
    if (part.endM <= cursor) continue;
    if (part.startM > cursor + 0.002) break;
    cursor = Math.max(cursor, part.endM);
    if (cursor >= range.endM - 0.002) return true;
  }
  return false;
}
export function assertAreaAllowsStabling(state: MapState, trackId: string, startM: number, endM: number): void {
  const blocked = state.stationAreas.find((a) => ["headshunt", "throat", "transit", "unknown"].includes(a.role) && a.ranges.some((r) => overlap(r, { trackId, startM, endM })));
  if (blocked) throw new Error(`領域「${blocked.name}」は留置用ではありません`);
}
function createStoppingPlace(state: MapState, area: StationArea): void {
  const use = areaFacilityUse(area.role); if (!use) return;
  const spans = area.ranges.flatMap((range) => {
    const track = state.tracks.find((t) => t.id === range.trackId)!;
    let result = getUsableStablingSpans(state, track, range.startM, range.endM);
    for (const other of state.stations.flatMap((s) => s.stopPoints).filter((p) => p.trackId === track.id)) result = result.flatMap((r) => [{ startM: r.startM, endM: Math.min(r.endM, other.startDistanceM - 5) }, { startM: Math.max(r.startM, other.endDistanceM + 5), endM: r.endM }].filter((s) => s.endM > s.startM));
    return result.filter((r) => r.endM - r.startM >= 20).map((r) => ({ trackId: track.id, ...r }));
  });
  if (!spans.length) return; // 領域は存在するが、止められる区間を捏造しない。
  const id = `station-${state.nextStationId++}`;
  const stopPoints = spans.map((r,i) => ({ id: `${id}-sp-${i + 1}`, trackId: r.trackId, startDistanceM: r.startM, endDistanceM: r.endM, startPosition: yardPoint(state, r.trackId, r.startM), endPosition: yardPoint(state, r.trackId, r.endM), direction: "both" as const }));
  const center = spans.reduce((a,b) => a.endM-a.startM > b.endM-b.startM ? a : b);
  state.stations.push({ id, name: area.name, kind: area.role === "workshop" ? "depot" : "yard", facilityUse: use, position: yardPoint(state, center.trackId, (center.startM + center.endM) / 2), stopPoints }); area.stationId = id;
}
export function createStationArea(state: MapState, input: AreaInput): StationArea {
  requireComplex(state, input.complexId);
  if (!STATION_AREA_ROLES.includes(input.role) || !["layout", "source"].includes(input.basis) || !Array.isArray(input.ranges) || !input.ranges.length || (input.note !== undefined && (typeof input.note !== "string" || input.note.length > 1000))) throw new Error("領域の用途・根拠・区間が不正です");
  const id = input.id ?? `area-${state.nextStationAreaId++}`;
  if (typeof id !== "string" || !id || state.stationAreas.some((a) => a.id === id)) throw new Error("領域IDが重複または不正です");
  const area: StationArea = { ...structuredClone(input), id, name: cleanName(input.name) };
  area.ranges.forEach((r,i) => { checkRange(state,r); if (area.ranges.slice(0,i).some((p) => overlap(p,r)) || state.stationAreas.some((a) => a.ranges.some((p) => overlap(p,r)))) throw new Error("領域の線路区間が重複しています"); });
  if (area.stationId) {
    const station = state.stations.find((s) => s.id === area.stationId);
    if (!station || state.stationAreas.some((a) => a.stationId === station.id)) throw new Error("関連停車場がないか、別領域に所属しています");
    if (area.role === "platform" ? station.kind !== "station" : station.kind === "station" || !areaFacilityUse(area.role)) throw new Error("旅客駅と施設領域の用途が一致しません");
    if (!station.stopPoints.every((p) => covered({ trackId: p.trackId, startM: p.startDistanceM, endM: p.endDistanceM }, area.ranges))) throw new Error("停車可能区間が領域の外へ出ています");
    if (station.kind !== "station") station.facilityUse = areaFacilityUse(area.role);
  } else if (area.role === "platform") throw new Error("旅客ホーム領域には既存駅を指定してください");
  else createStoppingPlace(state, area);
  state.stationAreas.push(area); return area;
}
export function executeStationAreaCommand(state: MapState, command: StationAreaCommand): string {
  if (command.type === "stationComplex.rename") { requireComplex(state, command.complexId).name = cleanName(command.name); return "構内グループ名を変更しました"; }
  if (command.type === "stationArea.rename") { const area = requireArea(state,command.areaId); area.name = cleanName(command.name); if (area.stationId && area.role !== "platform") state.stations.find((s) => s.id === area.stationId)!.name = area.name; return "領域名を変更しました"; }
  editable(state);
  if (command.type === "stationComplex.create") {
    const id = command.id ?? `complex-${state.nextStationComplexId++}`;
    if (typeof id !== "string" || !id || state.stationComplexes.some((g) => g.id === id)) throw new Error("構内グループIDが不正または重複しています");
    state.stationComplexes.push({ id, name: cleanName(command.name) }); return "構内グループを作成しました";
  }
  if (command.type === "stationComplex.delete") { requireComplex(state,command.complexId); if (state.stationAreas.some((a) => a.complexId === command.complexId)) throw new Error("領域を移してからグループを削除してください"); state.stationComplexes = state.stationComplexes.filter((g) => g.id !== command.complexId); return "空の構内グループを削除しました"; }
  if (command.type === "stationArea.create") { createStationArea(state,command.area); return "用途領域を作成しました"; }
  const area = requireArea(state,command.areaId);
  if (command.type === "stationArea.move") { requireComplex(state,command.complexId); area.complexId = command.complexId; return "領域の所属グループを変更しました"; }
  if (command.type === "stationArea.delete") { state.stationAreas = state.stationAreas.filter((a) => a.id !== area.id); return "領域の区分を解除しました（停車場・線路は保持）"; }
  if (area.role === "platform") throw new Error("旅客ホーム領域の分割・用途変更は駅の停車範囲を先に編集してください");
  if (area.stationId) assertStationCanBeDeleted(state,area.stationId);
  if (command.type === "stationArea.setRole") {
    if (!STATION_AREA_ROLES.includes(command.role) || command.role === "platform") throw new Error("変更する領域用途が不正です");
    if (area.stationId) { state.stations = state.stations.filter((s) => s.id !== area.stationId); delete area.stationId; }
    area.role = command.role; area.basis = "layout"; createStoppingPlace(state,area); return "領域用途と停止可能区間を更新しました";
  }
  if (command.type === "stationArea.split") {
    if (command.parts.length < 2) throw new Error("分割先を2領域以上指定してください");
    const ranges = command.parts.flatMap((p) => p.ranges);
    if (!area.ranges.every((r) => covered(r,ranges)) || !ranges.every((r) => covered(r,area.ranges))) throw new Error("分割後は元の領域を過不足なく覆ってください");
    ranges.forEach((r,i) => { checkRange(state,r); if (ranges.slice(0,i).some((p) => overlap(p,r))) throw new Error("分割領域が重複しています"); });
    if (area.stationId) state.stations = state.stations.filter((s) => s.id !== area.stationId);
    state.stationAreas = state.stationAreas.filter((a) => a.id !== area.id);
    for (const part of command.parts) createStationArea(state, { ...part, complexId: area.complexId, basis: "layout", note: area.note });
    return "線路を変えずに領域と停車範囲を分割しました";
  }
  throw new Error("未対応の領域操作です");
}
export function validateStationAreas(state: MapState): void {
  if (!Array.isArray(state.stationComplexes) || !Array.isArray(state.stationAreas) || !Number.isInteger(state.nextStationComplexId) || state.nextStationComplexId < 1 || !Number.isInteger(state.nextStationAreaId) || state.nextStationAreaId < 1) throw new Error("構内グループ一覧が不正です");
  const groups = new Set<string>(), areas = new Set<string>(), stations = new Set<string>(), allRanges: StationAreaRange[] = [];
  for (const group of state.stationComplexes) { if (!group || typeof group.id !== "string" || !group.id || groups.has(group.id)) throw new Error("構内グループIDが不正です"); cleanName(group.name); groups.add(group.id); }
  for (const area of state.stationAreas) {
    if (!area || typeof area.id !== "string" || !area.id || areas.has(area.id) || !groups.has(area.complexId) || !STATION_AREA_ROLES.includes(area.role) || !["source","layout"].includes(area.basis) || !Array.isArray(area.ranges) || !area.ranges.length || (area.note !== undefined && (typeof area.note !== "string" || area.note.length > 1000))) throw new Error("領域の所属・用途・根拠が不正です");
    cleanName(area.name); areas.add(area.id);
    for (const range of area.ranges) { checkRange(state,range); if (allRanges.some((r) => overlap(r,range))) throw new Error("領域区間の所有が重複しています"); allRanges.push(range); }
    if (area.stationId !== undefined) {
      const station = state.stations.find((s) => s.id === area.stationId);
      if (!station || stations.has(station.id) || !station.stopPoints.every((p) => covered({trackId:p.trackId,startM:p.startDistanceM,endM:p.endDistanceM},area.ranges))) throw new Error("領域の関連停車場がないか領域外です");
      if (area.role === "platform" ? station.kind !== "station" : station.kind === "station" || station.facilityUse !== areaFacilityUse(area.role) || !areaFacilityUse(area.role)) throw new Error("領域と停車場の用途が不一致です");
      if (area.role !== "platform") for (const point of station.stopPoints) assertStablingClearOfJunctions(state,state.tracks.find((t)=>t.id===point.trackId)!,point.startDistanceM+0.01,point.endDistanceM-0.01);
      stations.add(station.id);
    } else if (area.role === "platform") throw new Error("ホーム領域に旅客駅がありません");
  }
  if (groups.has(`complex-${state.nextStationComplexId}`) || areas.has(`area-${state.nextStationAreaId}`)) throw new Error("構内領域の次IDが使用済みです");
}
export function stationAreaPoints(state: MapState, area: StationArea): Point[] {
  return area.ranges.flatMap((r) => {
    const track = state.tracks.find((t) => t.id === r.trackId)!;
    const points = sampleTrack(track), result = [yardPoint(state,r.trackId,r.startM)]; let distance = 0;
    for (let i = 1; i < points.length; i++) { distance += Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y); if (distance > r.startM && distance < r.endM) result.push(points[i]); }
    result.push(yardPoint(state,r.trackId,r.endM)); return result;
  });
}
// グループの外接矩形。表示倍率を持たないので、描画と当たり判定が同じ広がりを使える。
export function stationComplexBounds(state: MapState, complexId: string): { center: Point; spanM: number } | null {
  const points = state.stationAreas.filter((a) => a.complexId === complexId).flatMap((a) => stationAreaPoints(state, a));
  if (!points.length) return null;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  return { center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, spanM: Math.max(maxX - minX, maxY - minY) };
}
export function bufferedHull(points: Point[], padding: number): Point[] {
  const expanded = points.flatMap((p) => [{x:p.x-padding,y:p.y-padding},{x:p.x+padding,y:p.y-padding},{x:p.x+padding,y:p.y+padding},{x:p.x-padding,y:p.y+padding}]).sort((a,b) => a.x-b.x || a.y-b.y);
  if (expanded.length < 3) return expanded;
  const cross = (a: Point,b: Point,c: Point) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const half = (items: Point[]) => { const hull: Point[] = []; for (const p of items) { while(hull.length>1 && cross(hull.at(-2)!,hull.at(-1)!,p)<=0) hull.pop(); hull.push(p); } return hull; };
  return [...half(expanded).slice(0,-1),...half([...expanded].reverse()).slice(0,-1)];
}
