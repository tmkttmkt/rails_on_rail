import { parse } from "yaml";
import railProfilesYaml from "../../data/track/rail-profiles.yaml?raw";
import roadbedsYaml from "../../data/track/roadbeds.yaml?raw";
import standardsYaml from "../../data/track/standards.yaml?raw";
import supportSystemsYaml from "../../data/track/support-systems.yaml?raw";
import gaugesYaml from "../../data/track/gauges.yaml?raw";
import turnoutsYaml from "../../data/track/turnouts.yaml?raw";

export interface TrackGauge {
  id: string;
  name: string;
  gaugeMm: number;
}

export interface RailProfile {
  id: string;
  name: string;
  profileFamily: string;
}

export interface TrackSupportSystem {
  id: string;
  name: string;
  compatibleProfileFamilies: string[];
}

export interface Roadbed {
  id: string;
  name: string;
}

export interface TurnoutType {
  id: string;
  name: string;
  frogNumber: number;
  divergingRadiusM: number;
  divergingSpeedKmh: number;
}

export interface TrackStandard {
  id: string;
  name: string;
  gaugeId: string;
  railProfileId: string;
  supportSystemId: string;
  roadbedId: string;
}

export interface TrackSpecification {
  gaugeId: string;
  railProfileId: string;
  supportSystemId: string;
  roadbedId: string;
}

interface CatalogFile<T> {
  formatVersion: number;
  catalog: string;
  items: T[];
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

function indexById<T extends { id: string }>(items: T[], catalogName: string): Map<string, T> {
  const index = new Map<string, T>();
  for (const item of items) {
    if (!item.id) throw new Error(`${catalogName}にIDのない項目があります`);
    if (index.has(item.id)) throw new Error(`${catalogName}でIDが重複しています: ${item.id}`);
    index.set(item.id, item);
  }
  return index;
}

export class TrackCatalog {
  readonly gauges: TrackGauge[];
  readonly railProfiles: RailProfile[];
  readonly supportSystems: TrackSupportSystem[];
  readonly roadbeds: Roadbed[];
  readonly standards: TrackStandard[];
  readonly turnoutTypes: TurnoutType[];
  private readonly turnoutTypesById: Map<string, TurnoutType>;
  private readonly railProfilesById: Map<string, RailProfile>;
  private readonly gaugesById: Map<string, TrackGauge>;
  private readonly supportSystemsById: Map<string, TrackSupportSystem>;
  private readonly roadbedsById: Map<string, Roadbed>;

  constructor(
    gauges: TrackGauge[],
    railProfiles: RailProfile[],
    supportSystems: TrackSupportSystem[],
    roadbeds: Roadbed[],
    standards: TrackStandard[],
    turnoutTypes: TurnoutType[],
  ) {
    this.gauges = gauges;
    this.railProfiles = railProfiles;
    this.supportSystems = supportSystems;
    this.roadbeds = roadbeds;
    this.standards = standards;
    this.turnoutTypes = turnoutTypes;
    this.turnoutTypesById = indexById(turnoutTypes, "転てつ器カタログ");
    this.gaugesById = indexById(gauges, "軌間カタログ");
    this.railProfilesById = indexById(railProfiles, "レールカタログ");
    this.supportSystemsById = indexById(supportSystems, "軌道支持方式カタログ");
    this.roadbedsById = indexById(roadbeds, "路盤カタログ");
    indexById(standards, "軌道構成プリセット");
    for (const standard of standards) this.validateSpecification(standard);
  }

  getRailProfile(id: string): RailProfile {
    const item = this.railProfilesById.get(id);
    if (!item) throw new Error(`レール形式が存在しません: ${id}`);
    return item;
  }

  getGauge(id: string): TrackGauge {
    const item = this.gaugesById.get(id);
    if (!item) throw new Error(`軌間が存在しません: ${id}`);
    return item;
  }

  getSupportSystem(id: string): TrackSupportSystem {
    const item = this.supportSystemsById.get(id);
    if (!item) throw new Error(`軌道支持方式が存在しません: ${id}`);
    return item;
  }

  getTurnoutType(id: string): TurnoutType {
    const item = this.turnoutTypesById.get(id);
    if (!item) throw new Error(`転てつ器形式が存在しません: ${id}`);
    return item;
  }

  getRoadbed(id: string): Roadbed {
    const item = this.roadbedsById.get(id);
    if (!item) throw new Error(`路盤が存在しません: ${id}`);
    return item;
  }

  validateSpecification(specification: TrackSpecification): void {
    this.getGauge(specification.gaugeId);
    const rail = this.getRailProfile(specification.railProfileId);
    const support = this.getSupportSystem(specification.supportSystemId);
    this.getRoadbed(specification.roadbedId);
    if (!support.compatibleProfileFamilies.includes(rail.profileFamily)) {
      throw new Error(`${rail.name}は${support.name}に対応していません`);
    }
  }

  compatibleSupportSystems(railProfileId: string): TrackSupportSystem[] {
    const family = this.getRailProfile(railProfileId).profileFamily;
    return this.supportSystems.filter((support) => support.compatibleProfileFamilies.includes(family));
  }

  defaultSpecification(): TrackSpecification {
    const standard = this.standards[0];
    if (!standard) throw new Error("既定の軌道構成プリセットがありません");
    return {
      gaugeId: standard.gaugeId,
      railProfileId: standard.railProfileId,
      supportSystemId: standard.supportSystemId,
      roadbedId: standard.roadbedId,
    };
  }
}

const turnoutTypes = readCatalog<TurnoutType>(turnoutsYaml, "turnouts").items;
const gauges = readCatalog<TrackGauge>(gaugesYaml, "track-gauges").items;
const railProfiles = readCatalog<RailProfile>(railProfilesYaml, "rail-profiles").items;
const supportSystems = readCatalog<TrackSupportSystem>(supportSystemsYaml, "track-support-systems").items;
const roadbeds = readCatalog<Roadbed>(roadbedsYaml, "track-roadbeds").items;
const standards = readCatalog<TrackStandard>(standardsYaml, "track-standards").items;

export const trackCatalog = new TrackCatalog(gauges, railProfiles, supportSystems, roadbeds, standards, turnoutTypes);
