import { describe, expect, it } from "vitest";
import { executeCommand, type MapCommand } from "../src/simulation/commands";
import { stationComplexBounds } from "../src/simulation/stationAreas";
import { COMPLEX_EXPAND_PX, collapsedStationComplexes } from "../src/ui/renderer";
import { createInitialState, type MapState } from "../src/simulation/model";
import { parseMapState, serializeMapState } from "../src/simulation/persistence";
const run=(s:MapState,c:MapCommand)=>executeCommand(s,c).state;
function base(){let s=run(createInitialState(),{type:"track.create",kind:"side",geometry:"straight",points:[{x:0,y:0},{x:600,y:0}]});return run(s,{type:"stationComplex.create",name:"駅と車両基地"});}
function area(role:"stabling"|"throat"="stabling"){let s=base();return run(s,{type:"stationArea.create",area:{complexId:s.stationComplexes[0].id,name:"構内線群",role,basis:"layout",ranges:[{trackId:"track-1",startM:0,endM:600}]}});}
describe("構内グループと用途領域",()=>{
  it("線路を変えずに同一線路を留置・引上げ・通路へ分割して保存できる",()=>{
    let s=area();const points=JSON.stringify(s.tracks);const id=s.stationAreas[0].id;
    s=run(s,{type:"stationArea.split",areaId:id,parts:[{name:"留置線",role:"stabling",ranges:[{trackId:"track-1",startM:0,endM:300}]},{name:"引上げ線",role:"headshunt",ranges:[{trackId:"track-1",startM:300,endM:500}]},{name:"分岐通路",role:"throat",ranges:[{trackId:"track-1",startM:500,endM:600}]}]});
    expect(s.stationAreas.map((a)=>a.role)).toEqual(["stabling","headshunt","throat"]);expect(s.stationAreas[2].stationId).toBeUndefined();
    expect(s.stations).toHaveLength(2);expect(s.stations.find((st)=>st.id===s.stationAreas[1].stationId)!.facilityUse).toBe("headshunt");
    expect(JSON.stringify(s.tracks)).toBe(points);expect(parseMapState(serializeMapState(s))).toEqual(s);
  });
  it("別領域との重複・分割時の欠落・空の分割を原子的に拒否する",()=>{
    const s=area(),original=JSON.stringify(s);const group=s.stationComplexes[0].id;
    expect(()=>run(s,{type:"stationArea.create",area:{complexId:group,name:"重複",role:"transit",basis:"layout",ranges:[{trackId:"track-1",startM:100,endM:200}]}})).toThrow("重複");
    expect(()=>run(s,{type:"stationArea.split",areaId:s.stationAreas[0].id,parts:[{name:"A",role:"stabling",ranges:[{trackId:"track-1",startM:0,endM:100}]},{name:"B",role:"stabling",ranges:[{trackId:"track-1",startM:200,endM:600}]}]})).toThrow("過不足");
    expect(JSON.stringify(s)).toBe(original);
  });
  it("関連駅・親・停車範囲が壊れた保存を拒否し、旧v14は空の階層で移行する",()=>{
    const s=area(),raw=JSON.parse(serializeMapState(s));raw.stationAreas[0].complexId="missing";expect(()=>parseMapState(JSON.stringify(raw))).toThrow("所属");
    raw.stationAreas[0].complexId=s.stationComplexes[0].id;raw.stationAreas[0].stationId="missing";expect(()=>parseMapState(JSON.stringify(raw))).toThrow("関連停車場");
    const old={...createInitialState(),version:14};delete (old as Partial<typeof old>).stationAreas;delete (old as Partial<typeof old>).stationComplexes;
    const migrated=parseMapState(JSON.stringify(old));expect(migrated.version).toBe(15);expect(migrated.stationAreas).toEqual([]);
  });
  it("通路へ古い停車場が重なっていても留置配置を許可しない",()=>{
    let s=area("throat");s=run(s,{type:"station.createRange",name:"過去の範囲",kind:"depot",trackId:"track-1",startPosition:{x:100,y:0},endPosition:{x:300,y:0}});
    s=run(s,{type:"fleet.formation-template.acquire",templateId:"test-single-locomotive"});
    expect(()=>run(s,{type:"fleet.formation.place",formationId:s.fleet.formations[0].id,stationId:s.stations[0].id,trackId:"track-1",distanceM:200})).toThrow("留置用ではありません");
  });
  it("子領域を残した親削除や参照中停車場の直接編集を拒否する",()=>{
    const s=area(),id=s.stationAreas[0].stationId!;
    expect(()=>run(s,{type:"stationComplex.delete",complexId:s.stationComplexes[0].id})).toThrow("領域");
    expect(()=>run(s,{type:"station.delete",stationId:id})).toThrow("関連付け");
    expect(()=>run(s,{type:"facility.setUse",stationId:id,use:"maintenance"})).toThrow("構内領域");
    expect(()=>run(s,{type:"track.delete",trackId:"track-1"})).toThrow("構内領域");
    expect(()=>run(s,{type:"turnout.create",trackId:"track-1",position:{x:200,y:0},typeId:"turnout-no12",side:"left"})).toThrow("構内領域");
  });
  it("用途を通路に変えたら停車範囲を外し、別グループへ移しても線路を保持する",()=>{
    let s=area();const id=s.stationAreas[0].id;s=run(s,{type:"stationArea.setRole",areaId:id,role:"transit"});
    expect(s.stations).toHaveLength(0);expect(s.stationAreas[0].stationId).toBeUndefined();
    s=run(s,{type:"stationComplex.create",name:"分離した車両基地"});s=run(s,{type:"stationArea.move",areaId:id,complexId:s.stationComplexes[1].id});
    expect(s.stationAreas[0].complexId).toBe(s.stationComplexes[1].id);expect(s.tracks).toHaveLength(1);expect(parseMapState(serializeMapState(s))).toEqual(s);
  });

  it("グループごとの画面上の広がりで、折りたたみと駅部品への展開を切り替える",()=>{
    // 600 mの線群を一つのグループへ所属させた状態を使う。
    const s=area();const group=s.stationComplexes[0].id;
    const bounds=stationComplexBounds(s,group)!;
    expect(bounds.spanM).toBeCloseTo(600,1);expect(bounds.center.x).toBeCloseTo(300,1);
    const at=(zoom:number)=>collapsedStationComplexes(s,{x:0,y:0,zoom,rotation:0});
    // 閾値px未満の倍率では折りたたみ、超えたら展開する。
    expect([...at(COMPLEX_EXPAND_PX/600*0.9).keys()]).toEqual([group]);
    expect([...at(COMPLEX_EXPAND_PX/600*1.1).keys()]).toEqual([]);
    expect(stationComplexBounds(s,"missing")).toBeNull();
  });

  it("広い構内と小さな側線群を同じ倍率で切り替えない",()=>{
    let s=area();// 既存は600 m。60 mの小さな側線群をもう一つ作る。
    s=run(s,{type:"track.create",kind:"side",geometry:"straight",points:[{x:0,y:5000},{x:60,y:5000}]});
    s=run(s,{type:"stationComplex.create",name:"小側線群"});
    const small=s.stationComplexes[1].id;
    s=run(s,{type:"stationArea.create",area:{complexId:small,name:"側線",role:"stabling",basis:"layout",ranges:[{trackId:"track-2",startM:0,endM:60}]}});
    // 大きい構内が展開する倍率でも、小さい側線群はまだ折りたたみのまま。
    const collapsed=collapsedStationComplexes(s,{x:0,y:0,zoom:COMPLEX_EXPAND_PX/600*1.1,rotation:0});
    expect([...collapsed.keys()]).toEqual([small]);
  });

  it("領域に属する停車場の種別変更を拒否し、属さない停車場では許可する",()=>{
    const s=area();const linked=s.stationAreas[0].stationId!;
    // 領域が種別と用途を決めている停車場は、停車場側から変えられない。
    expect(()=>run(s,{type:"station.setKind",stationId:linked,kind:"depot"})).toThrow("構内領域");
    // 領域に属さない停車場は施設タブから種別を変えられる。
    let t=run(s,{type:"track.create",kind:"side",geometry:"straight",points:[{x:0,y:900},{x:400,y:900}]});
    t=run(t,{type:"station.createRange",name:"単独の停車場",kind:"yard",trackId:"track-2",startPosition:{x:50,y:900},endPosition:{x:350,y:900}});
    const alone=t.stations.find((st)=>st.name==="単独の停車場")!.id;
    t=run(t,{type:"station.setKind",stationId:alone,kind:"depot"});
    expect(t.stations.find((st)=>st.id===alone)!.kind).toBe("depot");
  });

  it("領域を削除すると区分だけが解け、停車場と線路は残る",()=>{
    const s=area();const tracks=JSON.stringify(s.tracks);
    expect(s.stations).toHaveLength(1);
    const linked=s.stationAreas[0].stationId!;
    const t=run(s,{type:"stationArea.delete",areaId:s.stationAreas[0].id});
    expect(t.stationAreas).toHaveLength(0);
    // 停車場と線路は保持する。区分の解除で配線や停車範囲を壊さない。
    expect(t.stations.map((st)=>st.id)).toEqual([linked]);
    expect(JSON.stringify(t.tracks)).toBe(tracks);
    // 領域から外れたので、停車場側から種別を変えられるようになる。
    expect(run(t,{type:"station.setKind",stationId:linked,kind:"depot"}).stations[0].kind).toBe("depot");
    // 領域が無くなった親は削除できる。
    expect(run(t,{type:"stationComplex.delete",complexId:t.stationComplexes[0].id}).stationComplexes).toHaveLength(0);
  });
});
