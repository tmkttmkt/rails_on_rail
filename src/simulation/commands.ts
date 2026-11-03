import { SIMULATION_SPEEDS, createInitialState, getFormationOperationalStatus, type MapState, type Point, type SimulationSpeed, type Track, type TrackGeometry, type TrackGroup, type TrackJunctionPortLocation } from "./model";
import { trackCatalog, type TrackSpecification } from "../data/trackCatalog";
import { vehicleCatalog } from "../data/vehicleCatalog";
import { formationTemplateCatalog } from "../data/formationTemplateCatalog";
import { analyzeLine, closestPointOnSegment, createParallelLines, getTrackPortTangent, getTrackTangentAtPosition, isTangentContinuous, polylineOverlapLength, recommendedCantMm, sampleTrack } from "./geometry";
import { advanceOperatingTrains, createOperationRoute } from "./operations";
import { assertAllAdjacentConnections, assertMechanicalConnection, formationWarnings, getFormationLengthM, type Formation, type Orientation, type Placement, type VehicleUnit } from "./fleet";
import { assertStationCanBeDeleted, assertTrackCanBeDeletedOrShortened, assertServicePatternCanBeDeleted } from "./guards";
import { buildOperationRoute } from "./pathfinding";
import { cancelOperationExecution, reserveOperationExecution, tickOperationExecutions } from "./trainRun";
import {
  createLine,
  updateLine,
  deleteLine,
  createServiceSystem,
  updateServiceSystem,
  deleteServiceSystem,
} from "./lineServiceSystem";
import {
  createRoute,
  updateRoute,
  deleteRoute,
  duplicateReverseRoute,
} from "./routeDomain";
import {
  createOperation,
  updateOperation,
  deleteOperation,
  duplicateOperation,
  assignOperationClassification,
  unassignOperationClassification,
} from "./operationSchedule";
import {
  createVehicleDuty,
  updateVehicleDuty,
  deleteVehicleDuty,
  assignDutyFormation,
  createVehicleDutyExecution,
  replaceDutyExecutionFormation,
  cancelDutyExecutionOperation,
} from "./vehicleDuty";
import type { ServiceDomainCommand } from "./serviceCommands";

export type MapCommand =
  | { type: "track.create"; geometry: TrackGeometry; points: Point[]; trackCount?: number; trackSpacing?: number; specification?: TrackSpecification; designSpeedKmh?: number; connectionAlignmentIndex?: number; endConnectionAlignmentIndex?: number; startTangent?: Point; endTangent?: Point; startConnectionTrackId?: string; endConnectionTrackId?: string }
  | { type: "track.delete"; trackId: string }
  | { type: "trackGroup.create"; trackIds: string[]; name?: string }
  | { type: "trackGroup.addTrack"; groupId: string; trackId: string }
  | { type: "trackGroup.removeTrack"; groupId: string; trackId: string }
  | { type: "trackGroup.dissolve"; groupId: string }
  | { type: "station.createRange"; name: string; trackId: string; startPosition: Point; endPosition: Point; includeTrackGroup?: boolean }
  | { type: "station.rename"; stationId: string; name: string }
  | { type: "station.extend"; stationId: string; trackId: string; position: Point }
  | { type: "station.merge"; stationIds: string[] }
  | { type: "station.delete"; stationId: string }
  | { type: "route.create"; name: string; stationIds: string[] }
  | { type: "train.dispatch"; routeId: string; formationId: string; name: string; speedKph?: number; dwellSeconds?: number }
  | { type: "fleet.vehicle.acquire"; designId: string; operatorNumber?: string }
  | { type: "fleet.formation-template.acquire"; templateId: string; name?: string }
  | { type: "fleet.formation.create"; name: string }
  | { type: "fleet.formation.rename"; formationId: string; name: string }
  | { type: "fleet.formation.delete"; formationId: string }
  | { type: "fleet.formation.vehicle.add"; formationId: string; vehicleId: string; orientation: Orientation; placement?: Placement }
  | { type: "fleet.formation.vehicle.remove"; formationId: string; vehicleId: string }
  | { type: "fleet.formation.vehicle.move"; formationId: string; vehicleId: string; targetIndex: number }
  | { type: "fleet.formation.vehicle.reverse"; formationId: string; vehicleId: string }
  | { type: "fleet.formation.place"; formationId: string; stationId: string; trackId: string; distanceM: number; orientation?: Orientation }
  | { type: "fleet.formation.unplace"; formationId: string }
  | { type: "fleet.dispatch.reserve"; formationId: string; routeId: string; departureTimeMs: number; dwellSeconds?: number; requestedSpeedKph?: number }
  | { type: "fleet.dispatch.cancel"; reservationId: string }
  | ServiceDomainCommand
  | { type: "line.addServicePattern"; payload: any }
  | { type: "line.removeServicePattern"; payload: any }
  | { type: "servicePattern.create"; payload: any }
  | { type: "servicePattern.update"; payload: any }
  | { type: "servicePattern.delete"; payload: any }
  | { type: "servicePattern.addDirection"; payload: any }
  | { type: "servicePattern.updateDirection"; payload: any }
  | { type: "servicePattern.deleteDirection"; payload: any }
  | { type: "operationRoute.create"; payload: any }
  | { type: "operationRoute.delete"; payload: any }
  | { type: "trainRun.create"; payload: any }
  | { type: "trainRun.cancel"; payload: any }
  | { type: "simulation.tick"; elapsedSeconds: number }
  | { type: "simulation.setPaused"; paused: boolean }
  | { type: "simulation.setSpeed"; speedMultiplier: SimulationSpeed }
  | { type: "map.clear" };

export interface CommandResult {
  state: MapState;
  message: string;
}

function formatTimeSec(s: number): string {
  const sec = ((s % 86400) + 86400) % 86400;
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const second = String(sec % 60).padStart(2, "0");
  return `${h}:${m}:${second}`;
}

function makeDefaultStopTimes(route: any) {
  return (route.stops || []).map((st: any, idx: number) => {
    const isFirst = idx === 0;
    const isLast = idx === (route.stops.length - 1);
    const baseSec = 28800 + idx * 180;
    const arrSec = isFirst ? undefined : baseSec - 30;
    const depSec = isLast ? undefined : baseSec;
    return {
      routeStopId: st.id,
      arrivalTime: arrSec !== undefined ? formatTimeSec(arrSec) : undefined,
      departureTime: depSec !== undefined ? formatTimeSec(depSec) : undefined,
      dayOffset: 0,
    };
  });
}

export function executeCommand(state: MapState, command: MapCommand): CommandResult {
  const next = structuredClone(state);

  switch (command.type) {
    case "track.create":
      return createTracks(next, command);
    case "track.delete": {
      const track = next.tracks.find((t) => t.id === command.trackId);
      if (!track) throw new Error("線路が存在しません");
      const placed = next.vehiclePlacements.find((p) => p.trackId === command.trackId);
      if (placed) {
        const formation = next.fleet.formations.find((f) => f.id === placed.formationId);
        throw new Error(`配置されている編成（${formation?.name ?? placed.formationId}）があるため線路${command.trackId}を撤去できません`);
      }
      assertTrackCanBeDeletedOrShortened(next, command.trackId);
      const index = next.tracks.findIndex((item) => item.id === command.trackId);
      next.tracks.splice(index, 1);
      next.junctions = next.junctions.flatMap((junction) => {
        const ports = junction.ports.filter((port) => port.trackId !== command.trackId);
        return ports.length >= 2 ? [{ ...junction, ports }] : [];
      });
      next.trackGroups = next.trackGroups.flatMap((group) => {
        const trackIds = group.trackIds.filter((id) => id !== command.trackId);
        return trackIds.length >= 2 ? [{ ...group, trackIds }] : [];
      });
      for (const track of next.tracks) {
        if (track.startConnection?.trackId === command.trackId || (track.startConnection?.junctionId && !next.junctions.some((item) => item.id === track.startConnection?.junctionId))) delete track.startConnection;
        if (track.endConnection?.trackId === command.trackId || (track.endConnection?.junctionId && !next.junctions.some((item) => item.id === track.endConnection?.junctionId))) delete track.endConnection;
      }
      next.stations = next.stations.flatMap((station) => {
        const stopPoints = station.stopPoints.filter((stopPoint) => stopPoint.trackId !== command.trackId);
        return stopPoints.length > 0 ? [{ ...station, stopPoints }] : [];
      });
      removeInvalidRoutesAndTrains(next);
      return { state: next, message: "線路を撤去しました" };
    }
    case "trackGroup.create": {
      const trackIds = uniqueTrackIds(command.trackIds);
      if (trackIds.length < 2) throw new Error("線路群には2本以上の線路が必要です");
      assertTracksExist(next, trackIds);
      assertTracksUngrouped(next, trackIds);
      const group = createGroup(next, trackIds, command.name);
      return { state: next, message: `「${group.name}」を作成しました` };
    }
    case "trackGroup.addTrack": {
      const group = requireGroup(next, command.groupId);
      assertTracksExist(next, [command.trackId]);
      assertTracksUngrouped(next, [command.trackId]);
      group.trackIds.push(command.trackId);
      group.trackIds = orderTrackIdsSpatially(next, group.trackIds);
      return { state: next, message: `${group.name}へ線路を追加しました` };
    }
    case "trackGroup.removeTrack": {
      const group = requireGroup(next, command.groupId);
      if (!group.trackIds.includes(command.trackId)) throw new Error("線路群に指定線路がありません");
      group.trackIds = group.trackIds.filter((id) => id !== command.trackId);
      if (group.trackIds.length < 2) {
        next.trackGroups = next.trackGroups.filter((item) => item.id !== group.id);
        return { state: next, message: `${group.name}から線路を外し、残り1本のため束を解体しました` };
      }
      return { state: next, message: `${group.name}から線路を外しました` };
    }
    case "trackGroup.dissolve": {
      const group = requireGroup(next, command.groupId);
      next.trackGroups = next.trackGroups.filter((item) => item.id !== group.id);
      return { state: next, message: `「${group.name}」を解体しました。線路は残っています` };
    }
    case "station.createRange": {
      const name = normalizeStationName(command.name);
      const track = requireTrack(next, command.trackId);
      const path = sampleTrack(track);
      const first = locateOnPath(path, command.startPosition);
      const second = locateOnPath(path, command.endPosition);
      const startDistanceM = Math.min(first.distanceM, second.distanceM);
      const endDistanceM = Math.max(first.distanceM, second.distanceM);
      if (endDistanceM - startDistanceM < 1) throw new Error("駅範囲は1 m以上にしてください");
      const midpoint = pointAtPathDistance(path, (startDistanceM + endDistanceM) / 2);
      const group = command.includeTrackGroup ? groupTrackIds(next, track.id) : [track.id];
      const number = next.nextStationId++;
      const stationId = `station-${number}`;
      const stopPoints = group.map((trackId, idx) => {
        const targetPath = sampleTrack(requireTrack(next, trackId));
        const targetStart = locateOnPath(targetPath, first.point);
        const targetEnd = locateOnPath(targetPath, second.point);
        const targetStartDistanceM = Math.min(targetStart.distanceM, targetEnd.distanceM);
        const targetEndDistanceM = Math.max(targetStart.distanceM, targetEnd.distanceM);
        if (targetEndDistanceM - targetStartDistanceM < 1) throw new Error(`${trackId}へ駅範囲を設定できません`);
        return {
          id: `${stationId}-sp-${idx + 1}`,
          trackId,
          startDistanceM: targetStartDistanceM,
          endDistanceM: targetEndDistanceM,
          startPosition: pointAtPathDistance(targetPath, targetStartDistanceM),
          endPosition: pointAtPathDistance(targetPath, targetEndDistanceM),
          direction: "both" as const,
        };
      });
      next.stations.push({ id: stationId, name, position: midpoint, stopPoints });
      return { state: next, message: `駅「${name}」を${stopPoints.length}本の線路へ設置しました` };
    }
    case "station.rename": {
      const station = next.stations.find((item) => item.id === command.stationId);
      if (!station) throw new Error("駅が存在しません");
      station.name = normalizeStationName(command.name);
      return { state: next, message: `駅名を「${station.name}」へ変更しました` };
    }
    case "station.extend": {
      const station = next.stations.find((item) => item.id === command.stationId);
      if (!station) throw new Error("駅が存在しません");
      const stopPoint = station.stopPoints.find((item) => item.trackId === command.trackId);
      if (!stopPoint) throw new Error("選択した駅はこの線路に停車地点を持ちません");
      const groupIds = new Set(groupTrackIds(next, command.trackId));
      for (const target of station.stopPoints.filter((item) => groupIds.has(item.trackId))) {
        const path = sampleTrack(requireTrack(next, target.trackId));
        const located = locateOnPath(path, command.position);
        target.startDistanceM = Math.min(target.startDistanceM, located.distanceM);
        target.endDistanceM = Math.max(target.endDistanceM, located.distanceM);
        target.startPosition = pointAtPathDistance(path, target.startDistanceM);
        target.endPosition = pointAtPathDistance(path, target.endDistanceM);
      }
      const centers = station.stopPoints.map((item) => pointAtPathDistance(sampleTrack(requireTrack(next, item.trackId)), (item.startDistanceM + item.endDistanceM) / 2));
      station.position = { x: centers.reduce((sum, point) => sum + point.x, 0) / centers.length, y: centers.reduce((sum, point) => sum + point.y, 0) / centers.length };
      return { state: next, message: `駅「${station.name}」を延長しました` };
    }
    case "station.merge": {
      const stationIds = [...new Set(command.stationIds)];
      if (stationIds.length < 2) throw new Error("統合する駅を2駅以上選択してください");
      const stations = stationIds.map((id) => {
        const station = next.stations.find((item) => item.id === id);
        if (!station) throw new Error("統合対象の駅が存在しません");
        return station;
      });
      const target = stations[0];
      for (const source of stations.slice(1)) {
        for (const incoming of source.stopPoints) {
          const existing = target.stopPoints.find((item) => item.trackId === incoming.trackId);
          if (!existing) {
            target.stopPoints.push(structuredClone(incoming));
            continue;
          }
          const path = sampleTrack(requireTrack(next, existing.trackId));
          existing.startDistanceM = Math.min(existing.startDistanceM, incoming.startDistanceM);
          existing.endDistanceM = Math.max(existing.endDistanceM, incoming.endDistanceM);
          existing.startPosition = pointAtPathDistance(path, existing.startDistanceM);
          existing.endPosition = pointAtPathDistance(path, existing.endDistanceM);
        }
      }
      const centers = target.stopPoints.map((stopPoint) => pointAtPathDistance(sampleTrack(requireTrack(next, stopPoint.trackId)), (stopPoint.startDistanceM + stopPoint.endDistanceM) / 2));
      target.position = { x: centers.reduce((sum, point) => sum + point.x, 0) / centers.length, y: centers.reduce((sum, point) => sum + point.y, 0) / centers.length };
      const removedIds = new Set(stationIds.slice(1));
      next.stations = next.stations.filter((station) => !removedIds.has(station.id));
      removeInvalidRoutesAndTrains(next);
      return { state: next, message: `${stationIds.length}駅を「${target.name}」へ統合しました` };
    }
    case "station.delete": {
      const station = next.stations.find((item) => item.id === command.stationId);
      if (!station) throw new Error("駅が存在しません");
      const placed = next.vehiclePlacements.find((p) => p.stationId === command.stationId);
      if (placed) {
        const formation = next.fleet.formations.find((f) => f.id === placed.formationId);
        throw new Error(`配置されている編成（${formation?.name ?? placed.formationId}）があるため駅「${station.name}」を撤去できません`);
      }
      assertStationCanBeDeleted(next, command.stationId);
      const index = next.stations.findIndex((item) => item.id === command.stationId);
      const [removedStation] = next.stations.splice(index, 1);
      removeInvalidRoutesAndTrains(next);
      return { state: next, message: `駅「${removedStation.name}」を撤去しました` };
    }

    // --- Line Commands ---
    case "line.create": {
      const { line } = createLine(next, command.payload);
      return { state: next, message: `路線「${line.name}」を作成しました` };
    }
    case "line.update": {
      const { line } = updateLine(next, command.payload);
      return { state: next, message: `路線「${line.name}」を更新しました` };
    }
    case "line.delete": {
      const lineName = next.lines[command.payload.id]?.name || command.payload.id;
      deleteLine(next, command.payload.id);
      return { state: next, message: `路線「${lineName}」を削除しました` };
    }

    // --- ServiceSystem Commands ---
    case "serviceSystem.create": {
      const { serviceSystem } = createServiceSystem(next, command.payload);
      return { state: next, message: `系統「${serviceSystem.name}」を作成しました` };
    }
    case "serviceSystem.update": {
      const { serviceSystem } = updateServiceSystem(next, command.payload);
      return { state: next, message: `系統「${serviceSystem.name}」を更新しました` };
    }
    case "serviceSystem.delete": {
      const sysName = next.serviceSystems[command.payload.id]?.name || command.payload.id;
      deleteServiceSystem(next, command.payload.id);
      return { state: next, message: `系統「${sysName}」を削除しました` };
    }

    // --- Route Commands ---
    case "route.create": {
      if ("stationIds" in command) {
        // Legacy route creation
        const route = createOperationRoute(next, command.name, command.stationIds);
        next.nextRouteId += 1;
        next.routes[route.id] = route;
        if (next.operationRoutes) next.operationRoutes[route.id] = route;
        return { state: next, message: `経路「${route.name}」を作成しました` };
      }
      const { route } = createRoute(next, command.payload);
      if (next.operationRoutes) next.operationRoutes[route.id] = route;
      return { state: next, message: `経路「${route.name}」を作成しました` };
    }
    case "route.update": {
      const { route, reviewRequiredOperationIds } = updateRoute(next, command.payload);
      if (next.operationRoutes) next.operationRoutes[route.id] = route;
      const reviewMsg = reviewRequiredOperationIds.length > 0 ? ` (${reviewRequiredOperationIds.length}件の運行が要確認)` : "";
      return { state: next, message: `経路「${route.name}」を更新しました${reviewMsg}` };
    }
    case "route.delete": {
      const routeName = next.routes[command.payload.id]?.name || command.payload.id;
      deleteRoute(next, command.payload.id);
      if (next.operationRoutes) delete next.operationRoutes[command.payload.id];
      return { state: next, message: `経路「${routeName}」を削除しました` };
    }
    case "route.duplicateReverse": {
      const { route } = duplicateReverseRoute(next, command.payload);
      if (next.operationRoutes) next.operationRoutes[route.id] = route;
      return { state: next, message: `復路経路「${route.name}」を生成しました` };
    }

    // --- Operation Commands ---
    case "operation.create": {
      const { operation } = createOperation(next, command.payload);
      return { state: next, message: `運行「${operation.name}」を作成しました` };
    }
    case "operation.update": {
      const { operation } = updateOperation(next, command.payload);
      return { state: next, message: `運行「${operation.name}」を更新しました` };
    }
    case "operation.assignClassification": {
      const { operation } = assignOperationClassification(next, command.payload);
      return { state: next, message: `運行「${operation.name}」の路線・系統所属を設定しました` };
    }
    case "operation.unassignClassification": {
      const { operation } = unassignOperationClassification(next, command.payload);
      return { state: next, message: `運行「${operation.name}」の路線所属を解除しました` };
    }
    case "operation.delete": {
      const opName = next.operations[command.payload.id]?.name || command.payload.id;
      deleteOperation(next, command.payload.id);
      return { state: next, message: `運行「${opName}」を削除しました` };
    }
    case "operation.duplicate": {
      const { operation } = duplicateOperation(next, command.payload);
      return { state: next, message: `運行「${operation.name}」を複製しました` };
    }

    // --- VehicleDuty Commands ---
    case "vehicleDuty.create": {
      const { vehicleDuty } = createVehicleDuty(next, command.payload);
      return { state: next, message: `運用「${vehicleDuty.name}」を作成しました` };
    }
    case "vehicleDuty.update": {
      const { vehicleDuty } = updateVehicleDuty(next, command.payload);
      return { state: next, message: `運用「${vehicleDuty.name}」を更新しました` };
    }
    case "vehicleDuty.delete": {
      const dutyName = next.vehicleDuties[command.payload.id]?.name || command.payload.id;
      deleteVehicleDuty(next, command.payload.id);
      return { state: next, message: `運用「${dutyName}」を削除しました` };
    }
    case "vehicleDuty.assignFormation": {
      const { vehicleDuty } = assignDutyFormation(next, command.payload.dutyId, command.payload.formationId);
      return { state: next, message: `運用「${vehicleDuty.name}」に編成を割り当てました` };
    }
    case "vehicleDuty.unassignFormation": {
      const { vehicleDuty } = assignDutyFormation(next, command.payload.dutyId, undefined);
      return { state: next, message: `運用「${vehicleDuty.name}」の編成割当を解除しました` };
    }
    case "vehicleDutyExecution.create": {
      const { execution } = createVehicleDutyExecution(next, command.payload);
      return { state: next, message: `日付 ${execution.serviceDate} の運用実施情報を設定しました` };
    }
    case "vehicleDutyExecution.replaceFormation": {
      const { execution } = replaceDutyExecutionFormation(
        next,
        command.payload.vehicleDutyId,
        command.payload.serviceDate,
        command.payload.formationId
      );
      return { state: next, message: `日付 ${execution.serviceDate} の充当編成を差し替えました` };
    }
    case "vehicleDutyExecution.cancelOperation": {
      const { execution } = cancelDutyExecutionOperation(
        next,
        command.payload.vehicleDutyId,
        command.payload.serviceDate,
        command.payload.operationId
      );
      return { state: next, message: `日付 ${execution.serviceDate} の特定運行を運休に設定しました` };
    }

    // --- Execution Commands ---
    case "execution.reserve": {
      const { execution, operatingTrain } = reserveOperationExecution(next, command.payload);
      if (next.trainRuns) next.trainRuns[execution.id] = execution;
      const msg = operatingTrain
        ? `列車「${operatingTrain.name}」を即時発車しました`
        : `運行実行「${execution.id}」の発車予約を作成しました`;
      return { state: next, message: msg };
    }
    case "execution.cancel": {
      const exec = cancelOperationExecution(next, command.payload.executionId);
      if (next.trainRuns) next.trainRuns[command.payload.executionId] = exec;
      return { state: next, message: `運行実行「${exec.id}」をキャンセルしました` };
    }
    case "execution.dispatch": {
      const { execution, operatingTrain } = reserveOperationExecution(next, {
        ...command.payload,
        scheduledDepartureTimeMs: next.clock.currentTimeMs,
      });
      if (next.trainRuns) next.trainRuns[execution.id] = execution;
      const msg = operatingTrain
        ? `列車「${operatingTrain.name}」を発車しました`
        : `運行実行「${execution.id}」を発車しました`;
      return { state: next, message: msg };
    }

    // --- Legacy / compatibility wrappers ---
    case "train.dispatch": {
      const formation = next.fleet.formations.find((f) => f.id === command.formationId);
      if (!formation) throw new Error("指定された編成が存在しません (ERR_FORMATION_NOT_FOUND)");
      if (formation.vehicles.length === 0) throw new Error("空の編成は発車できません (編成に車両が含まれていません)");
      const placement = next.vehiclePlacements.find((p) => p.formationId === command.formationId);
      if (!placement) throw new Error("編成が駅に配置されていません");

      let op = Object.values(next.operations).find((o) => o.routeId === command.routeId);
      if (!op) {
        const route = next.routes[command.routeId] || next.operationRoutes?.[command.routeId];
        if (route) {
          const { operation } = createOperation(next, {
            id: `op-auto-${command.routeId}`,
            name: `運行 ${route.name}`,
            routeId: route.id,
            calendar: { weekdays: [0, 1, 2, 3, 4, 5, 6] },
            stopTimes: makeDefaultStopTimes(route),
          });
          op = operation;
        }
      }
      if (!op) throw new Error("指定された運行経路が存在しません");
      const { execution } = reserveOperationExecution(next, {
        operationId: op.id,
        formationId: command.formationId,
        scheduledDepartureTimeMs: next.clock.currentTimeMs,
        requestedSpeedKph: command.speedKph ?? 80,
        dwellSeconds: command.dwellSeconds,
      });
      if (next.trainRuns) next.trainRuns[execution.id] = execution;
      return {
        state: next,
        message: `列車「${command.name || formation?.name || command.formationId}」を発車しました`,
      };
    }
    case "trainRun.create": {
      let op = Object.values(next.operations).find((o) => o.routeId === command.payload.routeId);
      if (!op) {
        const route = next.routes[command.payload.routeId] || next.operationRoutes?.[command.payload.routeId];
        if (route) {
          const { operation } = createOperation(next, {
            id: `op-auto-${command.payload.routeId}`,
            name: `運行 ${route.name}`,
            routeId: route.id,
            calendar: { weekdays: [0, 1, 2, 3, 4, 5, 6] },
            stopTimes: makeDefaultStopTimes(route),
          });
          op = operation;
        }
      }
      const { execution, operatingTrain } = reserveOperationExecution(next, {
        id: command.payload.id,
        operationId: op?.id || `op-auto-${command.payload.routeId}`,
        formationId: command.payload.formationId,
        scheduledDepartureTimeMs: command.payload.scheduledDepartureTimeMs,
        requestedSpeedKph: command.payload.requestedSpeedKph,
      });
      if (command.payload.servicePatternId) {
        (execution as any).servicePatternId = command.payload.servicePatternId;
      }
      if (next.trainRuns) next.trainRuns[execution.id] = execution;
      const msg = operatingTrain
        ? `列車「${operatingTrain.name}」を即時発車しました`
        : `列車運行「${execution.id}」の発車予約を作成しました`;
      return { state: next, message: msg };
    }
    case "trainRun.cancel": {
      const exec = cancelOperationExecution(next, command.payload.runId);
      if (next.trainRuns) next.trainRuns[command.payload.runId] = exec;
      return { state: next, message: `列車運行「${exec.id}」をキャンセルしました` };
    }
    case "fleet.dispatch.reserve": {
      let op = Object.values(next.operations).find((o) => o.routeId === command.routeId);
      if (!op) {
        const route = next.routes[command.routeId] || next.operationRoutes?.[command.routeId];
        if (route) {
          const { operation } = createOperation(next, {
            id: `op-auto-${command.routeId}`,
            name: `運行 ${route.name}`,
            routeId: route.id,
            calendar: { weekdays: [0, 1, 2, 3, 4, 5, 6] },
            stopTimes: makeDefaultStopTimes(route),
          });
          op = operation;
        }
      }
      const { execution, operatingTrain } = reserveOperationExecution(next, {
        operationId: op?.id || `op-auto-${command.routeId}`,
        formationId: command.formationId,
        scheduledDepartureTimeMs: command.departureTimeMs,
        requestedSpeedKph: command.requestedSpeedKph,
        dwellSeconds: command.dwellSeconds,
      });
      if (next.trainRuns) next.trainRuns[execution.id] = execution;
      const msg = operatingTrain
        ? `列車「${operatingTrain.name}」を即時発車しました`
        : `発車予約を作成しました (予約ID: ${execution.id})`;
      return { state: next, message: msg };
    }
    case "fleet.dispatch.cancel": {
      const exec = cancelOperationExecution(next, command.reservationId);
      if (next.trainRuns) next.trainRuns[command.reservationId] = exec;
      return { state: next, message: `予約「${exec.id}」をキャンセルしました` };
    }
    case "operationRoute.create": {
      const route = buildOperationRoute(next, command.payload);
      next.routes[route.id] = route;
      if (next.operationRoutes) next.operationRoutes[route.id] = route;
      return { state: next, message: `経路「${route.name}」を作成しました` };
    }
    case "operationRoute.delete": {
      deleteRoute(next, command.payload.id);
      if (next.operationRoutes) delete next.operationRoutes[command.payload.id];
      return { state: next, message: `経路を削除しました` };
    }
    case "servicePattern.create": {
      const p = command.payload;
      if (!next.servicePatterns) next.servicePatterns = {};
      const id = p.id || `sp-${next.nextServicePatternId || 1}`;
      next.servicePatterns[id] = {
        id,
        name: p.name,
        type: p.type || "local",
        lineIds: p.lineIds || [],
        directions: [],
      };
      return { state: next, message: `運行系統「${p.name}」を作成しました` };
    }
    case "servicePattern.update": {
      const p = command.payload;
      if (next.servicePatterns?.[p.id]) {
        Object.assign(next.servicePatterns[p.id], p);
      }
      return { state: next, message: "運行系統を更新しました" };
    }
    case "servicePattern.delete": {
      assertServicePatternCanBeDeleted(next, command.payload.id);
      if (next.servicePatterns) delete next.servicePatterns[command.payload.id];
      return { state: next, message: "運行系統を削除しました" };
    }
    case "servicePattern.addDirection": {
      const { servicePatternId, directionId, directionName, stopPatternStops } = command.payload;
      const sp = next.servicePatterns?.[servicePatternId];
      const dirId = directionId || `dir-${directionName}`;
      const spatId = `spat-${dirId}`;
      if (sp) {
        sp.directions.push({
          id: dirId,
          name: directionName,
          stopPatternId: spatId,
          routeIds: [],
        });
      }
      if (!next.stopPatterns) next.stopPatterns = {};
      next.stopPatterns[spatId] = {
        id: spatId,
        servicePatternId,
        directionId: dirId,
        stops: (stopPatternStops || []).map((s: any) => ({
          stationId: s.stationId,
          commercialType: s.commercialType || "stop",
          defaultDwellSeconds: s.defaultDwellSeconds ?? s.dwellSeconds ?? 30,
        })),
      };
      return { state: next, message: "運行方向を追加しました" };
    }
    case "servicePattern.updateDirection": {
      const { servicePatternId, directionId, directionName, stopPatternStops } = command.payload;
      const sp = next.servicePatterns?.[servicePatternId];
      if (sp) {
        const dir = sp.directions.find((d: any) => d.id === directionId);
        if (dir) {
          if (directionName) dir.name = directionName;
          const spat = next.stopPatterns?.[dir.stopPatternId];
          if (spat && stopPatternStops) {
            spat.stops = (stopPatternStops || []).map((s: any) => ({
              stationId: s.stationId,
              commercialType: s.commercialType || "stop",
              defaultDwellSeconds: s.defaultDwellSeconds ?? s.dwellSeconds ?? 30,
            }));
          }
        }
      }
      return { state: next, message: "運行方向を更新しました" };
    }
    case "servicePattern.deleteDirection": {
      const { servicePatternId, directionId } = command.payload;
      const sp = next.servicePatterns?.[servicePatternId];
      if (sp) {
        const dir = sp.directions.find((d: any) => d.id === directionId);
        if (dir) {
          if (next.stopPatterns) delete next.stopPatterns[dir.stopPatternId];
        }
        sp.directions = sp.directions.filter((d: any) => d.id !== directionId);
      }
      return { state: next, message: "運行方向を削除しました" };
    }
    case "line.addServicePattern":
    case "line.removeServicePattern": {
      return { state: next, message: "処理を完了しました" };
    }
    case "fleet.vehicle.acquire": {
      const design = vehicleCatalog.getVehicleDesign(command.designId);
      let operatorClass = next.fleet.operatorClasses.find((cls) => cls.baseVehicleDesignId === command.designId);
      if (!operatorClass) {
        operatorClass = {
          id: `class-${next.nextOperatorClassId++}`,
          operatorId: "op-default",
          className: design.name,
          baseVehicleDesignId: command.designId,
        };
        next.fleet.operatorClasses.push(operatorClass);
      }
      let numStr: string;
      if (command.operatorNumber !== undefined) {
        const trimmed = command.operatorNumber.trim();
        if (trimmed.length === 0) throw new Error("運行会社車両番号を空文字列にすることはできません");
        if (next.fleet.vehicleUnits.some((unit) => {
          const candidateClass = next.fleet.operatorClasses.find((cls) => cls.id === unit.operatorClassId);
          return candidateClass?.operatorId === operatorClass.operatorId && unit.operatorNumber === trimmed;
        })) {
          throw new Error(`運行会社車両番号が重複しています: ${trimmed}`);
        }
        numStr = trimmed;
      } else {
        const existingNumbers = new Set(
          next.fleet.vehicleUnits
            .filter((unit) => {
              const candidateClass = next.fleet.operatorClasses.find((cls) => cls.id === unit.operatorClassId);
              return candidateClass?.operatorId === operatorClass.operatorId;
            })
            .map((unit) => unit.operatorNumber)
        );
        let count = 1;
        while (existingNumbers.has(String(count))) {
          count += 1;
        }
        numStr = String(count);
      }
      const vehicleUnitId = `vehicle-${next.nextVehicleUnitId++}`;
      next.fleet.vehicleUnits.push({
        id: vehicleUnitId,
        operatorClassId: operatorClass.id,
        operatorNumber: numStr,
      });
      return { state: next, message: `車両「${design.name}」（${numStr}）を取得しました` };
    }
    case "fleet.formation-template.acquire": {
      const template = formationTemplateCatalog.getTemplate(command.templateId);
      const name = command.name?.trim() || template.name;
      const formationId = `formation-${next.nextFormationId++}`;
      const newFormation: Formation = {
        id: formationId,
        name,
        vehicles: [],
        warnings: [],
      };
      next.fleet.formations.push(newFormation);
      for (const item of template.vehicles) {
        const design = vehicleCatalog.getVehicleDesign(item.designId);
        let operatorClass = next.fleet.operatorClasses.find((cls) => cls.baseVehicleDesignId === item.designId);
        if (!operatorClass) {
          operatorClass = {
            id: `class-${next.nextOperatorClassId++}`,
            operatorId: "op-default",
            className: design.name,
            baseVehicleDesignId: item.designId,
          };
          next.fleet.operatorClasses.push(operatorClass);
        }
        const existingNumbers = new Set(
          next.fleet.vehicleUnits
            .filter((unit) => {
              const candidateClass = next.fleet.operatorClasses.find((cls) => cls.id === unit.operatorClassId);
              return candidateClass?.operatorId === operatorClass.operatorId;
            })
            .map((unit) => unit.operatorNumber)
        );
        let count = 1;
        while (existingNumbers.has(String(count))) {
          count += 1;
        }
        const numStr = String(count);
        const vehicleUnitId = `vehicle-${next.nextVehicleUnitId++}`;
        const unit: VehicleUnit = {
          id: vehicleUnitId,
          operatorClassId: operatorClass.id,
          operatorNumber: numStr,
        };
        next.fleet.vehicleUnits.push(unit);
        newFormation.vehicles.push({
          vehicleId: unit.id,
          orientation: item.orientation,
        });
      }
      assertAllAdjacentConnections(next.fleet, newFormation);
      newFormation.warnings = formationWarnings(next.fleet, newFormation);
      return { state: next, message: `完成編成「${name}」を取得しました` };
    }
    case "fleet.formation.create": {
      const name = command.name.trim();
      if (name.length < 1 || name.length > 80) throw new Error("編成名は1〜80文字で入力してください");
      const formationId = `formation-${next.nextFormationId++}`;
      next.fleet.formations.push({
        id: formationId,
        name,
        vehicles: [],
        warnings: [],
      });
      return { state: next, message: `編成「${name}」を作成しました` };
    }
    case "fleet.formation.rename": {
      const formation = next.fleet.formations.find((item) => item.id === command.formationId);
      if (!formation) throw new Error("編成が存在しません");
      const name = command.name.trim();
      if (name.length < 1 || name.length > 80) throw new Error("編成名は1〜80文字で入力してください");
      formation.name = name;
      return { state: next, message: `編成名を「${name}」へ変更しました` };
    }
    case "fleet.formation.delete": {
      const index = next.fleet.formations.findIndex((item) => item.id === command.formationId);
      if (index < 0) throw new Error("編成が存在しません");
      const formation = next.fleet.formations[index];
      const status = getFormationOperationalStatus(next, formation.id);
      if (status !== "unplaced") throw new Error("配置・予約・運行・回収待ちの編成は削除できません");
      if (formation.vehicles.length > 0) throw new Error("車両が含まれる編成は削除できません。先に車両を外してください");
      next.fleet.formations.splice(index, 1);
      return { state: next, message: `編成「${formation.name}」を削除しました` };
    }
    case "fleet.formation.vehicle.add": {
      const formation = next.fleet.formations.find((item) => item.id === command.formationId);
      if (!formation) throw new Error("編成が存在しません");
      const status = getFormationOperationalStatus(next, formation.id);
      if (status !== "unplaced") throw new Error("配置・予約・運行・回収待ちの編成は編集できません");
      const vehicle = next.fleet.vehicleUnits.find((item) => item.id === command.vehicleId);
      if (!vehicle) throw new Error("車両個体が存在しません");
      const owner = next.fleet.formations.find((candidate) => candidate.vehicles.some((item) => item.vehicleId === vehicle.id));
      if (owner) throw new Error(`${vehicle.id}は既に${owner.id}へ所属しています`);
      const assignment = { vehicleId: vehicle.id, orientation: command.orientation };
      const placement = command.placement ?? "rear";
      if (formation.vehicles.length > 0) {
        const first = placement === "rear" ? formation.vehicles.at(-1)! : assignment;
        const second = placement === "rear" ? assignment : formation.vehicles[0];
        assertMechanicalConnection(next.fleet, first, "rear", second, "front");
      }
      if (placement === "rear") formation.vehicles.push(assignment);
      else formation.vehicles.unshift(assignment);
      formation.warnings = formationWarnings(next.fleet, formation);
      return { state: next, message: `車両を編成「${formation.name}」へ追加しました` };
    }
    case "fleet.formation.vehicle.remove": {
      const formation = next.fleet.formations.find((item) => item.id === command.formationId);
      if (!formation) throw new Error("編成が存在しません");
      const status = getFormationOperationalStatus(next, formation.id);
      if (status !== "unplaced") throw new Error("配置・予約・運行・回収待ちの編成は編集できません");
      const index = formation.vehicles.findIndex((item) => item.vehicleId === command.vehicleId);
      if (index < 0) throw new Error("指定された車両は編成に含まれていません");
      formation.vehicles.splice(index, 1);
      assertAllAdjacentConnections(next.fleet, formation);
      formation.warnings = formationWarnings(next.fleet, formation);
      return { state: next, message: `車両を編成「${formation.name}」から外しました` };
    }
    case "fleet.formation.vehicle.move": {
      const formation = next.fleet.formations.find((item) => item.id === command.formationId);
      if (!formation) throw new Error("編成が存在しません");
      const status = getFormationOperationalStatus(next, formation.id);
      if (status !== "unplaced") throw new Error("配置・予約・運行・回収待ちの編成は編集できません");
      const currentIndex = formation.vehicles.findIndex((item) => item.vehicleId === command.vehicleId);
      if (currentIndex < 0) throw new Error("指定された車両は編成に含まれていません");
      if (!Number.isInteger(command.targetIndex) || command.targetIndex < 0 || command.targetIndex >= formation.vehicles.length) {
        throw new Error("移動先の位置が無効です");
      }
      const [item] = formation.vehicles.splice(currentIndex, 1);
      formation.vehicles.splice(command.targetIndex, 0, item);
      assertAllAdjacentConnections(next.fleet, formation);
      formation.warnings = formationWarnings(next.fleet, formation);
      return { state: next, message: `車両の位置を変更しました` };
    }
    case "fleet.formation.vehicle.reverse": {
      const formation = next.fleet.formations.find((item) => item.id === command.formationId);
      if (!formation) throw new Error("編成が存在しません");
      const status = getFormationOperationalStatus(next, formation.id);
      if (status !== "unplaced") throw new Error("配置・予約・運行・回収待ちの編成は編集できません");
      const item = formation.vehicles.find((v) => v.vehicleId === command.vehicleId);
      if (!item) throw new Error("指定された車両は編成に含まれていません");
      item.orientation = item.orientation === "forward" ? "reversed" : "forward";
      assertAllAdjacentConnections(next.fleet, formation);
      formation.warnings = formationWarnings(next.fleet, formation);
      return { state: next, message: `車両の向きを反転しました` };
    }
    case "fleet.formation.place": {
      const formation = next.fleet.formations.find((item) => item.id === command.formationId);
      if (!formation) throw new Error("編成が存在しません");
      if (formation.vehicles.length === 0) throw new Error("空の編成は配置できません");
      const status = getFormationOperationalStatus(next, formation.id);
      if (status !== "unplaced" && status !== "awaiting-placement") throw new Error("配置済み・予約中・運行中の編成は配置できません");
      const station = next.stations.find((item) => item.id === command.stationId);
      if (!station) throw new Error("駅が存在しません");
      const track = next.tracks.find((item) => item.id === command.trackId);
      if (!track) throw new Error("線路が存在しません");
      const stopPoint = station.stopPoints.find((sp) => sp.trackId === command.trackId);
      if (!stopPoint) throw new Error("選択した駅はこの線路に停車地点を持ちません");
      if (command.distanceM < stopPoint.startDistanceM - 0.001 || command.distanceM > stopPoint.endDistanceM + 0.001) {
        throw new Error("配置位置が駅の停車範囲外です");
      }
      const { lengthM: formationLengthM } = getFormationLengthM(next.fleet, formation);
      const occupiedStartDistanceM = command.distanceM - formationLengthM / 2;
      const occupiedEndDistanceM = command.distanceM + formationLengthM / 2;
      const trackLengthM = analyzeLine(sampleTrack(track)).lengthM;
      if (occupiedStartDistanceM < -0.001 || occupiedEndDistanceM > trackLengthM + 0.001) {
        throw new Error("配置占有範囲が線路の長さ外へはみ出しています");
      }
      for (const placement of next.vehiclePlacements) {
        if (placement.trackId === command.trackId) {
          if (occupiedStartDistanceM <= placement.occupiedEndDistanceM && placement.occupiedStartDistanceM <= occupiedEndDistanceM) {
            throw new Error("同一線路上で他の配置編成と占有範囲が重複しています");
          }
        }
      }
      let orientation: Orientation;
      if (command.orientation) {
        orientation = command.orientation;
      } else {
        const stationCenterDistanceM = (stopPoint.startDistanceM + stopPoint.endDistanceM) / 2;
        orientation = command.distanceM >= stationCenterDistanceM ? "forward" : "reversed";
      }
      const placementId = `placement-${formation.id}`;
      next.vehiclePlacements.push({
        id: placementId,
        formationId: formation.id,
        stationId: station.id,
        trackId: track.id,
        centerDistanceM: command.distanceM,
        occupiedStartDistanceM,
        occupiedEndDistanceM,
        orientation,
      });
      return { state: next, message: `編成「${formation.name}」を駅「${station.name}」の線路 ${track.id} へ配置しました` };
    }
    case "fleet.formation.unplace": {
      const index = next.vehiclePlacements.findIndex((item) => item.formationId === command.formationId);
      if (index < 0) throw new Error("指定された編成は配置されていません");
      const status = getFormationOperationalStatus(next, command.formationId);
      if (status === "reserved" || status === "operating") {
        throw new Error("予約中または運行中の編成は配置解除できません");
      }
      next.vehiclePlacements.splice(index, 1);
      const formation = next.fleet.formations.find((item) => item.id === command.formationId);
      return { state: next, message: `編成「${formation?.name ?? command.formationId}」の配置を解除しました` };
    }
    case "simulation.tick": {
      if (!Number.isFinite(command.elapsedSeconds) || command.elapsedSeconds < 0) throw new Error("経過時間は0以上の有限値で指定してください");
      const totalTargetTimeMs = Math.round(next.clock.currentTimeMs + command.elapsedSeconds * 1000);
      if (!Number.isSafeInteger(totalTargetTimeMs) || Math.abs(totalTargetTimeMs) > 8_640_000_000_000_000) throw new Error("ゲーム内時刻が表現可能な範囲を超えています");

      while (next.clock.currentTimeMs < totalTargetTimeMs) {
        const currentTimeMs = next.clock.currentTimeMs;
        const candidateRuns = Object.values(next.trainRuns || {}).filter(
          (r) => r.status === "reserved" && r.scheduledDepartureTimeMs > currentTimeMs && r.scheduledDepartureTimeMs <= totalTargetTimeMs
        );

        let nextStepTargetMs = Math.min(totalTargetTimeMs, currentTimeMs + 60 * 1000);
        if (candidateRuns.length > 0) {
          const earliestRunTimeMs = Math.min(...candidateRuns.map((r) => r.scheduledDepartureTimeMs));
          nextStepTargetMs = Math.min(nextStepTargetMs, earliestRunTimeMs);
        }

        const stepSeconds = (nextStepTargetMs - currentTimeMs) / 1000;
        next.clock.currentTimeMs = nextStepTargetMs;

        if (stepSeconds > 0) {
          advanceOperatingTrains(next, stepSeconds);
          tickOperationExecutions(next, stepSeconds);
        }
      }

      return { state: next, message: "時間を進めました" };
    }
    case "simulation.setPaused":
      next.clock.paused = command.paused;
      return { state: next, message: command.paused ? "時間を一時停止しました" : "時間を進行します" };
    case "simulation.setSpeed":
      if (!(SIMULATION_SPEEDS as readonly number[]).includes(command.speedMultiplier)) throw new Error("対応していない時間速度です");
      next.clock.speedMultiplier = command.speedMultiplier;
      return { state: next, message: `時間速度を${command.speedMultiplier}倍へ変更しました` };
    case "map.clear":
      return { state: { ...createInitialState(), clock: structuredClone(next.clock) }, message: "マップを空にしました" };
  }
}

function removeInvalidRoutesAndTrains(state: MapState): void {
  const stationIds = new Set(state.stations.map((station) => station.id));
  for (const [routeId, route] of Object.entries(state.operationRoutes || {})) {
    if (
      !route.stationIds.every((id: string) => stationIds.has(id)) ||
      !(route.legs || []).every((leg: any) => (leg.tracks || []).every((tr: any) => state.tracks.some((track) => track.id === tr.trackId)))
    ) {
      delete state.operationRoutes[routeId];
    }
  }
  const routeIds = new Set(Object.keys(state.operationRoutes || {}));
  state.operatingTrains = state.operatingTrains.filter((train) => routeIds.has(train.routeId));
}

function createTracks(next: MapState, command: Extract<MapCommand, { type: "track.create" }>): CommandResult {
  if (command.points.length < 2) throw new Error("線路には2点以上が必要です");
  const trackCount = command.trackCount ?? 1;
  if (!Number.isInteger(trackCount) || trackCount < 1 || trackCount > 8) throw new Error("線路本数は1〜8本で指定してください");
  const trackSpacing = command.trackSpacing ?? 12;
  if (!Number.isFinite(trackSpacing) || trackSpacing <= 0) throw new Error("線路間隔は0より大きい値にしてください");
  const specification = command.specification ?? trackCatalog.defaultSpecification();
  trackCatalog.validateSpecification(specification);
  const designSpeedKmh = command.designSpeedKmh ?? 80;
  if (!Number.isFinite(designSpeedKmh) || designSpeedKmh < 0 || designSpeedKmh > 500) throw new Error("設計速度は0〜500 km/hで指定してください");

  const startTarget = command.startConnectionTrackId ? requireTrack(next, command.startConnectionTrackId) : undefined;
  const endTarget = command.endConnectionTrackId ? requireTrack(next, command.endConnectionTrackId) : undefined;

  let startTangent = command.startTangent;
  let endTangent = command.endTangent;

  if (startTarget) {
    const targetStartTangent = getTrackTangentAtPosition(startTarget, command.points[0]);
    if (command.geometry === "straight") {
      const proposedStartTangent = { x: command.points[1].x - command.points[0].x, y: command.points[1].y - command.points[0].y };
      if (!isTangentContinuous(proposedStartTangent, targetStartTangent)) {
        throw new Error("指定された接続先線路と接線方向が一致しない直線線路は接続できません。角度を合わせるか曲線線路を使用してください");
      }
    } else {
      if (!startTangent || !isTangentContinuous(startTangent, targetStartTangent)) {
        startTangent = targetStartTangent;
      }
    }
  }

  if (endTarget) {
    const lastIdx = command.points.length - 1;
    const targetEndTangent = getTrackTangentAtPosition(endTarget, command.points[lastIdx]);
    if (command.geometry === "straight") {
      const proposedEndTangent = { x: command.points[lastIdx].x - command.points[lastIdx - 1].x, y: command.points[lastIdx].y - command.points[lastIdx - 1].y };
      if (!isTangentContinuous(proposedEndTangent, targetEndTangent)) {
        throw new Error("指定された接続先線路と接線方向が一致しない直線線路は接続できません。角度を合わせるか曲線線路を使用してください");
      }
    } else {
      if (!endTangent || !isTangentContinuous(endTangent, targetEndTangent)) {
        endTangent = targetEndTangent;
      }
    }
  }

  const centerLine = sampleTrack({
    geometry: command.geometry,
    points: command.points,
    ...(startTangent ? { startTangent } : {}),
    ...(endTangent ? { endTangent } : {}),
  });
  const paths = createParallelLines(centerLine, trackCount, trackSpacing);
  const newIds = paths.map(() => `track-${next.nextTrackId++}`);
  const startTargetIds = startTarget ? groupTrackIds(next, startTarget.id) : [];
  const alignmentIndex = command.connectionAlignmentIndex ?? centeredConnectionCandidateIndex(newIds.length, startTargetIds.length);
  const startPairs = startTarget ? pairByAlignment(newIds, startTargetIds, alignmentIndex) : [];
  if (startTarget) {
    alignPathsToConnection(next, paths, startTarget.id, alignmentIndex, centerLine[0]);
  }
  const endTargetIds = endTarget ? orderedEndTargetIds(next, endTarget.id, paths, centerLine.at(-1)!) : [];
  const endAlignmentIndex = command.endConnectionAlignmentIndex ?? centeredConnectionCandidateIndex(newIds.length, endTargetIds.length);
  const endPairs = endTarget ? pairByAlignment(newIds, endTargetIds, endAlignmentIndex) : [];
  if (endTarget) {
    alignPathEndsToConnection(next, paths, endTarget.id, endAlignmentIndex, centerLine.at(-1)!);
  }
  for (const path of paths) {
    for (const existing of next.tracks) {
      if (polylineOverlapLength(path, sampleTrack(existing)) > 0.0001) throw new Error(`既設線路${existing.id}と同じ区間へ線路を重ねることはできません`);
    }
  }
  const gaugeMm = trackCatalog.getGauge(specification.gaugeId).gaugeMm;
  const startJunctionIds = new Map(startPairs.flatMap((pair) => {
    const ownIndex = newIds.indexOf(pair.ownId);
    const jId = createConnectionJunction(next, pair.ownId, paths[ownIndex], "start", pair.otherId, paths[ownIndex][0], command.geometry);
    return jId ? [[pair.ownId, jId] as const] : [];
  }));
  const endJunctionIds = new Map(endPairs.flatMap((pair) => {
    const ownIndex = newIds.indexOf(pair.ownId);
    const jId = createConnectionJunction(next, pair.ownId, paths[ownIndex], "end", pair.otherId, paths[ownIndex].at(-1)!, command.geometry);
    return jId ? [[pair.ownId, jId] as const] : [];
  }));

  paths.forEach((path, index) => {
    const alignment = analyzeLine(path);
    const cantMm = recommendedCantMm(gaugeMm, designSpeedKmh, alignment.minimumRadiusM);
    const startJunctionId = startJunctionIds.get(newIds[index]);
    const endJunctionId = endJunctionIds.get(newIds[index]);
    const startConnection = startPairs.find((pair) => pair.ownId === newIds[index]);
    const endConnection = endPairs.find((pair) => pair.ownId === newIds[index]);
    next.tracks.push({
      id: newIds[index],
      geometry: command.geometry,
      points: path.map((point) => ({ ...point })),
      resolvedPath: true,
      specification: structuredClone(specification),
      ...(startTangent ? { startTangent: { ...startTangent } } : {}),
      ...(endTangent ? { endTangent: { ...endTangent } } : {}),
      ...(startConnection && startJunctionId ? { startConnection: { trackId: startConnection.otherId, junctionId: startJunctionId } } : {}),
      ...(endConnection && endJunctionId ? { endConnection: { trackId: endConnection.otherId, junctionId: endJunctionId } } : {}),
      engineering: {
        designSpeedKmh,
        builtMinimumRadiusM: alignment.minimumRadiusM,
        cantProfile: [{ distanceM: 0, cantMm }, { distanceM: alignment.lengthM, cantMm }],
      },
    });
  });

  if (newIds.length >= 2) createGroup(next, newIds);
  return { state: next, message: `${trackCount}本の独立した${command.geometry === "curve" ? "曲線" : "直線"}線路を敷設しました` };
}

export function pairByCenter(ownIds: string[], otherIds: string[]): { ownId: string; otherId: string }[] {
  return pairByAlignment(ownIds, otherIds, centeredConnectionCandidateIndex(ownIds.length, otherIds.length));
}

export function connectionCandidateCount(ownCount: number, otherCount: number): number {
  return ownCount + otherCount - 1;
}

export function centeredConnectionCandidateIndex(ownCount: number, otherCount: number): number {
  return Math.floor((connectionCandidateCount(ownCount, otherCount) - 1) / 2);
}

export function connectionCandidateIndexFromSelectedTrack(ownCount: number, otherIds: string[], selectedTrackId: string): number {
  const selectedIndex = otherIds.indexOf(selectedTrackId);
  if (selectedIndex < 0) return centeredConnectionCandidateIndex(ownCount, otherIds.length);
  const center = (otherIds.length - 1) / 2;
  if (selectedIndex < center) return selectedIndex + ownCount - 1;
  if (selectedIndex > center) return selectedIndex;
  return centeredConnectionCandidateIndex(ownCount, otherIds.length);
}

export function pairByAlignment(ownIds: string[], otherIds: string[], candidateIndex: number): { ownId: string; otherId: string }[] {
  const maximum = connectionCandidateCount(ownIds.length, otherIds.length) - 1;
  const selected = Math.max(0, Math.min(maximum, Math.round(candidateIndex)));
  const shift = selected - (ownIds.length - 1);
  return ownIds.flatMap((ownId, ownIndex) => {
    const otherIndex = ownIndex + shift;
    return otherIndex >= 0 && otherIndex < otherIds.length
      ? [{ ownId, otherId: otherIds[otherIndex] }]
      : [];
  });
}

export function alignPathsToConnection(state: MapState, paths: Point[][], targetTrackId: string, candidateIndex: number, anchor: Point): void {
  const targetIds = groupTrackIds(state, targetTrackId);
  const ownIds = paths.map((_, index) => `preview-${index}`);
  const pairs = pairByAlignment(ownIds, targetIds, candidateIndex);
  if (pairs.length === 0) return;
  const clickedIndex = targetIds.indexOf(targetTrackId);
  const pair = [...pairs].sort((a, b) => Math.abs(targetIds.indexOf(a.otherId) - clickedIndex) - Math.abs(targetIds.indexOf(b.otherId) - clickedIndex))[0];
  const ownIndex = ownIds.indexOf(pair.ownId);
  const target = state.tracks.find((track) => track.id === pair.otherId);
  if (ownIndex < 0 || !target) return;
  const targetPoint = nearestPointOnPath(sampleTrack(target), anchor);
  const shift = { x: targetPoint.x - paths[ownIndex][0].x, y: targetPoint.y - paths[ownIndex][0].y };
  for (const path of paths) for (const point of path) { point.x += shift.x; point.y += shift.y; }
}

export function alignPathEndsToConnection(state: MapState, paths: Point[][], targetTrackId: string, candidateIndex: number, anchor: Point): void {
  const targetIds = orderedEndTargetIds(state, targetTrackId, paths, anchor);
  const targetPoints = targetIds.map((id) => {
    const target = state.tracks.find((track) => track.id === id);
    return target ? nearestPointOnPath(sampleTrack(target), anchor) : anchor;
  });
  const shift = Math.max(0, Math.min(connectionCandidateCount(paths.length, targetIds.length) - 1, Math.round(candidateIndex))) - (paths.length - 1);
  for (let ownIndex = 0; ownIndex < paths.length; ownIndex += 1) {
    if (paths[ownIndex].length === 0) continue;
    const path = paths[ownIndex];
    const targetIndex = ownIndex + shift;
    const targetPoint = extrapolatedBundlePoint(targetPoints, targetIndex, paths, ownIndex);
    const currentEnd = path.at(-1)!;
    const correction = { x: targetPoint.x - currentEnd.x, y: targetPoint.y - currentEnd.y };
    const distances = [0];
    for (let index = 1; index < path.length; index += 1) {
      distances.push(distances[index - 1] + Math.hypot(path[index].x - path[index - 1].x, path[index].y - path[index - 1].y));
    }
    const totalLength = distances.at(-1)!;
    for (let index = 0; index < path.length; index += 1) {
      const progress = totalLength > 1e-9 ? distances[index] / totalLength : index / Math.max(1, path.length - 1);
      // Smoothstep has zero slope at both ends, so distributing the lateral
      // correction does not create a kink at either connection tangent.
      const weight = progress * progress * (3 - 2 * progress);
      path[index] = {
        x: path[index].x + correction.x * weight,
        y: path[index].y + correction.y * weight,
      };
    }
  }
}

function orderedEndTargetIds(state: MapState, targetTrackId: string, paths: Point[][], anchor: Point): string[] {
  const targetIds = groupTrackIds(state, targetTrackId);
  if (targetIds.length < 2 || paths.length < 2) return targetIds;
  const targetPoints = targetIds.map((id) => {
    const target = state.tracks.find((track) => track.id === id);
    return target ? nearestPointOnPath(sampleTrack(target), anchor) : anchor;
  });
  const firstPathEnd = paths[0].at(-1)!;
  const lastPathEnd = paths.at(-1)!.at(-1)!;
  const directCost = pointDistance(firstPathEnd, targetPoints[0]) + pointDistance(lastPathEnd, targetPoints.at(-1)!);
  const reverseCost = pointDistance(firstPathEnd, targetPoints.at(-1)!) + pointDistance(lastPathEnd, targetPoints[0]);
  return reverseCost < directCost ? [...targetIds].reverse() : targetIds;
}

function pointDistance(first: Point, second: Point): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function extrapolatedBundlePoint(targetPoints: Point[], targetIndex: number, paths: Point[][], ownIndex: number): Point {
  if (targetPoints.length === 0) return paths[ownIndex].at(-1)!;
  if (targetIndex >= 0 && targetIndex < targetPoints.length) return targetPoints[targetIndex];
  let spacing: Point;
  let edgeIndex: number;
  if (targetPoints.length >= 2 && targetIndex < 0) {
    spacing = { x: targetPoints[1].x - targetPoints[0].x, y: targetPoints[1].y - targetPoints[0].y };
    edgeIndex = 0;
  } else if (targetPoints.length >= 2) {
    const last = targetPoints.length - 1;
    spacing = { x: targetPoints[last].x - targetPoints[last - 1].x, y: targetPoints[last].y - targetPoints[last - 1].y };
    edgeIndex = last;
  } else {
    const neighborIndex = ownIndex > 0 ? ownIndex - 1 : ownIndex + 1;
    const ownEnd = paths[ownIndex].at(-1)!;
    const neighborEnd = paths[neighborIndex]?.at(-1);
    spacing = neighborEnd
      ? ownIndex > 0
        ? { x: ownEnd.x - neighborEnd.x, y: ownEnd.y - neighborEnd.y }
        : { x: neighborEnd.x - ownEnd.x, y: neighborEnd.y - ownEnd.y }
      : { x: 0, y: 0 };
    edgeIndex = 0;
  }
  const edge = targetPoints[edgeIndex];
  const offset = targetIndex - edgeIndex;
  return { x: edge.x + spacing.x * offset, y: edge.y + spacing.y * offset };
}

export function findTrackGroup(state: MapState, trackId: string): TrackGroup | undefined {
  return state.trackGroups.find((group) => group.trackIds.includes(trackId));
}

function groupTrackIds(state: MapState, trackId: string): string[] {
  return findTrackGroup(state, trackId)?.trackIds ?? [trackId];
}

function nearestPointOnPath(points: Point[], point: Point): Point {
  let nearest = points[0] ?? point;
  let distance = Infinity;
  for (let index = 0; index < points.length - 1; index += 1) {
    const candidate = closestPointOnSegment(point, points[index], points[index + 1]);
    if (candidate.distance < distance) { nearest = candidate.point; distance = candidate.distance; }
  }
  return nearest;
}

function createGroup(state: MapState, trackIds: string[], name?: string): TrackGroup {
  const number = state.nextTrackGroupId++;
  const group = { id: `track-group-${number}`, name: name?.trim() || `線路群 ${number}`, trackIds: orderTrackIdsSpatially(state, trackIds) };
  state.trackGroups.push(group);
  return group;
}

function orderTrackIdsSpatially(state: MapState, trackIds: string[]): string[] {
  const tracks = trackIds.map((id) => requireTrack(state, id));
  const reference = sampleTrack(tracks[0]);
  if (reference.length < 2) return [...trackIds];
  const direction = { x: reference[1].x - reference[0].x, y: reference[1].y - reference[0].y };
  const length = Math.hypot(direction.x, direction.y) || 1;
  const normal = { x: -direction.y / length, y: direction.x / length };
  return [...tracks]
    .sort((first, second) => trackCenter(first).x * normal.x + trackCenter(first).y * normal.y - (trackCenter(second).x * normal.x + trackCenter(second).y * normal.y))
    .map((track) => track.id);
}

function trackCenter(track: Track): Point {
  const points = sampleTrack(track);
  return points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 });
}

function createConnectionJunction(
  state: MapState,
  ownTrackId: string,
  ownPath: Point[],
  ownLocation: "start" | "end",
  otherTrackId: string,
  position: Point,
  geometry?: TrackGeometry
): string {
  const other = requireTrack(state, otherTrackId);
  const otherPath = sampleTrack(other);
  const located = locateOnPath(otherPath, position);
  const ownTangent = getTrackPortTangent(
    { geometry: geometry ?? "straight", points: ownPath, resolvedPath: true },
    ownLocation,
    ownLocation === "start" ? 0 : pathLength(ownPath)
  );
  const otherTangent = getTrackPortTangent(other, located.location, located.distanceM);
  if (!isTangentContinuous(ownTangent, otherTangent)) {
    throw new Error("生成された線路の接線方向が接続先と一致しないため接続できません。接続点または曲線形状を調整してください");
  }
  const id = `junction-${state.nextJunctionId++}`;
  state.junctions.push({
    id,
    position: { ...located.point },
    ports: [
      { trackId: ownTrackId, location: ownLocation, distanceM: ownLocation === "start" ? 0 : pathLength(ownPath) },
      { trackId: otherTrackId, location: located.location, distanceM: located.distanceM },
    ],
  });
  return id;
}

function locateOnPath(points: Point[], position: Point): { point: Point; distanceM: number; location: TrackJunctionPortLocation } {
  let traversed = 0;
  let best = { point: points[0] ?? position, distanceM: 0, distance: Infinity };
  for (let index = 0; index < points.length - 1; index += 1) {
    const candidate = closestPointOnSegment(position, points[index], points[index + 1]);
    const segmentLength = Math.hypot(points[index + 1].x - points[index].x, points[index + 1].y - points[index].y);
    const partial = Math.hypot(candidate.point.x - points[index].x, candidate.point.y - points[index].y);
    if (candidate.distance < best.distance) best = { point: candidate.point, distanceM: traversed + partial, distance: candidate.distance };
    traversed += segmentLength;
  }
  const total = traversed;
  const location = best.distanceM <= 0.001 ? "start" : total - best.distanceM <= 0.001 ? "end" : "interior";
  return { point: best.point, distanceM: best.distanceM, location };
}

function pathLength(points: Point[]): number {
  return points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0);
}

function pointAtPathDistance(points: Point[], distanceM: number): Point {
  let traversed = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (traversed + length >= distanceM) {
      const ratio = length <= 0 ? 0 : (distanceM - traversed) / length;
      return { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio };
    }
    traversed += length;
  }
  return { ...(points.at(-1) ?? { x: 0, y: 0 }) };
}

function normalizeStationName(name: string): string {
  const normalized = name.trim();
  if (normalized.length < 1 || normalized.length > 60) throw new Error("駅名は1〜60文字で入力してください");
  return normalized;
}


function uniqueTrackIds(trackIds: string[]): string[] {
  return [...new Set(trackIds)];
}

function assertTracksExist(state: MapState, trackIds: string[]): void {
  for (const id of trackIds) requireTrack(state, id);
}

function assertTracksUngrouped(state: MapState, trackIds: string[]): void {
  for (const id of trackIds) if (findTrackGroup(state, id)) throw new Error(`${id}は既に線路群へ所属しています`);
}

function requireTrack(state: MapState, trackId: string): Track {
  const track = state.tracks.find((item) => item.id === trackId);
  if (!track) throw new Error(`線路が存在しません: ${trackId}`);
  return track;
}

function requireGroup(state: MapState, groupId: string): TrackGroup {
  const group = state.trackGroups.find((item) => item.id === groupId);
  if (!group) throw new Error(`線路群が存在しません: ${groupId}`);
  return group;
}
