import { STATION_AREA_ROLES, STATION_AREA_LABELS, type MapState, type StationAreaRole } from "../simulation/model";
import { trackLength } from "../simulation/yard";
import { AREA_COLORS, type StationAreaCommand } from "../simulation/stationAreas";
const esc = (s: string) => s.replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export function renderStationComplexPanel(root: HTMLElement,state: MapState,complexId: string|null,areaId:string|null,selectedStationId:string|null,selectedTrackIds:string[],select:(complexId:string,areaId?:string)=>void,command:(c:StationAreaCommand)=>void):void {
  const group=state.stationComplexes.find((g)=>g.id===complexId) ?? state.stationComplexes[0];
  root.hidden=false;root.classList.toggle("empty",!group);
  if (!group) {
    const signature="empty";if(root.dataset.signature===signature)return;root.dataset.signature=signature;
    root.innerHTML=`<h2>構内・車両基地グループを作る</h2><p>選択した施設・側線をまとめる上位グループを作成する。</p><input id="new-complex-name" placeholder="構内・車両基地の名称" maxlength="60"><button id="complex-create">グループを作成</button>`;
    root.querySelector("#complex-create")!.addEventListener("click",()=>command({type:"stationComplex.create",name:root.querySelector<HTMLInputElement>("#new-complex-name")!.value}));return;
  }
  const areas=state.stationAreas.filter((a)=>a.complexId===group.id),area=areas.find((a)=>a.id===areaId);
  const selected=state.stations.find((s)=>s.id===selectedStationId && s.stopPoints.length>0 && !state.stationAreas.some((a)=>a.stationId===s.id));
  let unassigned=state.tracks.filter((t)=>selectedTrackIds.includes(t.id) && t.kind==="side").map((t)=>({trackId:t.id,startM:0,endM:trackLength(state,t.id)}));
  for(const range of state.stationAreas.flatMap((a)=>a.ranges))unassigned=unassigned.flatMap((r)=>r.trackId!==range.trackId?[r]:[{...r,endM:Math.min(r.endM,range.startM)},{...r,startM:Math.max(r.startM,range.endM)}].filter((p)=>p.endM-p.startM>.01));
  const signature=JSON.stringify([state.stationComplexes,areas,areaId,selected?.id,unassigned]); if(root.dataset.signature===signature)return;root.dataset.signature=signature;
  root.innerHTML=`<h2>構内・車両基地グループ</h2><select id="complex-select" aria-label="構内グループ">${state.stationComplexes.map((g)=>`<option value="${esc(g.id)}" ${g.id===group.id?"selected":""}>${esc(g.name)}</option>`).join("")}</select><button id="complex-focus">構内全体を見る</button><label>グループ名<input id="complex-name" value="${esc(group.name)}" maxlength="60"></label><button id="complex-rename">グループ名を変更</button><p class="complex-help">グループ → 用途領域 → 停車可能区間。色面は線路区間から作った表示範囲。</p><div class="area-list">${areas.map((a,i)=>{
    const station=state.stations.find((s)=>s.id===a.stationId),count=station?.stopPoints.length??0;
    const longest=Math.max(0,...(station?.stopPoints.map((p)=>p.endDistanceM-p.startDistanceM)??[]));
    return `<button class="area-row ${a.id===areaId?"active":""}" data-area-id="${esc(a.id)}"><span class="area-number" style="background:${AREA_COLORS[a.role]}">${i+1}</span><span><strong>${esc(a.name)}</strong><small>${STATION_AREA_LABELS[a.role]} · ${new Set(a.ranges.map((r)=>r.trackId)).size}線 · ${count?`${count}停車区間 · 最長${longest.toFixed(0)}m`:"停車区間なし"}</small></span></button>`;
  }).join("")}</div>${area?`<div class="area-editor"><h3>選択領域</h3><label>領域名<input id="area-name" value="${esc(area.name)}" maxlength="60"></label><button id="area-rename">名称を変更</button><label>領域用途<select id="area-role" aria-label="領域用途" ${area.role==="platform"?"disabled":""}>${STATION_AREA_ROLES.map((r)=>`<option value="${r}" ${r===area.role?"selected":""} ${r==="platform" && area.role!=="platform"?"disabled":""}>${STATION_AREA_LABELS[r]}</option>`).join("")}</select></label><p>${area.role==="platform"?"既存の旅客駅ホームを関連付けている。":"引上げ・分岐・接続通路には長期留置を割り当てない。"}</p><small>${area.basis==="layout"?"ゲーム上の仮区分。現地用途の確定ではない。":"元の旅客停車範囲に対応。"}${area.note?`<br>${esc(area.note)}`:""}</small><label>所属グループ<select id="area-parent" aria-label="領域の所属グループ">${state.stationComplexes.map((g)=>`<option value="${esc(g.id)}" ${g.id===area.complexId?"selected":""}>${esc(g.name)}</option>`).join("")}</select></label>${area.role!=="platform"?`<details><summary>この領域をさらに分割</summary><p>線路群を二つの領域へ分ける。</p>${[...new Set(area.ranges.map((r)=>r.trackId))].map((id,i)=>`<label class="area-track-choice"><input type="checkbox" class="area-track-check" value="${esc(id)}" ${i===0?"checked":""}>線路 ${esc(id.replace("track-",""))}</label>`).join("")}<button id="area-split-tracks" ${new Set(area.ranges.map((r)=>r.trackId)).size<2?"disabled":""}>選んだ線路群を別領域に分ける</button>${area.ranges.length===1?`<label>区間始端からの分割距離（m）<input id="area-cut" type="number" min="1" max="${area.ranges[0].endM-area.ranges[0].startM-1}" step="0.1" value="${((area.ranges[0].endM-area.ranges[0].startM)/2).toFixed(1)}"></label><button id="area-split-distance">同じ線路の前後を分ける</button>`:""}</details>`:""}</div>`:"<p>領域を選ぶと範囲・用途を確認、再分割できる。</p>"}${unassigned.length?`<button id="area-from-track">選択中の未所属側線を領域として追加</button>`:""}${selected?`<button id="area-from-station">選択中の「${esc(selected.name)}」を領域として追加</button>`:""}<details><summary>新しい構内グループを作る</summary><input id="new-complex-name" placeholder="構内・車両基地の名称" maxlength="60"><button id="complex-create">グループを作成</button></details>`;
  root.querySelector<HTMLSelectElement>("#complex-select")!.addEventListener("change",(e)=>select((e.target as HTMLSelectElement).value));
  root.querySelector("#complex-rename")!.addEventListener("click",()=>command({type:"stationComplex.rename",complexId:group.id,name:root.querySelector<HTMLInputElement>("#complex-name")!.value}));
  root.querySelector("#complex-focus")!.addEventListener("click",()=>select(group.id));
  root.querySelectorAll<HTMLButtonElement>("[data-area-id]").forEach((button)=>button.addEventListener("click",()=>select(group.id,button.dataset.areaId!)));
  root.querySelector("#complex-create")!.addEventListener("click",()=>command({type:"stationComplex.create",name:root.querySelector<HTMLInputElement>("#new-complex-name")!.value}));
  root.querySelector("#area-from-station")?.addEventListener("click",()=>command({type:"stationArea.create",area:{complexId:group.id,name:selected!.name,role:selected!.kind==="station"?"platform":"stabling",basis:"layout",stationId:selected!.id,ranges:selected!.stopPoints.map((p)=>({trackId:p.trackId,startM:p.startDistanceM,endM:p.endDistanceM}))}}));
  root.querySelector("#area-from-track")?.addEventListener("click",()=>command({type:"stationArea.create",area:{complexId:group.id,name:"用途未確認の線群",role:"unknown",basis:"layout",ranges:unassigned}}));
  if(!area)return;
  root.querySelector("#area-rename")!.addEventListener("click",()=>command({type:"stationArea.rename",areaId:area.id,name:root.querySelector<HTMLInputElement>("#area-name")!.value}));
  root.querySelector<HTMLSelectElement>("#area-role")!.addEventListener("change",(e)=>command({type:"stationArea.setRole",areaId:area.id,role:(e.target as HTMLSelectElement).value as StationAreaRole}));
  root.querySelector<HTMLSelectElement>("#area-parent")!.addEventListener("change",(e)=>command({type:"stationArea.move",areaId:area.id,complexId:(e.target as HTMLSelectElement).value}));
  root.querySelector("#area-split-tracks")?.addEventListener("click",()=>{
    const ids=new Set([...root.querySelectorAll<HTMLInputElement>(".area-track-check:checked")].map((e)=>e.value));
    command({type:"stationArea.split",areaId:area.id,parts:[{name:`${area.name} A`,role:area.role,ranges:area.ranges.filter((r)=>ids.has(r.trackId))},{name:`${area.name} B`,role:area.role,ranges:area.ranges.filter((r)=>!ids.has(r.trackId))}]});
  });
  root.querySelector("#area-split-distance")?.addEventListener("click",()=>{
    const range=area.ranges[0],cut=range.startM+Number(root.querySelector<HTMLInputElement>("#area-cut")!.value);
    command({type:"stationArea.split",areaId:area.id,parts:[{name:`${area.name} A`,role:area.role,ranges:[{...range,endM:cut}]},{name:`${area.name} B`,role:area.role,ranges:[{...range,startM:cut}]}]});
  });
}
