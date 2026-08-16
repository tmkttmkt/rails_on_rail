import { parse } from "yaml";
import formationTemplatesYaml from "../../data/vehicles/formation-templates.yaml?raw";
import type { Orientation } from "../simulation/fleet";

export interface FormationTemplateItem {
  designId: string;
  orientation: Orientation;
}

export interface FormationTemplate {
  id: string;
  name: string;
  vehicles: FormationTemplateItem[];
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

export class FormationTemplateCatalog {
  readonly templates: FormationTemplate[];
  private readonly templatesById: Map<string, FormationTemplate>;

  constructor(templates: FormationTemplate[]) {
    this.templates = templates;
    this.templatesById = new Map();
    for (const template of templates) {
      if (!template.id) throw new Error("編成テンプレートにIDのない項目があります");
      if (this.templatesById.has(template.id)) throw new Error(`編成テンプレートでIDが重複しています: ${template.id}`);
      this.templatesById.set(template.id, template);
    }
  }

  getTemplate(id: string): FormationTemplate {
    const template = this.templatesById.get(id);
    if (!template) throw new Error(`完成編成テンプレートが存在しません: ${id}`);
    return template;
  }
}

const templatesData = readCatalog<FormationTemplate>(formationTemplatesYaml, "vehicle-formation-templates").items;
export const formationTemplateCatalog = new FormationTemplateCatalog(templatesData);
