import {
  vehicleCatalog,
  type VehicleConnectionEnd,
  type VehicleConnectionViolation,
  type VehicleEndName,
} from "../data/vehicleCatalog";

export type Orientation = "forward" | "reversed";
export type Placement = "front" | "rear";

export interface OperatorVehicleClass {
  id: string;
  operatorId: string;
  className: string;
  baseVehicleDesignId: string;
  connectionOverrides?: Partial<Record<VehicleEndName, VehicleConnectionEnd>>;
}
export interface VehicleUnit {
  id: string;
  operatorClassId: string;
  operatorNumber: string;
  manufacturerSerialNumber?: string;
  cargoDestination?: string;
}

export interface FormationVehicle {
  vehicleId: string;
  orientation: Orientation;
}

export interface BrakeContinuityWarning {
  type: "through-brake-discontinuity";
  firstId: string;
  secondId: string;
}

export interface Formation {
  id: string;
  name: string;
  vehicles: FormationVehicle[];
  warnings: BrakeContinuityWarning[];
}

export interface TrainFormationAssignment {
  formationId: string;
  orientation: Orientation;
  destinationStationId: string;
}

export interface Train {
  id: string;
  name: string;
  formations: TrainFormationAssignment[];
  warnings: BrakeContinuityWarning[];
}

export interface FleetState {
  operatorClasses: OperatorVehicleClass[];
  vehicleUnits: VehicleUnit[];
  formations: Formation[];
  trains: Train[];
}

export type FleetCommand =
  | { type: "operator-class.create"; operatorClass: OperatorVehicleClass }
  | { type: "vehicle-unit.create"; vehicleUnit: VehicleUnit }
  | { type: "formation.create"; formationId: string; name: string }
  | { type: "formation.vehicle.add"; formationId: string; vehicleId: string; orientation: Orientation; placement?: Placement }
  | { type: "train.create"; trainId: string; name: string }
  | { type: "train.formation.add"; trainId: string; formationId: string; destinationStationId: string; orientation: Orientation; placement?: Placement };

export interface FleetCommandResult {
  state: FleetState;
  message: string;
  warnings: BrakeContinuityWarning[];
}

export function createInitialFleetState(): FleetState {
  return { operatorClasses: [], vehicleUnits: [], formations: [], trains: [] };
}

export function executeFleetCommand(state: FleetState, command: FleetCommand): FleetCommandResult {
  const next = structuredClone(state);

  switch (command.type) {
    case "operator-class.create": {
      requireUniqueId(next.operatorClasses, command.operatorClass.id, "運行会社形式");
      vehicleCatalog.getVehicleDesign(command.operatorClass.baseVehicleDesignId);
      validateConnectionOverrides(command.operatorClass.connectionOverrides);
      next.operatorClasses.push(structuredClone(command.operatorClass));
      return result(next, "運行会社形式を登録しました");
    }
    case "vehicle-unit.create": {
      requireUniqueId(next.vehicleUnits, command.vehicleUnit.id, "車両個体");
      requireById(next.operatorClasses, command.vehicleUnit.operatorClassId, "運行会社形式");
      const operatorClass = requireById(next.operatorClasses, command.vehicleUnit.operatorClassId, "運行会社形式");
      if (next.vehicleUnits.some((unit) => {
        const candidateClass = requireById(next.operatorClasses, unit.operatorClassId, "運行会社形式");
        return candidateClass.operatorId === operatorClass.operatorId && unit.operatorNumber === command.vehicleUnit.operatorNumber;
      })) {
        throw new Error(`運行会社車両番号が重複しています: ${command.vehicleUnit.operatorNumber}`);
      }
      next.vehicleUnits.push(structuredClone(command.vehicleUnit));
      return result(next, "車両個体を登録しました");
    }
    case "formation.create": {
      requireUniqueId(next.formations, command.formationId, "編成");
      next.formations.push({ id: command.formationId, name: command.name, vehicles: [], warnings: [] });
      return result(next, "編成を作成しました");
    }
    case "formation.vehicle.add": {
      const formation = requireById(next.formations, command.formationId, "編成");
      const vehicle = requireById(next.vehicleUnits, command.vehicleId, "車両個体");
      const owner = next.formations.find((candidate) => candidate.vehicles.some((item) => item.vehicleId === vehicle.id));
      if (owner) throw new Error(`${vehicle.id}は既に${owner.id}へ所属しています`);
      const assignment = { vehicleId: vehicle.id, orientation: command.orientation };
      const placement = command.placement ?? "rear";
      if (formation.vehicles.length > 0) {
        const first = placement === "rear" ? formation.vehicles.at(-1)! : assignment;
        const second = placement === "rear" ? assignment : formation.vehicles[0];
        assertMechanicalConnection(next, first, "rear", second, "front");
      }
      if (placement === "rear") formation.vehicles.push(assignment);
      else formation.vehicles.unshift(assignment);
      formation.warnings = formationWarnings(next, formation);
      return result(next, "車両を編成へ追加しました", formation.warnings);
    }
    case "train.create": {
      requireUniqueId(next.trains, command.trainId, "列車");
      next.trains.push({ id: command.trainId, name: command.name, formations: [], warnings: [] });
      return result(next, "列車を作成しました");
    }
    case "train.formation.add": {
      const train = requireById(next.trains, command.trainId, "列車");
      const formation = requireById(next.formations, command.formationId, "編成");
      if (formation.vehicles.length === 0) throw new Error("空の編成は列車へ追加できません");
      const owner = next.trains.find((candidate) => candidate.formations.some((item) => item.formationId === formation.id));
      if (owner) throw new Error(`${formation.id}は既に${owner.id}へ所属しています`);
      const assignment: TrainFormationAssignment = {
        formationId: formation.id,
        orientation: command.orientation,
        destinationStationId: command.destinationStationId,
      };
      const placement = command.placement ?? "rear";
      if (train.formations.length > 0) {
        const first = placement === "rear" ? train.formations.at(-1)! : assignment;
        const second = placement === "rear" ? assignment : train.formations[0];
        assertFormationMechanicalConnection(next, first, second);
      }
      if (placement === "rear") train.formations.push(assignment);
      else train.formations.unshift(assignment);
      train.warnings = trainWarnings(next, train);
      return result(next, "編成を列車へ追加しました", train.warnings);
    }
  }
}

function result(state: FleetState, message: string, warnings: BrakeContinuityWarning[] = []): FleetCommandResult {
  return { state, message, warnings };
}

function requireUniqueId<T extends { id: string }>(items: T[], id: string, name: string): void {
  if (items.some((item) => item.id === id)) throw new Error(`${name}IDが重複しています: ${id}`);
}

function requireById<T extends { id: string }>(items: T[], id: string, name: string): T {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`${name}が存在しません: ${id}`);
  return item;
}

function validateConnectionOverrides(overrides: OperatorVehicleClass["connectionOverrides"]): void {
  if (!overrides) return;
  for (const end of Object.values(overrides)) {
    if (!end) continue;
    vehicleCatalog.validateConnectionEnd(end, "運行会社形式の接続端");
  }
}

function vehicleEnd(state: FleetState, assignment: FormationVehicle, outwardSide: VehicleEndName): VehicleConnectionEnd {
  const unit = requireById(state.vehicleUnits, assignment.vehicleId, "車両個体");
  const operatorClass = requireById(state.operatorClasses, unit.operatorClassId, "運行会社形式");
  const design = vehicleCatalog.getVehicleDesign(operatorClass.baseVehicleDesignId);
  const designSide = assignment.orientation === "forward"
    ? outwardSide
    : outwardSide === "front" ? "rear" : "front";
  return operatorClass.connectionOverrides?.[designSide] ?? design.connections[designSide];
}

function connectionViolations(
  state: FleetState,
  first: FormationVehicle,
  firstSide: VehicleEndName,
  second: FormationVehicle,
  secondSide: VehicleEndName,
): VehicleConnectionViolation[] {
  return vehicleCatalog.checkConnectionEnds(
    vehicleEnd(state, first, firstSide),
    vehicleEnd(state, second, secondSide),
    { requireThroughBrake: true },
  ).violations;
}

export function assertMechanicalConnection(
  state: FleetState,
  first: FormationVehicle,
  firstSide: VehicleEndName,
  second: FormationVehicle,
  secondSide: VehicleEndName,
): void {
  const violation = connectionViolations(state, first, firstSide, second, secondSide)
    .find((item) => item.type === "coupler-incompatible");
  if (violation) throw new Error(`${first.vehicleId}と${second.vehicleId}の連結器は互換ではありません`);
}

export function assertAllAdjacentConnections(state: FleetState, formation: Formation): void {
  for (let index = 1; index < formation.vehicles.length; index += 1) {
    const first = formation.vehicles[index - 1];
    const second = formation.vehicles[index];
    assertMechanicalConnection(state, first, "rear", second, "front");
  }
}

export function formationWarnings(state: FleetState, formation: Formation): BrakeContinuityWarning[] {
  const warnings: BrakeContinuityWarning[] = [];
  for (let index = 1; index < formation.vehicles.length; index += 1) {
    const first = formation.vehicles[index - 1];
    const second = formation.vehicles[index];
    if (connectionViolations(state, first, "rear", second, "front").some((item) => item.type === "through-brake-incompatible")) {
      warnings.push({ type: "through-brake-discontinuity", firstId: first.vehicleId, secondId: second.vehicleId });
    }
  }
  return warnings;
}


function formationEndpoint(state: FleetState, assignment: TrainFormationAssignment, side: VehicleEndName): FormationVehicle {
  const formation = requireById(state.formations, assignment.formationId, "編成");
  const useFront = assignment.orientation === "forward" ? side === "front" : side === "rear";
  const vehicle = useFront ? formation.vehicles[0] : formation.vehicles.at(-1);
  if (!vehicle) throw new Error(`空の編成です: ${formation.id}`);
  return assignment.orientation === "forward"
    ? vehicle
    : { ...vehicle, orientation: vehicle.orientation === "forward" ? "reversed" : "forward" };
}

function assertFormationMechanicalConnection(
  state: FleetState,
  first: TrainFormationAssignment,
  second: TrainFormationAssignment,
): void {
  assertMechanicalConnection(
    state,
    formationEndpoint(state, first, "rear"),
    "rear",
    formationEndpoint(state, second, "front"),
    "front",
  );
}

function trainWarnings(state: FleetState, train: Train): BrakeContinuityWarning[] {
  const warnings = train.formations.flatMap((assignment) => {
    const formation = requireById(state.formations, assignment.formationId, "編成");
    return formation.warnings;
  });
  for (let index = 1; index < train.formations.length; index += 1) {
    const firstAssignment = train.formations[index - 1];
    const secondAssignment = train.formations[index];
    const first = formationEndpoint(state, firstAssignment, "rear");
    const second = formationEndpoint(state, secondAssignment, "front");
    if (connectionViolations(state, first, "rear", second, "front").some((item) => item.type === "through-brake-incompatible")) {
      warnings.push({ type: "through-brake-discontinuity", firstId: firstAssignment.formationId, secondId: secondAssignment.formationId });
    }
  }
  return warnings;
}

export function getFormationLengthM(
  state: FleetState,
  formation: Formation,
): { lengthM: number; estimatedLength: boolean } {
  let lengthM = 0;
  let estimatedLength = false;
  for (const item of formation.vehicles) {
    const unit = requireById(state.vehicleUnits, item.vehicleId, "車両個体");
    const operatorClass = requireById(state.operatorClasses, unit.operatorClassId, "運行会社形式");
    const design = vehicleCatalog.getVehicleDesign(operatorClass.baseVehicleDesignId);
    const vehicleLength = design.dimensions?.lengthOverCouplersM;
    if (typeof vehicleLength === "number" && vehicleLength > 0) {
      lengthM += vehicleLength;
    } else {
      lengthM += 20;
      estimatedLength = true;
    }
  }
  return { lengthM, estimatedLength };
}
