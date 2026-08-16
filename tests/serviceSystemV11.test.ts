import { describe, expect, it } from "vitest";
import {
  createLine,
  createServiceSystem,
  deleteLine,
  deleteServiceSystem,
  getServiceSystemEffectiveColor,
  updateServiceSystem,
} from "../src/simulation/lineServiceSystem";
import { createInitialState } from "../src/simulation/model";

describe("P1: 路線・系統 (Line & ServiceSystem) 単体テスト", () => {
  it("UT-SYS-01: 系統は親路線必須、名称・略称・色・説明・表示順を正しく保存・更新できる", () => {
    const state: any = createInitialState();
    state.lines = {};
    state.serviceSystems = {};
    state.nextLineId = 1;
    state.nextServiceSystemId = 1;

    // Line creation
    const { line } = createLine(state, {
      name: "東海道本線",
      code: "JT",
      color: "#E65A00",
      displayOrder: 1,
    });
    expect(line.id).toBe("line-1");
    expect(line.name).toBe("東海道本線");
    expect(line.color).toBe("#E65A00");

    // ServiceSystem without parent line fails
    expect(() =>
      createServiceSystem(state, {
        lineId: "line-nonexistent",
        name: "快速アクティー",
      })
    ).toThrow("ERR_LINE_NOT_FOUND");

    // ServiceSystem creation with parent line
    const { serviceSystem: sys1 } = createServiceSystem(state, {
      lineId: line.id,
      name: "快速アクティー",
      shortName: "アクティー",
      color: "#FF8800",
      description: "東海道線の快速系統",
      displayOrder: 1,
    });
    expect(sys1.id).toBe("sys-1");
    expect(sys1.lineId).toBe(line.id);
    expect(sys1.name).toBe("快速アクティー");
    expect(sys1.shortName).toBe("アクティー");
    expect(sys1.color).toBe("#FF8800");
    expect(sys1.description).toBe("東海道線の快速系統");
    expect(sys1.displayOrder).toBe(1);

    // Update ServiceSystem
    const { serviceSystem: updatedSys } = updateServiceSystem(state, {
      id: sys1.id,
      shortName: "ACTY",
      displayOrder: 2,
    });
    expect(updatedSys.shortName).toBe("ACTY");
    expect(updatedSys.displayOrder).toBe(2);
  });

  it("UT-SYS-02: 色未指定時の系統表示色は親路線色から導出される", () => {
    const state: any = createInitialState();
    state.lines = {};
    state.serviceSystems = {};

    const { line } = createLine(state, {
      name: "中央本線",
      code: "JC",
      color: "#F15A22",
    });

    const { serviceSystem: sysDefaultColor } = createServiceSystem(state, {
      lineId: line.id,
      name: "中央特快",
    });
    expect(sysDefaultColor.color).toBeUndefined();
    expect(getServiceSystemEffectiveColor(sysDefaultColor, line)).toBe("#F15A22");

    const { serviceSystem: sysCustomColor } = createServiceSystem(state, {
      lineId: line.id,
      name: "ホリデー快速",
      color: "#00AA55",
    });
    expect(sysCustomColor.color).toBe("#00AA55");
    expect(getServiceSystemEffectiveColor(sysCustomColor, line)).toBe("#00AA55");
  });

  it("路線削除時に所属系統が存在する場合は削除を拒否する", () => {
    const state: any = createInitialState();
    state.lines = {};
    state.serviceSystems = {};

    const { line } = createLine(state, {
      name: "山手線",
      color: "#80C342",
    });

    createServiceSystem(state, {
      lineId: line.id,
      name: "本線内回り",
    });

    expect(() => deleteLine(state, line.id)).toThrow("ERR_LINE_HAS_CHILD_SYSTEMS");

    deleteServiceSystem(state, "sys-1");
    expect(state.serviceSystems["sys-1"]).toBeUndefined();

    deleteLine(state, line.id);
    expect(state.lines[line.id]).toBeUndefined();
  });
});
