import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/simulation/model";
import { createLine, createServiceSystem } from "../src/simulation/lineServiceSystem";
import { createRoute } from "../src/simulation/routeDomain";
import { createOperation } from "../src/simulation/operationSchedule";
import { createVehicleDuty } from "../src/simulation/vehicleDuty";
import {
  createInitialLineUiState,
  renderLineLeftPanel,
  renderLineRightPanel,
} from "../src/ui/linePanel";
import {
  createInitialRouteUiState,
  renderRouteLeftPanel,
  renderRouteRightPanel,
} from "../src/ui/routePanel";
import {
  createInitialScheduleUiState,
  renderScheduleLeftPanel,
  renderScheduleRightPanel,
} from "../src/ui/schedulePanel";
import {
  createInitialVehicleDutyUiState,
  renderVehicleDutyLeftPanel,
  renderVehicleDutyRightPanel,
} from "../src/ui/vehicleDutyPanel";

describe("Service Planning UI Panels (v11)", () => {
  function setupTestState() {
    let state = createInitialState();
    // Create Line and System
    const { state: s1, line } = createLine(state, {
      id: "line-tokaido",
      name: "東海道線",
      code: "JT",
      color: "#f97316",
    });
    const { state: s2, serviceSystem: sys } = createServiceSystem(s1, {
      id: "sys-acty",
      lineId: line.id,
      name: "快速アクティー",
      shortName: "アクティー",
    });
    state = s2;

    // Add track & stations
    state.tracks.push({
      id: "track-1",
      geometry: "straight",
      points: [{ x: 0, y: 0 }, { x: 1000, y: 0 }],
      resolvedPath: true,
      specification: { gaugeId: "gauge-1067", railProfileId: "rail-60kg", supportSystemId: "support-concrete", roadbedId: "roadbed-ballast" },
      engineering: { designSpeedKmh: 120, cantProfile: [], builtMinimumRadiusM: null },
    });
    state.stations.push(
      {
        id: "st-tokyo",
        name: "東京",
        position: { x: 100, y: 0 },
        stopPoints: [{ id: "sp-tokyo", trackId: "track-1", startDistanceM: 50, endDistanceM: 150, startPosition: { x: 50, y: 0 }, endPosition: { x: 150, y: 0 }, direction: "both" }],
      },
      {
        id: "st-shinagawa",
        name: "品川",
        position: { x: 800, y: 0 },
        stopPoints: [{ id: "sp-shinagawa", trackId: "track-1", startDistanceM: 750, endDistanceM: 850, startPosition: { x: 750, y: 0 }, endPosition: { x: 850, y: 0 }, direction: "both" }],
      }
    );

    // Create Route
    const { state: s3, route } = createRoute(state, {
      id: "route-down",
      name: "東海道本線 下り快速",
      directionName: "下り",
      stops: [
        { stationId: "st-tokyo", trackId: "track-1", commercialType: "stop", dwellSeconds: 45 },
        { stationId: "st-shinagawa", trackId: "track-1", commercialType: "stop", dwellSeconds: 30 },
      ],
      lineSections: [
        {
          fromStopSequence: 1,
          toStopSequence: 2,
          lineId: "line-tokaido",
          serviceSystemId: "sys-acty",
        },
      ],
    });
    state = s3;

    // Create Operation
    const { state: s4, operation } = createOperation(state, {
      id: "op-3001m",
      name: "快速 3001M",
      operationNumber: "3001M",
      routeId: route.id,
      calendar: { weekdays: [1, 2, 3, 4, 5] },
      stopTimes: [
        { routeStopId: route.stops[0].id, departureTime: "08:00:00", dayOffset: 0 },
        { routeStopId: route.stops[1].id, arrivalTime: "08:15:00", departureTime: "08:16:00", dayOffset: 0 },
      ],
    });
    state = s4;

    // Create Duty
    const { state: s5, vehicleDuty: duty } = createVehicleDuty(state, {
      id: "duty-01",
      name: "01運用",
      assignments: [
        { sequence: 1, operationId: operation.id, serviceDayOffset: 0 },
      ],
    });
    state = s5;

    return { state, line, sys, route, operation, duty };
  }

  it("renders 路線・系統 panel with short labels and color preview", () => {
    const { state, line } = setupTestState();
    const uiState = createInitialLineUiState();

    const leftHtml = renderLineLeftPanel(state, uiState);
    expect(leftHtml).toContain("路線一覧");
    expect(leftHtml).toContain("＋ 路線追加");
    expect(leftHtml).toContain("東海道線");
    expect(leftHtml).toContain("アクティー");

    uiState.selectedLineId = line.id;
    const rightHtml = renderLineRightPanel(state, uiState);
    expect(rightHtml).toContain("所属系統");
    expect(rightHtml).toContain("快速アクティー");
    expect(rightHtml).toContain("＋ 系統追加");
  });

  it("renders 経路 panel with stops table and preflight check", () => {
    const { state, route } = setupTestState();
    const uiState = createInitialRouteUiState();

    const leftHtml = renderRouteLeftPanel(state, uiState);
    expect(leftHtml).toContain("経路一覧");
    expect(leftHtml).toContain("＋ 経路追加");
    expect(leftHtml).toContain("東海道本線 下り快速");
    expect(leftHtml).toContain("下り");

    uiState.selectedRouteId = route.id;
    const rightHtml = renderRouteRightPanel(state, uiState);
    expect(rightHtml).toContain("停車地点一覧");
    expect(rightHtml).toContain("東京");
    expect(rightHtml).toContain("品川");
    expect(rightHtml).toContain("復路複製");
  });

  it("renders 運行 panel with multi-day time table and weekdays", () => {
    const { state, operation } = setupTestState();
    const uiState = createInitialScheduleUiState();

    const leftHtml = renderScheduleLeftPanel(state, uiState);
    expect(leftHtml).toContain("運行一覧");
    expect(leftHtml).toContain("＋ 運行追加");
    expect(leftHtml).toContain("快速 3001M");

    uiState.selectedOperationId = operation.id;
    const rightHtml = renderScheduleRightPanel(state, uiState);
    expect(rightHtml).toContain("各駅時刻表");
    expect(rightHtml).toContain("08:00:00");
    expect(rightHtml).toContain("08:15:00");
    expect(rightHtml).toContain("運行複製");
  });

  it("renders 運用 panel with duty assignments and daily replacement controller", () => {
    const { state, duty } = setupTestState();
    const uiState = createInitialVehicleDutyUiState();

    const leftHtml = renderVehicleDutyLeftPanel(state, uiState);
    expect(leftHtml).toContain("運用一覧");
    expect(leftHtml).toContain("＋ 運用追加");
    expect(leftHtml).toContain("01運用");

    uiState.selectedDutyId = duty.id;
    const rightHtml = renderVehicleDutyRightPanel(state, uiState);
    expect(rightHtml).toContain("日別運用実施・編成差し替え");
    expect(rightHtml).toContain("運用割当一覧");
    expect(rightHtml).toContain("快速 3001M");
  });
});
