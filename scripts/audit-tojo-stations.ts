import fs from "node:fs";
import { createHash } from "node:crypto";
import { parseSaveFile } from "../src/simulation/persistence";
import { sampleTrack, getTrackPortTangent } from "../src/simulation/geometry";
import { yardPoint } from "../src/simulation/yard";

const input = "saves/osm-tobu-tojo-depots.json";
const raw = fs.readFileSync(input, "utf8"), state = parseSaveFile(raw).state;
const refs = JSON.parse(fs.readFileSync("data/maps/tojo-platform-reference.json", "utf8")).stations as { name: string; passengerTrackCount: number; source: string }[];
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const results = refs.map((ref) => {
  const station = state.stations.find((s) => s.kind === "station" && s.name === ref.name);
  if (!station) throw new Error(`駅がない: ${ref.name}`);
  const ranges = station.stopPoints.map((p) => {
    const track = state.tracks.find((t) => t.id === p.trackId)!;
    const from = yardPoint(state, p.trackId, p.startDistanceM), to = yardPoint(state, p.trackId, p.endDistanceM);
    const midpoint = yardPoint(state, p.trackId, (p.startDistanceM + p.endDistanceM) / 2);
    const a = getTrackPortTangent(track, "interior", p.startDistanceM), b = getTrackPortTangent(track, "interior", p.endDistanceM);
    return { id: p.id, trackId: p.trackId, kind: track.kind, lengthM: p.endDistanceM - p.startDistanceM, midpoint,
      positionErrorM: Math.max(Math.hypot(from.x - p.startPosition.x, from.y - p.startPosition.y), Math.hypot(to.x - p.endPosition.x, to.y - p.endPosition.y)),
      bendDegrees: Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y))) * 180 / Math.PI,
      junctionsInside: state.junctions.filter((j) => j.ports.some((port) => port.trackId === p.trackId && port.distanceM > p.startDistanceM + 0.01 && port.distanceM < p.endDistanceM - 0.01)).map((j) => j.id) };
  });
  const shortestM = Math.min(...ranges.map((p) => p.lengthM)), longestM = Math.max(...ranges.map((p) => p.lengthM));
  const midpointSpreadM = Math.max(...ranges.flatMap((a) => ranges.map((b) => Math.hypot(a.midpoint.x - b.midpoint.x, a.midpoint.y - b.midpoint.y))));
  const countMismatch = ranges.length !== ref.passengerTrackCount;
  const shortRanges = ranges.filter((p) => p.lengthM < 80).map((p) => p.trackId);
  return { name: ref.name, stationId: station.id, source: ref.source, actualTrackCount: ranges.length, referenceTrackCount: ref.passengerTrackCount, countMismatch, shortRanges, shortestM, longestM, midpointSpreadM, ranges };
});
const summary = { stations: results.length, totalStopPoints: results.reduce((n, r) => n + r.ranges.length, 0), countMismatchStations: results.filter((r) => r.countMismatch).map((r) => r.name), shortRangeStations: results.filter((r) => r.shortRanges.length).map((r) => r.name), coordinateErrors: results.flatMap((r) => r.ranges.filter((p) => p.positionErrorM > 0.01)), junctionCrossings: results.flatMap((r) => r.ranges.filter((p) => p.junctionsInside.length)), maximumRangeM: Math.max(...results.map((r) => r.longestM)) };
fs.writeFileSync("saves/osm-tojo-station-audit.report", JSON.stringify({ input, sha256: createHash("sha256").update(raw).digest("hex"), summary, stations: results }, null, 2));
// 全駅の図を同一縮尺で描く。主軸は駅の最長停車範囲に沿わせる。
const cards = results.map((row) => {
  const station = state.stations.find((s) => s.id === row.stationId)!;
  const primary = station.stopPoints.reduce((a, b) => a.endDistanceM - a.startDistanceM > b.endDistanceM - b.startDistanceM ? a : b);
  const p = primary.startPosition, q = primary.endPosition, length = Math.hypot(q.x - p.x, q.y - p.y), ux = (q.x - p.x) / length, uy = (q.y - p.y) / length;
  const project = (p: { x: number; y: number }) => ({ x: (p.x - station.position.x) * ux + (p.y - station.position.y) * uy, y: -(p.x - station.position.x) * uy + (p.y - station.position.y) * ux });
  const path = (points: { x: number; y: number }[]) => points.map(project).map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const background = state.tracks.filter((t) => t.points.some((p) => Math.hypot(p.x - station.position.x, p.y - station.position.y) < 800)).map((t) => `<path d="${path(sampleTrack(t))}" fill="none" stroke="#a5afb6" stroke-width="1.5"/>`).join("");
  const selected = station.stopPoints.map((p) => {
    const count = Math.max(2, Math.ceil((p.endDistanceM - p.startDistanceM) / 3));
    const points = Array.from({ length: count + 1 }, (_, i) => yardPoint(state, p.trackId, p.startDistanceM + (p.endDistanceM - p.startDistanceM) * i / count));
    const mid = project(points[Math.floor(count / 2)]), index = station.stopPoints.indexOf(p) + 1;
    return `<path d="${path(points)}" stroke="#c6302b" stroke-width="3" fill="none"/><text x="${mid.x}" y="${mid.y - 3}" font-size="8" fill="#161b20" stroke="white" stroke-width=".4">${index}</text>`;
  }).join("");
  const rows = row.ranges.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.trackId)}</td><td>${r.lengthM.toFixed(1)} m</td><td>${r.kind === "side" ? "側線指定" : "本線指定"}</td></tr>`).join("");
  return `<article id="${row.stationId}" class="${row.countMismatch ? "issue" : ""}"><h2>${esc(row.name)} <small>登録${row.actualTrackCount}線／公式図${row.referenceTrackCount}線</small></h2><svg viewBox="-400 -100 800 200" role="img" aria-label="${esc(row.name)}の登録範囲">${background}${selected}<path d="M-350,80h100" stroke="black"/><text x="-350" y="95" font-size="10">100 m</text></svg><p>赤が現在の旅客停車範囲。灰色が配線。図中番号は下表の番号であり、実際の番線番号ではない。</p><table><tr><th>図番号</th><th>線路ID</th><th>長さ</th><th>取込分類</th></tr>${rows}</table><p><a href="${esc(row.source)}" target="_blank">東武公式の駅構内図</a></p></article>`;
});
const nav = results.map((r) => `<a href="#${r.stationId}">${esc(r.name)}${r.countMismatch ? " ⚠" : ""}</a>`).join(" ");
fs.writeFileSync("saves/osm-tojo-station-audit.html", `<!doctype html><html lang="ja"><meta charset="utf-8"><title>東上線 全46駅の形状監査</title><style>body{font:15px sans-serif;background:#f2f4f7;margin:24px;color:#182632}nav{line-height:2.2}nav a{white-space:nowrap;margin-right:12px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(580px,1fr));gap:20px}article{background:white;padding:18px;border:1px solid #bdc7cf;scroll-margin:15px}.issue{border:2px solid #bc3932}h2 small{font-size:14px}svg{width:100%;background:#f8fafb}td,th{text-align:left;padding:4px 16px;border-bottom:1px solid #ddd}p{line-height:1.6}a{color:#175c9d}</style><h1>東上線・越生線 全46駅の形状監査</h1><p>現マップと東武公式構内図を照合した調査用ページ。⚠は旅客線路の登録数が公式図と違う駅。200 m編成に対し、現在の停車範囲は全駅180 m以下。赤枠以外の駅もホーム端の実寸復元は未確認である。</p><p>元地図は変更していない。© OpenStreetMap contributors / ODbL。公式図はリンクのみ。</p><nav>${nav}</nav><main>${cards.join("")}</main></html>`);
console.log(JSON.stringify(summary, null, 2));
