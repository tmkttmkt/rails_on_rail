import { describe, expect, it } from "vitest";
import { executeCommand, type MapCommand } from "../src/simulation/commands";
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
});
