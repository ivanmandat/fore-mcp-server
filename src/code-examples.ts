import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CodeExample {
  id: string;
  sourcePath: string;
  language: "fore" | "javascript" | "html" | "other";
  entityType: string;
  entityName: string;
  parentEntity: string | null;
  memberName: string | null;
  module: string;
  title: string;
  description: string;
  code: string;
  keywords: string[];
}

export interface CodeExamplesIndex {
  version: number;
  generatedAt: string;
  totalExamples: number;
  totalFiles: number;
  examples: CodeExample[];
  byEntity: Record<string, string[]>;
  byModule: Record<string, string[]>;
}

export interface CodeExampleSearchResult {
  id: string;
  score: number;
  entityName: string;
  parentEntity: string | null;
  memberName: string | null;
  entityType: string;
  module: string;
  language: string;
  title: string;
  description: string;
  codePreview: string;
  sourcePath: string;
}

let cachedIndex: CodeExamplesIndex | null = null;
let examplesById: Map<string, CodeExample> | null = null;

export function loadCodeExamplesIndex(): CodeExamplesIndex {
  if (cachedIndex) return cachedIndex;

  const indexPath = path.join(__dirname, "..", "data", "code-examples-index.json");

  if (!fs.existsSync(indexPath)) {
    console.error(`Code examples index not found at: ${indexPath}`);
    return {
      version: 1,
      generatedAt: "",
      totalExamples: 0,
      totalFiles: 0,
      examples: [],
      byEntity: {},
      byModule: {},
    };
  }

  const content = fs.readFileSync(indexPath, "utf8");
  cachedIndex = JSON.parse(content) as CodeExamplesIndex;
  examplesById = new Map(cachedIndex.examples.map((ex) => [ex.id, ex]));
  return cachedIndex;
}

export function getExampleById(id: string): CodeExample | null {
  loadCodeExamplesIndex();
  return examplesById?.get(id) ?? null;
}

function makePreview(code: string, maxLen = 200): string {
  const oneLine = code.replace(/\s+/g, " ").trim();
  return oneLine.length > maxLen ? oneLine.slice(0, maxLen) + "..." : oneLine;
}

export function searchCodeExamples(
  index: CodeExamplesIndex,
  query: string,
  options: {
    limit?: number;
    language?: string;
    module?: string;
    entityType?: string;
  } = {}
): CodeExampleSearchResult[] {
  const { limit = 10, language, module, entityType } = options;
  const queryLower = query.toLowerCase().trim();
  const results: CodeExampleSearchResult[] = [];

  const candidateIds = new Set<string>();

  if (index.byEntity[query]) {
    index.byEntity[query].forEach((id) => candidateIds.add(id));
  }

  const dotQuery = query.includes(".") ? query : null;
  if (dotQuery && index.byEntity[dotQuery]) {
    index.byEntity[dotQuery].forEach((id) => candidateIds.add(id));
  }

  for (const [entityName, ids] of Object.entries(index.byEntity)) {
    if (entityName.toLowerCase().includes(queryLower)) {
      ids.forEach((id) => candidateIds.add(id));
    }
  }

  const examplesToSearch =
    candidateIds.size > 0
      ? [...candidateIds].map((id) => examplesById!.get(id)!).filter(Boolean)
      : index.examples;

  for (const ex of examplesToSearch) {
    if (language && ex.language !== language) continue;
    if (module && ex.module.toLowerCase() !== module.toLowerCase()) continue;
    if (entityType && ex.entityType !== entityType) continue;

    let score = 0;

    if (ex.entityName.toLowerCase() === queryLower) score = 100;
    else if (ex.parentEntity && `${ex.parentEntity}.${ex.memberName}`.toLowerCase() === queryLower) score = 95;
    else if (ex.parentEntity?.toLowerCase() === queryLower) score = 85;
    else if (ex.memberName?.toLowerCase() === queryLower) score = 80;
    else if (ex.entityName.toLowerCase().startsWith(queryLower)) score = 70;
    else if (ex.parentEntity?.toLowerCase().includes(queryLower)) score = 60;
    else if (ex.memberName?.toLowerCase().includes(queryLower)) score = 55;
    else if (ex.entityName.toLowerCase().includes(queryLower)) score = 50;
    else if (ex.keywords.some((k) => k.toLowerCase() === queryLower)) score = 45;
    else if (ex.keywords.some((k) => k.toLowerCase().includes(queryLower))) score = 35;
    else if (ex.title.toLowerCase().includes(queryLower)) score = 30;
    else if (ex.description.toLowerCase().includes(queryLower)) score = 25;
    else if (ex.code.toLowerCase().includes(queryLower)) score = 20;
    else if (ex.module.toLowerCase().includes(queryLower)) score = 15;

    if (score > 0) {
      results.push({
        id: ex.id,
        score,
        entityName: ex.entityName,
        parentEntity: ex.parentEntity,
        memberName: ex.memberName,
        entityType: ex.entityType,
        module: ex.module,
        language: ex.language,
        title: ex.title,
        description: ex.description,
        codePreview: makePreview(ex.code),
        sourcePath: ex.sourcePath,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

export function getCodeExamplesForEntity(
  index: CodeExamplesIndex,
  entity: string,
  limit = 5
): string {
  const entityLower = entity.toLowerCase();
  const ids = new Set<string>();

  for (const [name, exampleIds] of Object.entries(index.byEntity)) {
    if (name.toLowerCase() === entityLower || name.toLowerCase().includes(entityLower)) {
      exampleIds.forEach((id) => ids.add(id));
    }
  }

  if (ids.size === 0) {
    const searchResults = searchCodeExamples(index, entity, { limit });
    if (searchResults.length === 0) {
      return `Примеры кода для "${entity}" не найдены. Используйте search_code_examples для поиска. Всего в базе: ${index.totalExamples} примеров.`;
    }
    searchResults.forEach((r) => ids.add(r.id));
  }

  const examples = [...ids]
    .map((id) => getExampleById(id))
    .filter((ex): ex is CodeExample => ex !== null)
    .slice(0, limit);

  if (examples.length === 0) {
    return `Примеры кода для "${entity}" не найдены.`;
  }

  let result = `# Примеры кода: ${entity}\n\nНайдено: ${examples.length} из ${ids.size}\n\n`;

  for (const ex of examples) {
    result += `## ${ex.title}`;
    if (ex.memberName) result += ` — ${ex.parentEntity}.${ex.memberName}`;
    result += `\n\n`;
    result += `**Модуль:** ${ex.module} | **Тип:** ${ex.entityType} | **Язык:** ${ex.language}\n`;
    if (ex.description) result += `**Описание:** ${ex.description}\n`;
    result += `**Источник:** docs/${ex.sourcePath}\n\n`;
    result += "```" + ex.language + "\n";
    result += ex.code + "\n";
    result += "```\n\n";
  }

  return result;
}

export function formatExampleDetails(ex: CodeExample): string {
  let result = `# ${ex.title}\n\n`;
  result += `**Сущность:** ${ex.entityName}\n`;
  if (ex.parentEntity) result += `**Родитель:** ${ex.parentEntity}\n`;
  if (ex.memberName) result += `**Член:** ${ex.memberName}\n`;
  result += `**Модуль:** ${ex.module} | **Тип:** ${ex.entityType} | **Язык:** ${ex.language}\n`;
  if (ex.description) result += `**Описание:** ${ex.description}\n`;
  result += `**Источник:** docs/${ex.sourcePath}\n\n`;
  result += "```" + ex.language + "\n";
  result += ex.code + "\n";
  result += "```\n";
  return result;
}
