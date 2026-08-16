import { parse } from "yaml";
import brakeSystemsYaml from "../../data/vehicles/brake-systems.yaml?raw";
import coachesYaml from "../../data/vehicles/coaches.yaml?raw";
import couplerSystemsYaml from "../../data/vehicles/coupler-systems.yaml?raw";
import locomotivesYaml from "../../data/vehicles/locomotives.yaml?raw";
import manufacturersYaml from "../../data/vehicles/manufacturers.yaml?raw";
import poweredCarsYaml from "../../data/vehicles/powered-cars.yaml?raw";
import wagonsYaml from "../../data/vehicles/wagons.yaml?raw";

export type VehicleEndName = "front" | "rear";

export interface VehicleManufacturer {
  id: string;
  name: string;
}

export interface CouplerSystem {
  id: string;
  name: string;
  directlyCompatibleWithIds: string[];
}

export interface BrakeSystem {
  id: string;
  name: string;
  brakeType: "continuous";
}

export interface VehicleConnectionEnd {
  couplerSystemId: string;
  throughBrakeSystemIds: string[];
}

export interface VehicleDesign {
  id: string;
  name: string;
  manufacturerId: string;
  manufacturerModelName: string;
  connections: Record<VehicleEndName, VehicleConnectionEnd>;
  dimensions?: {
    lengthOverCouplersM?: number;
    maximumWidthM?: number;
    maximumHeightM?: number;
  };
}

interface CatalogFile<T> {
  formatVersion: number;
  catalog: string;
  items: T[];
}

export interface ConnectionPolicy {
  requireThroughBrake: boolean;
}

export type VehicleConnectionViolation =
  | { type: "coupler-incompatible"; firstCouplerSystemId: string; secondCouplerSystemId: string }
  | { type: "through-brake-incompatible" };

export interface VehicleConnectionCompatibility {
  compatible: boolean;
  mechanicallyCompatible: boolean;
  throughBrakeCompatible: boolean;
  commonThroughBrakeSystemIds: string[];
  violations: VehicleConnectionViolation[];
}

function readCatalog<T>(raw: string, expectedCatalog: string): CatalogFile<T> {
  const value: unknown = parse(raw);
  if (!value || typeof value !== "object") throw new Error(`${expectedCatalog}がオブジェクトではありません`);
  const record = value as Record<string, unknown>;
  if (record.formatVersion !== 1) throw new Error(`${expectedCatalog}の形式バージョンに対応していません`);
  if (record.catalog !== expectedCatalog) throw new Error(`${expectedCatalog}のカタログ名が一致しません`);
  if (!Array.isArray(record.items)) throw new Error(`${expectedCatalog}にitemsがありません`);
  return value as CatalogFile<T>;
}

function indexById<T extends { id: string }>(items: T[], name: string): Map<string, T> {
  const index = new Map<string, T>();
  for (const item of items) {
    if (!item.id) throw new Error(`${name}にIDのない項目があります`);
    if (index.has(item.id)) throw new Error(`${name}でIDが重複しています: ${item.id}`);
    index.set(item.id, item);
  }
  return index;
}

export class VehicleCatalog {
  readonly manufacturers: VehicleManufacturer[];
  readonly couplerSystems: CouplerSystem[];
  readonly brakeSystems: BrakeSystem[];
  readonly locomotives: VehicleDesign[];
  readonly poweredCars: VehicleDesign[];
  readonly coaches: VehicleDesign[];
  readonly wagons: VehicleDesign[];
  readonly vehicleDesigns: VehicleDesign[];
  private readonly couplersById: Map<string, CouplerSystem>;
  private readonly brakesById: Map<string, BrakeSystem>;
  private readonly vehiclesById: Map<string, VehicleDesign>;

  constructor(
    manufacturers: VehicleManufacturer[],
    couplerSystems: CouplerSystem[],
    brakeSystems: BrakeSystem[],
    locomotives: VehicleDesign[],
    poweredCars: VehicleDesign[],
    coaches: VehicleDesign[],
    wagons: VehicleDesign[],
  ) {
    this.manufacturers = manufacturers;
    this.couplerSystems = couplerSystems;
    this.brakeSystems = brakeSystems;
    this.locomotives = locomotives;
    this.poweredCars = poweredCars;
    this.coaches = coaches;
    this.wagons = wagons;
    this.vehicleDesigns = [...locomotives, ...poweredCars, ...coaches, ...wagons];

    const manufacturersById = indexById(manufacturers, "車両製造会社カタログ");
    this.couplersById = indexById(couplerSystems, "連結器カタログ");
    this.brakesById = indexById(brakeSystems, "ブレーキカタログ");
    this.vehiclesById = indexById(this.vehicleDesigns, "車両設計カタログ");

    for (const coupler of couplerSystems) {
      for (const compatibleId of coupler.directlyCompatibleWithIds) {
        const other = this.couplersById.get(compatibleId);
        if (!other) throw new Error(`${coupler.id}の互換連結器が存在しません: ${compatibleId}`);
        if (!other.directlyCompatibleWithIds.includes(coupler.id)) {
          throw new Error(`連結器の直接互換性が非対称です: ${coupler.id} / ${other.id}`);
        }
      }
    }

    for (const vehicle of this.vehicleDesigns) {
      if (!manufacturersById.has(vehicle.manufacturerId)) {
        throw new Error(`${vehicle.id}の製造会社が存在しません: ${vehicle.manufacturerId}`);
      }
      for (const endName of ["front", "rear"] as const) {
        const end = vehicle.connections[endName];
        this.validateConnectionEnd(end, `${vehicle.id}の${endName}側`);
      }
    }
  }

  getVehicleDesign(id: string): VehicleDesign {
    const vehicle = this.vehiclesById.get(id);
    if (!vehicle) throw new Error(`車両設計が存在しません: ${id}`);
    return vehicle;
  }

  validateConnectionEnd(end: VehicleConnectionEnd, ownerName = "接続端"): void {
    if (!this.couplersById.has(end.couplerSystemId)) {
      throw new Error(`${ownerName}の連結器が存在しません: ${end.couplerSystemId}`);
    }
    for (const brakeId of end.throughBrakeSystemIds) {
      if (!this.brakesById.has(brakeId)) throw new Error(`${ownerName}のブレーキ方式が存在しません: ${brakeId}`);
    }
  }

  checkConnection(
    firstVehicleId: string,
    firstEndName: VehicleEndName,
    secondVehicleId: string,
    secondEndName: VehicleEndName,
    policy: ConnectionPolicy,
  ): VehicleConnectionCompatibility {
    const firstEnd = this.getVehicleDesign(firstVehicleId).connections[firstEndName];
    const secondEnd = this.getVehicleDesign(secondVehicleId).connections[secondEndName];
    return this.checkConnectionEnds(firstEnd, secondEnd, policy);
  }

  checkConnectionEnds(
    firstEnd: VehicleConnectionEnd,
    secondEnd: VehicleConnectionEnd,
    policy: ConnectionPolicy,
  ): VehicleConnectionCompatibility {
    const firstCoupler = this.couplersById.get(firstEnd.couplerSystemId);
    if (!firstCoupler) throw new Error(`連結器が存在しません: ${firstEnd.couplerSystemId}`);

    const mechanicallyCompatible = firstCoupler.directlyCompatibleWithIds.includes(secondEnd.couplerSystemId);
    const secondBrakeIds = new Set(secondEnd.throughBrakeSystemIds);
    const commonThroughBrakeSystemIds = firstEnd.throughBrakeSystemIds.filter((id) => secondBrakeIds.has(id));
    const throughBrakeCompatible = commonThroughBrakeSystemIds.length > 0;
    const violations: VehicleConnectionViolation[] = [];

    if (!mechanicallyCompatible) {
      violations.push({
        type: "coupler-incompatible",
        firstCouplerSystemId: firstEnd.couplerSystemId,
        secondCouplerSystemId: secondEnd.couplerSystemId,
      });
    }
    if (policy.requireThroughBrake && !throughBrakeCompatible) {
      violations.push({ type: "through-brake-incompatible" });
    }

    return {
      compatible: mechanicallyCompatible && (!policy.requireThroughBrake || throughBrakeCompatible),
      mechanicallyCompatible,
      throughBrakeCompatible,
      commonThroughBrakeSystemIds,
      violations,
    };
  }
}

const manufacturers = readCatalog<VehicleManufacturer>(manufacturersYaml, "vehicle-manufacturers").items;
const couplerSystems = readCatalog<CouplerSystem>(couplerSystemsYaml, "vehicle-coupler-systems").items;
const brakeSystems = readCatalog<BrakeSystem>(brakeSystemsYaml, "vehicle-brake-systems").items;
const locomotives = readCatalog<VehicleDesign>(locomotivesYaml, "vehicle-locomotives").items;
const poweredCars = readCatalog<VehicleDesign>(poweredCarsYaml, "vehicle-powered-cars").items;
const coaches = readCatalog<VehicleDesign>(coachesYaml, "vehicle-coaches").items;
const wagons = readCatalog<VehicleDesign>(wagonsYaml, "vehicle-wagons").items;

export const vehicleCatalog = new VehicleCatalog(
  manufacturers,
  couplerSystems,
  brakeSystems,
  locomotives,
  poweredCars,
  coaches,
  wagons,
);
