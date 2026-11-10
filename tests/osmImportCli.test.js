import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseSaveFile } from "../src/simulation/persistence";

describe("OSM取込CLIの旅客駅", () => {
  it("ホーム端の220 mを使い、側線を除外し、ホーム未提供時は診断だけ残す", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rails-osm-import-test-"));
    try {
      const geo = (x, y) => ({ lat: 35 - y / 111320, lon: 139 + x / (111320 * Math.cos(35 * Math.PI / 180)) });
      const rails = [];
      for (const [i, y] of [7, -7, 11, -11].entries()) {
        const nodes = [i * 2 + 1, i * 2 + 2];
        rails.push(...nodes.map((id, j) => ({ type: "node", id, ...geo(j ? 400 : -200, y) })));
        rails.push({ type: "way", id: i + 1, nodes, tags: { railway: "rail", operator: "A", ...(i === 2 ? { service: "siding" } : i === 3 ? { service: "yard" } : {}) } });
      }
      const source = path.join(dir, "rails.json"), stations = path.join(dir, "stations.json"), platforms = path.join(dir, "platforms.json");
      writeFileSync(source, JSON.stringify({ elements: rails }));
      writeFileSync(stations, JSON.stringify({ elements: [{ type: "node", id: 100, ...geo(100, 0), tags: { name: "Fixture", railway: "station", operator: "A" } }] }));
      writeFileSync(platforms, JSON.stringify({ elements: [{ type: "way", id: 101, tags: { railway: "platform" }, geometry: [[0, -5], [220, -5], [220, 5], [0, 5], [0, -5]].map(([x, y]) => geo(x, y)) }] }));
      const run = (name, withPlatforms) => {
        const output = path.join(dir, `${name}.json`);
        execFileSync(process.execPath, ["node_modules/vite-node/vite-node.mjs", "scripts/import-osm-map.ts", source, output, "Fixture", stations, ...(withPlatforms ? [platforms] : [])], { cwd: process.cwd(), stdio: "pipe" });
        return { state: parseSaveFile(readFileSync(output, "utf8")).state, report: JSON.parse(readFileSync(`${output}.stations.report`, "utf8")) };
      };
      const imported = run("with-platform", true);
      const passenger = imported.state.stations.filter((s) => s.kind === "station");
      expect(passenger).toHaveLength(1);
      expect(passenger[0].stopPoints).toHaveLength(2);
      expect(passenger[0].stopPoints.map((s) => s.trackId).sort()).toEqual(["track-1", "track-2"]);
      for (const range of passenger[0].stopPoints) expect(range.endDistanceM - range.startDistanceM).toBeCloseTo(220, 1);
      // out body + node参照形式も、geometry形式と同じ結果になる。
      const platformNodes = [[0, -5], [220, -5], [220, 5], [0, 5]].map(([x, y], i) => ({ type: "node", id: 200 + i, ...geo(x, y) }));
      writeFileSync(platforms, JSON.stringify({ elements: [...platformNodes, { type: "way", id: 101, nodes: [200, 201, 202, 203, 200], tags: { public_transport: "platform" } }] }));
      const referenced = run("node-platform", true);
      expect(referenced.state.stations.filter((s) => s.kind === "station")[0].stopPoints.map((s) => s.trackId).sort()).toEqual(["track-1", "track-2"]);
      const missing = run("without-platform", false);
      expect(missing.state.stations.filter((s) => s.kind === "station")).toHaveLength(1);
      expect(missing.state.stations[0]).toMatchObject({ name: "Fixture", stopPoints: [], unresolvedReason: expect.any(String) });
      expect(missing.report.stations[0]).toMatchObject({ status: "unresolved", ranges: [] });
      expect(missing.report.stations[0].warnings).toContain("platform-geometry-missing");
    } finally {
      // mkdtempで作った専用ディレクトリだけを破棄する。
      if (path.dirname(dir) !== path.resolve(tmpdir()) || !path.basename(dir).startsWith("rails-osm-import-test-")) throw new Error("Unexpected temporary directory");
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);
});
