import { parse } from "yaml";
import raw from "../../data/yard/prototype.yaml?raw";

interface YardConfig { formatVersion: number; defaultSpeedKph: number; maximumSpeedKph: number; junctionClearanceM: number; wagonLengthM: number; locomotiveLengthM: number; wagonsPerDestination: number; leadClearanceM: number; branchClearanceM: number }
export const yardConfig = parse(raw) as YardConfig;
if (yardConfig.formatVersion !== 1 || Object.entries(yardConfig).some(([, v]) => !Number.isFinite(v) || v <= 0) || !Number.isInteger(yardConfig.wagonsPerDestination) || yardConfig.defaultSpeedKph > yardConfig.maximumSpeedKph) throw new Error("操車試験設定が不正");
