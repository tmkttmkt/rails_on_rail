import fs from "node:fs";
import { parseSaveFile } from "../src/simulation/persistence";
import { sampleTrack, analyzeLine } from "../src/simulation/geometry";
import { inspectTrackRadii } from "../src/simulation/inspection";
const state = parseSaveFile(fs.readFileSync("saves/osm-tobu-tojo.json", "utf8")).state;
const result = state.tracks.map((t) => {
 const points = sampleTrack(t), length = analyzeLine(points).lengthM;
 const middle = points[Math.floor(points.length / 2)];
 const stations = state.stations.filter((s) => s.kind === "station").map((s) => ({ name: s.name, distance: Math.hypot(s.position.x-middle.x, s.position.y-middle.y) })).sort((a,b)=>a.distance-b.distance);
 return { id: t.id, kind:t.kind, length, middle, nearest:stations[0], depot:state.stations.filter((s)=>s.kind!=="station" && s.stopPoints.some((p)=>p.trackId===t.id)).map((s)=>s.name) };
});
fs.writeFileSync("saves/osm-tojo-inspection.report", JSON.stringify({ tracks:result, topology:inspectTrackRadii(state).topology }, null, 2));
for (const name of ["池袋","下板橋","上福岡","志木","川越市","森林公園","高坂","小川町","寄居"]) console.log(name, JSON.stringify(result.filter((t)=>t.nearest.name===name && t.kind==="side").map((t)=>({id:t.id,length:Math.round(t.length),middle:t.middle,depot:t.depot}))));
