import { vehicleCatalog } from "../data/vehicleCatalog";
import { executeFleetCommand, type Formation } from "./fleet";
import type { MapState } from "./model";

export interface YardVehicleView { id: string; name: string; lengthM: number; powered: boolean; destination: string }
export function yardFormation(state: MapState, cut: { id: string }): Formation {
  const formation = state.fleet.formations.find((f) => f.id === cut.id);
  if (!formation) throw new Error(`操車編成がfleetにない: ${cut.id}`);
  return formation;
}
/** fleetの正本は先頭→後尾。入換の占有計算では後端→先端として読む。 */
export function yardVehicleIds(state: MapState, cut: { id: string }): string[] { return yardFormation(state, cut).vehicles.map((v) => v.vehicleId).reverse(); }
export function yardVehicle(state: MapState, id: string): YardVehicleView {
  const unit = state.fleet.vehicleUnits.find((v) => v.id === id);
  const operatorClass = state.fleet.operatorClasses.find((c) => c.id === unit?.operatorClassId);
  if (!unit || !operatorClass) throw new Error(`操車車両がfleetにない: ${id}`);
  const design = vehicleCatalog.getVehicleDesign(operatorClass.baseVehicleDesignId);
  return { id, name: unit.operatorNumber, lengthM: design.dimensions?.lengthOverCouplersM ?? 20, powered: design.capabilities?.selfPropelled ?? false, destination: unit.cargoDestination ?? "" };
}
export function createYardFormation(state: MapState, formationId: string, name: string, rearToFront: { id: string; name: string; designId: string; destination?: string }[]): void {
  const run = (command: Parameters<typeof executeFleetCommand>[1]) => { state.fleet = executeFleetCommand(state.fleet, command).state; };
  run({ type: "formation.create", formationId, name });
  for (const spec of [...rearToFront].reverse()) {
    const classId = `yard-class-${spec.designId}`;
    if (!state.fleet.operatorClasses.some((c) => c.id === classId)) run({ type: "operator-class.create", operatorClass: { id: classId, operatorId: "yard-prototype", className: vehicleCatalog.getVehicleDesign(spec.designId).name, baseVehicleDesignId: spec.designId } });
    run({ type: "vehicle-unit.create", vehicleUnit: { id: spec.id, operatorClassId: classId, operatorNumber: spec.name, cargoDestination: spec.destination ?? "" } });
    run({ type: "formation.vehicle.add", formationId, vehicleId: spec.id, orientation: "forward" });
  }
}
