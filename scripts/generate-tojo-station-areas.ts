import fs from "node:fs";
import { createHash } from "node:crypto";
import { parse } from "yaml";
import { executeCommand } from "../src/simulation/commands";
import { createSaveFile, parseSaveFile, serializeSaveFile } from "../src/simulation/persistence";
import { getUsableStablingSpans } from "../src/simulation/stabling";
import { partitionStationStopPointsByTrack } from "../src/simulation/stationPartition";
import { projectStationOnTrack } from "../src/simulation/stationImportRange";
import { trackLength, yardPoint } from "../src/simulation/yard";
import type { StationAreaRange, StationAreaRole, Station } from "../src/simulation/model";
interface Group { id: string; name: string; station: string; facilities: { name: string; role: StationAreaRole }[] }
interface RawArea { id: string; name: string; role: StationAreaRole; tracks?: number[]; ranges?: { track: number; from: number; to?: number }[]; safeOnly?: boolean }
const facilityDefinitions = parse(fs.readFileSync("data/maps/tojo-depots.yaml","utf8")) as { facilities: { name:string; tracks?:number[]; trackRange?:[number,number] }[] };
const config = parse(fs.readFileSync("data/maps/tojo-station-areas.yaml", "utf8")) as { formatVersion: number; source: string; output: string; complexes: Group[]; kawagoe: { station: string; groups: { id: string; name: string; areas: string[]; residual?: "north" | "south" }[]; replaceFacilities: string[]; mainlineMarginM: number; scopeTracks: number[]; areas: RawArea[] } };
if (config.formatVersion !== 1 || config.source === config.output) throw new Error("領域マップ設定が不正");
const source = fs.readFileSync(config.source,"utf8"); let state = parseSaveFile(source).state;
if (state.stationAreas.length || state.stationComplexes.length || state.yard || state.vehiclePlacements.length || Object.keys(state.routes).length || state.operatingTrains.length) throw new Error("領域分割前・運転前の原マップを指定する");
const geometry = JSON.stringify([state.tracks,state.junctions,state.turnouts]);
const passenger = JSON.stringify(state.stations.filter((s) => s.kind === "station"));
const run = (command: Parameters<typeof executeCommand>[1]) => { state = executeCommand(state, command).state; };
const find = (name: string) => { const station = state.stations.find((s) => s.name === name); if (!station) throw new Error(`停車場がない: ${name}`); return station; };
const stationRanges = (station: Station): StationAreaRange[] => station.stopPoints.map((p) => ({ trackId:p.trackId,startM:p.startDistanceM,endM:p.endDistanceM }));
const add = (complexId: string,id: string,name: string,role: StationAreaRole,ranges: StationAreaRange[],stationId?: string,note?: string) => {
  if (!ranges.length) throw new Error(`領域に区間がない: ${name}`);
  run({ type:"stationArea.create",area:{ id,complexId,name,role,ranges,stationId,basis:role === "platform" ? "source":"layout",note } });
};
const cut = (ranges: StationAreaRange[], occupied: StationAreaRange[]) => {
  let result = ranges;
  for (const other of occupied) result = result.flatMap((r) => r.trackId !== other.trackId ? [r] : [{...r,endM:Math.min(r.endM,other.startM)},{...r,startM:Math.max(r.startM,other.endM)}].filter((p) => p.endM-p.startM > 0.01));
  return result;
};
const k = config.kawagoe, station = find(k.station);
for (const group of k.groups) run({ type:"stationComplex.create",id:group.id,name:group.name });
const kawagoeOwner = new Map(k.groups.flatMap((g) => g.areas.map((areaId) => [areaId, g.id] as const)));
for (const definition of k.areas) if (!kawagoeOwner.has(definition.id)) throw new Error(`川越市の領域が未所属: ${definition.id}`);
const kawagoeResidual = (side: "north" | "south") => { const group = k.groups.find((g) => g.residual === side); if (!group) throw new Error(`川越市の${side}側残余の所属グループがない`); return group.id; };
for (const name of k.replaceFacilities) run({ type:"station.delete",stationId:find(name).id });
const candidateScopes: StationAreaRange[] = k.scopeTracks.map((n) => ({ trackId:`track-${n}`,startM:0,endM:trackLength(state,`track-${n}`) }));
for (const trackId of ["track-1","track-10"]) {
  const stop = station.stopPoints.find((p) => p.trackId === trackId)!;
  candidateScopes.push({trackId,startM:Math.max(0,stop.startDistanceM-k.mainlineMarginM),endM:Math.min(trackLength(state,trackId),stop.endDistanceM+k.mainlineMarginM)});
}
// 旅客ホームは独立した駅として扱い、分岐の残余区間にも含めない。
const scopes = cut(candidateScopes,stationRanges(station));
for (const definition of k.areas) {
  let ranges: StationAreaRange[] = [...(definition.tracks ?? []).map((n) => ({trackId:`track-${n}`,startM:0,endM:trackLength(state,`track-${n}`)})),...(definition.ranges ?? []).map((r) => ({ trackId:`track-${r.track}`,startM:r.from,endM:r.to ?? trackLength(state,`track-${r.track}`) }))];
  if (definition.safeOnly) ranges = ranges.flatMap((r) => getUsableStablingSpans(state,state.tracks.find((t) => t.id === r.trackId)!,r.startM,r.endM).filter((s) => s.endM-s.startM>=20).map((s) => ({trackId:r.trackId,...s})));
  // 旧工場側は現役用途・進入経路が未確定。領域と物理的な停車可能範囲を分けて保持する。
  add(kawagoeOwner.get(definition.id)!,`area-kawagoe-${definition.id}`,definition.name,definition.role,ranges,undefined,"ゲーム上の仮区分。正式番線・現役用途・ホームからの入出庫経路は未確定。");
}
const residual = cut(scopes,state.stationAreas.flatMap((a) => a.ranges));
const north: StationAreaRange[] = [], south: StationAreaRange[] = [];
for (const range of residual) {
  const track = state.tracks.find((t) => t.id === range.trackId)!;
  const along = projectStationOnTrack(track,station.position).alongM;
  const pieces = along > range.startM+0.01 && along < range.endM-0.01 ? [{...range,endM:along},{...range,startM:along}] : [range];
  for (const piece of pieces) (yardPoint(state,piece.trackId,(piece.startM+piece.endM)/2).y < station.position.y ? north:south).push(piece);
}
add(kawagoeResidual("north"),"area-kawagoe-north-throat","北側の分岐・接続区間（仮）","throat",north,undefined,"北側の残余区間。単一の入換経路として確認したものではなく、留置にも使用しない。");
add(kawagoeResidual("south"),"area-kawagoe-south-throat","南側分岐・旧工場接続通路","transit",south,undefined,"接続通路。旧工場への有向進入経路は未確認。留置場所として登録しない。");
const groupCoverage: {complexId:string;unassignedRanges:number;rangesOwnedByOtherGroup:number}[] = k.groups.map((g) => ({complexId:g.id,unassignedRanges:0,rangesOwnedByOtherGroup:0}));
for (const group of config.complexes) {
  run({type:"stationComplex.create",id:group.id,name:group.name});
  // 旅客ホームは独立した駅として扱い、車庫・検修・保守の構内グループへ入れない。
  const passengerStation = find(group.station);
  const scopeIds = new Set<string>();
  for (const [facilityIndex,member] of group.facilities.entries()) {
    const definition=facilityDefinitions.facilities.find((f)=>f.name===member.name);
    if(!definition)throw new Error(`施設の元区分設定がない: ${member.name}`);
    const numbers=definition.tracks ?? Array.from({length:definition.trackRange![1]-definition.trackRange![0]+1},(_,i)=>definition.trackRange![0]+i);
    for(const n of numbers)if(state.tracks.some((t)=>t.id===`track-${n}` && t.kind==="side"))scopeIds.add(`track-${n}`);
    const original = structuredClone(find(member.name));
    // 同じ線路の停車範囲は必ず同じ線群へ入れる。範囲単位の判定だけでは、分岐支障で
    // 分断された同一線路の区間が別の線群へ落ちて線群が無意味に分かれる。
    const partitions = partitionStationStopPointsByTrack(original.stopPoints,{maximumAngleDegrees:12,maximumLateralDistanceM:16,minimumOverlapRatio:0.55});
    // 線群をさらに機械的な線路数で割らない。並行し長手方向が重なる線群がそのまま領域になる。
    // 本数で切ると、同じ扇状の線群がx座標順の任意の位置で二つの領域へ分かれる。
    const groups = partitions;
    // 元の停車範囲を過不足なく、重複なく配分したことを確認する。
    const distributed = groups.flat();
    if (distributed.length !== original.stopPoints.length || new Set(distributed.map((p) => p.id)).size !== original.stopPoints.length) throw new Error(`線群の配分で停車範囲が重複または欠落: ${member.name}`);
    for (const [, points] of groups.entries()) {
      const tracks = new Set(points.map((p) => p.trackId));
      if (groups.filter((other) => other !== points && other.some((p) => tracks.has(p.trackId))).length) throw new Error(`同じ線路が複数の線群へ分かれた: ${member.name}`);
    }
    run({type:"station.delete",stationId:original.id});
    for (const [index,points] of groups.entries()) {
      const name = groups.length === 1 ? original.name : `${original.name}・第${index+1}線群`;
      add(group.id,`area-${group.id}-${facilityIndex+1}-${index+1}`,name,member.role,stationRanges({...original,stopPoints:points}),undefined,"幾何による線群区分とゲーム上の用途指定。現地の建物機能・番線対応は未確定。");
    }
  }
  // 留置可能範囲だけで構内を終わらせず、その外側の分岐・接続区間も所有する。
  const localScope: StationAreaRange[]=[...scopeIds].map((trackId)=>({trackId,startM:0,endM:trackLength(state,trackId)}));
  for(const junction of state.junctions.filter((j)=>j.ports.some((p)=>scopeIds.has(p.trackId))))for(const p of junction.ports){
    if(state.tracks.find((t)=>t.id===p.trackId)?.kind==="main")localScope.push({trackId:p.trackId,startM:Math.max(0,p.distanceM-45),endM:Math.min(trackLength(state,p.trackId),p.distanceM+45)});
  }
  // 本線margin側にホームが掛かっても、分岐接続通路が旅客ホーム範囲を所有しないようにする。
  const merged:StationAreaRange[]=[];
  for(const range of cut(localScope,stationRanges(passengerStation)).sort((a,b)=>a.trackId.localeCompare(b.trackId)||a.startM-b.startM)){const last=merged.at(-1);if(last?.trackId===range.trackId && range.startM<=last.endM+.001)last.endM=Math.max(last.endM,range.endM);else merged.push({...range});}
  const remaining=cut(merged,state.stationAreas.flatMap((a)=>a.ranges));
  if(remaining.length)add(group.id,`area-${group.id}-connections`,`${group.name}・分岐接続通路`,"transit",remaining,undefined,"元の施設対象線路と本線接続部の残余区間。停止範囲と分離し、留置用には扱わない。");
  const missing=cut(merged,state.stationAreas.filter((a)=>a.complexId===group.id).flatMap((a)=>a.ranges));
  if(missing.length)throw new Error(`構内対象区間が未所属または他グループと競合: ${group.name}`);
  // 同じ駅を通常運行用と車庫・検修用のグループへ分けても、各グループが自分の対象区間を
  // 過不足なく所有することを維持する。別グループ所有の発生を0として記録する。
  const foreign=cut(merged,state.stationAreas.flatMap((a)=>a.ranges)).length;
  groupCoverage.push({complexId:group.id,unassignedRanges:missing.length,rangesOwnedByOtherGroup:foreign});
}
if (JSON.stringify([state.tracks,state.junctions,state.turnouts]) !== geometry || JSON.stringify(state.stations.filter((s) => s.kind === "station")) !== passenger) throw new Error("線路・接続または旅客駅が変わった");
// 川越市の対象範囲を過不足なく所有する。短い接続区間も咽喉部として保持する。
const kawagoeIds = new Set(k.groups.map((g) => g.id));
const kawagoeRanges = state.stationAreas.filter((a) => kawagoeIds.has(a.complexId)).flatMap((a) => a.ranges);
const uncovered = cut(scopes,kawagoeRanges);
if (uncovered.length) throw new Error("川越市構内に未所属区間が残った");
state.clock.paused = true;
const save = serializeSaveFile(createSaveFile("東上線｜構内・車両基地の領域分割",state)); parseSaveFile(save); fs.writeFileSync(config.output,save);
const adjacency = [] as { from:string;to:string;kind:string }[];
for (let i=0;i<state.stationAreas.length;i++) for (const b of state.stationAreas.slice(i+1)) {
  const a=state.stationAreas[i]; if (a.complexId!==b.complexId) continue;
  const at=(area:typeof a,trackId:string,m:number)=>area.ranges.some((r)=>r.trackId===trackId && m>=r.startM-.01 && m<=r.endM+.01);
  if (a.ranges.some((r)=>b.ranges.some((s)=>r.trackId===s.trackId && (Math.abs(r.endM-s.startM)<.01 || Math.abs(s.endM-r.startM)<.01)))) adjacency.push({from:a.id,to:b.id,kind:"same-track-boundary"});
  else if (state.junctions.some((j)=>j.ports.some((p)=>at(a,p.trackId,p.distanceM)) && j.ports.some((p)=>at(b,p.trackId,p.distanceM)))) adjacency.push({from:a.id,to:b.id,kind:"junction-adjacency"});
}
const report={source:config.source,sourceSha256:createHash("sha256").update(source).digest("hex"),groups:state.stationComplexes.length,areas:state.stationAreas.length,geometryUnchanged:true,passengerStationsUnchanged:true,kawagoeFullyAssigned:true,groupCoverage,complexes:state.stationComplexes.map((g)=>({...g,areas:state.stationAreas.filter((a)=>a.complexId===g.id).map((a)=>({...a,station:state.stations.find((s)=>s.id===a.stationId)?.name,stoppingRanges:state.stations.find((s)=>s.id===a.stationId)?.stopPoints.length ?? 0}))})),adjacency};
fs.writeFileSync("saves/osm-tojo-station-areas.report",JSON.stringify(report,null,2)); console.log(JSON.stringify({groups:report.groups,areas:report.areas,kawagoe:report.complexes[0].areas.map((a)=>({name:a.name,role:a.role,stoppingRanges:a.stoppingRanges}))},null,2));
