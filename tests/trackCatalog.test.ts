import { describe, expect, it } from "vitest";
import { trackCatalog } from "../src/data/trackCatalog";
import { executeCommand } from "../src/simulation/commands";
import { createInitialState } from "../src/simulation/model";

describe("軌道構成カタログ", () => {
  it("YAMLからレール・支持方式・路盤を読み込む", () => {
    expect(trackCatalog.railProfiles).toHaveLength(67);
    expect(trackCatalog.supportSystems).toHaveLength(10);
    expect(trackCatalog.roadbeds).toHaveLength(5);
  });

  it("互換性のないレールと支持方式を拒否する", () => {
    expect(() => trackCatalog.validateSpecification({
      gaugeId: "gauge-1067mm",
      railProfileId: "jis-50n",
      supportSystemId: "wooden-wagonway-support",
      roadbedId: "standard-drained-roadbed",
    })).toThrow("JIS 50Nは木製ワゴンウェイ支持方式に対応していません");
  });

  it("レールに対応する支持方式だけを取得する", () => {
    expect(trackCatalog.compatibleSupportSystems("barlow-95lb-1849").map((item) => item.id))
      .toEqual(["direct-ballast-barlow-support"]);
  });

  it("敷設した線路へ軌道構成を保存する", () => {
    const specification = {
      gaugeId: "gauge-1067mm",
      railProfileId: "decauville-7-5kg-c1880",
      supportSystemId: "portable-track-panel",
      roadbedId: "minimal-earthwork",
    };
    const state = executeCommand(createInitialState(), {
      type: "track.create",
      geometry: "straight",
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      specification,
    }).state;
    expect(state.tracks[0].specification).toEqual(specification);
  });
});
