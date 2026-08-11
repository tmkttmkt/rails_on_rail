import { describe, expect, it } from "vitest";
import { isTextEntryTarget, matchesKey, shortcutLabel } from "../src/ui/keybindings";

describe("キーボード割当", () => {
  it("大文字小文字を区別せず候補キーへ一致する", () => {
    expect(matchesKey("connection.shiftLeft", { key: "N" })).toBe(true);
    expect(matchesKey("connection.shiftLeft", { key: "," })).toBe(false);
    expect(matchesKey("connection.shiftLeft", { key: "m" })).toBe(false);
  });

  it("画面表示用のキー名を取得する", () => {
    expect(shortcutLabel("track.finish")).toBe("Enter");
    expect(shortcutLabel("connection.shiftRight")).toBe("M");
    expect(matchesKey("simulation.togglePause", { key: " " })).toBe(true);
  });

  it("入力要素と編集可能要素を判定する", () => {
    expect(isTextEntryTarget({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    expect(isTextEntryTarget({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isTextEntryTarget({ tagName: "CANVAS" } as unknown as EventTarget)).toBe(false);
  });
});
