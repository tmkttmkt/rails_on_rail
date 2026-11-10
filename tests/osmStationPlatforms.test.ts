import { describe, expect, it } from "vitest";
import { matchStationPlatforms, type OsmPassengerTrack, type OsmPlatform } from "../src/simulation/osmStationPlatforms";
const operator = "A";
const target = { x: 100, y: 0 };
const platform: OsmPlatform = { id: "island", points: [{ x: 0, y: -5 }, { x: 220, y: -5 }, { x: 220, y: 5 }, { x: 0, y: 5 }, { x: 0, y: -5 }] };
function rail(id: string, y: number, owner = operator, service?: string): OsmPassengerTrack {
  const points = [{ x: -500, y }, { x: 1000, y }];
  return { id, points, sections: [{ points, operator: owner, service }] };
}
const match = (tracks: OsmPassengerTrack[], platforms = [platform]) => matchStationPlatforms(target, operator, tracks, platforms);
describe("OSM旅客ホームの局所対応", () => {
  it("疎な面ホームの両縁を取り、同じ側の余分な側線とホーム内部の通過線を除く", () => {
    const result = match([rail("upper", 7), rail("lower", -7), rail("siding", 11), rail("inside", 0)]);
    expect(result.matches.map((m) => m.trackId).sort()).toEqual(["lower", "upper"]);
    for (const span of result.matches) { expect(span.endM - span.startM).toBeCloseTo(220); expect(span.startM).toBeCloseTo(500); }
  });
  it("遠い別駅のホームで同じ長大線路を採用しない", () => {
    expect(match([rail("main", 7)], [{ ...platform, points: platform.points.map((p) => ({ x: p.x + 2000, y: p.y })) }]).matches).toEqual([]);
  });
  it("横断線と端点でだけ接近する線路をホーム線にしない", () => {
    const points = [{ x: 110, y: -100 }, { x: 110, y: 100 }];
    const cross = { id: "cross", points, sections: [{ points, operator }] };
    expect(match([cross]).matches).toEqual([]);
    const short = [{ x: 220, y: 7 }, { x: 225, y: 7 }];
    expect(match([{ id: "stub", points: short, sections: [{ points: short, operator }] }]).matches).toEqual([]);
    const longerStub = [{ x: 190, y: 7 }, { x: 225, y: 7 }];
    expect(match([{ id: "longer-stub", points: longerStub, sections: [{ points: longerStub, operator, service: "siding" }] }]).matches).toEqual([]);
  });
  it("ホームがなければ最寄り本線へも近傍全線へも代用しない", () => {
    const result = match([rail("main", 7)], []);
    expect(result.matches).toEqual([]); expect(result.warnings).toContain("platform-geometry-missing");
  });
  it("他社線・構内線・引込線を除き、sidingの旅客線路は残す", () => {
    expect(match([rail("foreign", 7, "B"), rail("yard", -7, "A", "yard")]).matches).toEqual([]);
    expect(match([rail("spur", 7, "A", "spur")]).matches).toEqual([]);
    expect(match([rail("platform-siding", 7, "A", "siding")]).matches.map((m) => m.trackId)).toEqual(["platform-siding"]);
  });
  it("最寄りの他社線や構内線を飛び越して奥の自社線を採用しない", () => {
    expect(match([rail("foreign", 7, "B"), rail("behind", 11)]).matches).toEqual([]);
    expect(match([rail("yard", 7, "A", "yard"), rail("behind", 11)]).matches).toEqual([]);
  });
  it("長い通し線路の遠隔事業者ではなくホーム地点の事業者を使う", () => {
    const track = rail("mixed", 7);
    track.sections = [{ points: [{ x: -500, y: 7 }, { x: -100, y: 7 }], operator: "A" }, { points: [{ x: -100, y: 7 }, { x: 1000, y: 7 }], operator: "B" }];
    expect(match([track]).matches).toEqual([]);
  });
  it("事業者欠損と等距離の候補を確定扱いしない", () => {
    expect(matchStationPlatforms(target, "", [rail("main", 7)], [platform]).warnings).toContain("station-operator-missing");
    const result = match([rail("a", 7), rail("b", 7.2)]);
    expect(result.matches).toEqual([]); expect(result.warnings).toContain("ambiguous-platform-edge");
  });
  it("線として描かれたホームでも両側の最寄りだけを選ぶ", () => {
    const line = { id: "line", points: [{ x: 0, y: 0 }, { x: 220, y: 0 }] };
    expect(match([rail("a", 2), rail("b", -2), rail("extra", 5)], [line]).matches.map((m) => m.trackId).sort()).toEqual(["a", "b"]);
  });
});
