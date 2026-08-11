export type KeyAction =
  | "track.finish"
  | "track.undoPoint"
  | "track.cancel"
  | "selection.delete"
  | "connection.shiftLeft"
  | "connection.shiftRight"
  | "connection.center"
  | "connection.nextCandidate"
  | "view.panUp"
  | "view.panDown"
  | "view.panLeft"
  | "view.panRight"
  | "view.zoomIn"
  | "view.zoomOut"
  | "view.home"
  | "view.rotateLeft"
  | "view.rotateRight"
  | "mode.map"
  | "mode.construction"
  | "mode.operation"
  | "tool.track"
  | "tool.station"
  | "track.toggleGeometry"
  | "track.countDown"
  | "track.countUp"
  | "app.save"
  | "simulation.togglePause";

export interface KeyBinding {
  action: KeyAction;
  keys: string[];
  display: string;
  context: "global" | "view" | "construction" | "track-building" | "selection" | "connection-adjustment";
  implemented: boolean;
  modifiers?: string[];
}

export const KEY_BINDINGS: Record<KeyAction, KeyBinding> = {
  "track.finish": { action: "track.finish", keys: ["Enter"], display: "Enter", context: "track-building", implemented: true },
  "track.undoPoint": { action: "track.undoPoint", keys: ["Backspace"], display: "Backspace", context: "track-building", implemented: true },
  "track.cancel": { action: "track.cancel", keys: ["Escape"], display: "Esc", context: "track-building", implemented: true },
  "selection.delete": { action: "selection.delete", keys: ["Delete"], display: "Del", context: "selection", implemented: true },
  "connection.shiftLeft": { action: "connection.shiftLeft", keys: ["n"], display: "N", context: "connection-adjustment", implemented: true },
  "connection.shiftRight": { action: "connection.shiftRight", keys: ["m"], display: "M", context: "connection-adjustment", implemented: true },
  "connection.center": { action: "connection.center", keys: ["0"], display: "0", context: "connection-adjustment", implemented: true },
  "connection.nextCandidate": { action: "connection.nextCandidate", keys: ["Tab"], display: "Tab", context: "connection-adjustment", implemented: true },
  "view.panUp": { action: "view.panUp", keys: ["w", "ArrowUp"], display: "W/↑", context: "view", implemented: true },
  "view.panDown": { action: "view.panDown", keys: ["s", "ArrowDown"], display: "S/↓", context: "view", implemented: true },
  "view.panLeft": { action: "view.panLeft", keys: ["a", "ArrowLeft"], display: "A/←", context: "view", implemented: true },
  "view.panRight": { action: "view.panRight", keys: ["d", "ArrowRight"], display: "D/→", context: "view", implemented: true },
  "view.zoomIn": { action: "view.zoomIn", keys: ["+", "="], display: "+", context: "view", implemented: true },
  "view.zoomOut": { action: "view.zoomOut", keys: ["-"], display: "-", context: "view", implemented: true },
  "view.home": { action: "view.home", keys: ["h"], display: "H", context: "view", implemented: true },
  "view.rotateLeft": { action: "view.rotateLeft", keys: ["q"], display: "Q", context: "view", implemented: true },
  "view.rotateRight": { action: "view.rotateRight", keys: ["e"], display: "E", context: "view", implemented: true },
  "mode.map": { action: "mode.map", keys: ["F1"], display: "F1", context: "global", implemented: true },
  "mode.construction": { action: "mode.construction", keys: ["F2"], display: "F2", context: "global", implemented: true },
  "mode.operation": { action: "mode.operation", keys: ["F4"], display: "F4", context: "global", implemented: true },
  "tool.track": { action: "tool.track", keys: ["t"], display: "T", context: "construction", implemented: true },
  "tool.station": { action: "tool.station", keys: ["b"], display: "B", context: "construction", implemented: true },
  "track.toggleGeometry": { action: "track.toggleGeometry", keys: ["Tab"], display: "Tab", context: "track-building", implemented: true },
  "track.countDown": { action: "track.countDown", keys: ["["], display: "[", context: "track-building", implemented: true },
  "track.countUp": { action: "track.countUp", keys: ["]"], display: "]", context: "track-building", implemented: true },
  "app.save": { action: "app.save", keys: ["s"], modifiers: ["ctrl"], display: "Ctrl+S", context: "global", implemented: true },
  "simulation.togglePause": { action: "simulation.togglePause", keys: [" "], display: "Space", context: "global", implemented: true },
};

export function matchesKey(action: KeyAction, event: Pick<KeyboardEvent, "key"> & { ctrlKey?: boolean }): boolean {
  const binding = KEY_BINDINGS[action];
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (!binding.keys.includes(key)) return false;
  const ctrlKey = event.ctrlKey ?? false;
  if (binding.modifiers?.includes("ctrl") && !ctrlKey) return false;
  if (!binding.modifiers?.includes("ctrl") && ctrlKey) return false;
  return true;
}

export function shortcutLabel(action: KeyAction): string {
  return KEY_BINDINGS[action].display;
}

export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const element = target as { tagName?: unknown; isContentEditable?: unknown };
  const tagName = typeof element.tagName === "string" ? element.tagName.toUpperCase() : "";
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT" || element.isContentEditable === true;
}
