import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { loadGuidesIndex, findGuidesForInterface } from "./guides.js";
import { loadMembersIndex, getTopMembersWithExamples, listInterfaceMembers } from "./members.js";
import { loadCodeExamplesIndex } from "./code-examples.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DocIndexEntry {
  path: string;
  description: string;
  properties: string[];
  methods: string[];
}

export type DocsIndex = Record<string, DocIndexEntry>;

/**
 * Загружает индекс документации
 */
export function loadDocsIndex(): DocsIndex {
  const indexPath = path.join(__dirname, "..", "data", "docs-index.json");
  
  if (!fs.existsSync(indexPath)) {
    console.error(`Docs index not found at: ${indexPath}`);
    return {};
  }
  
  const content = fs.readFileSync(indexPath, "utf8");
  return JSON.parse(content);
}

/**
 * Поиск по документации
 */
export function searchDocs(index: DocsIndex, query: string, limit: number = 10): SearchResult[] {
  const results: SearchResult[] = [];
  const queryLower = query.toLowerCase();
  
  for (const [name, entry] of Object.entries(index)) {
    // Пропускаем свойства/методы (содержат точку)
    if (name.includes(".")) continue;
    
    let score = 0;
    
    // Точное совпадение имени
    if (name.toLowerCase() === queryLower) {
      score = 100;
    }
    // Имя начинается с запроса
    else if (name.toLowerCase().startsWith(queryLower)) {
      score = 80;
    }
    // Имя содержит запрос
    else if (name.toLowerCase().includes(queryLower)) {
      score = 60;
    }
    // Описание содержит запрос
    else if (entry.description?.toLowerCase().includes(queryLower)) {
      score = 40;
    }
    // Свойства или методы содержат запрос
    else if (
      entry.properties?.some(p => p.toLowerCase().includes(queryLower)) ||
      entry.methods?.some(m => m.toLowerCase().includes(queryLower))
    ) {
      score = 20;
    }
    
    if (score > 0) {
      results.push({
        name,
        score,
        description: entry.description || "",
        type: name.startsWith("I") ? "interface" : name.endsWith("Class") ? "class" : "other",
        propertiesCount: entry.properties?.length || 0,
        methodsCount: entry.methods?.length || 0,
      });
    }
  }
  
  // Сортируем по score и берем limit результатов
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

export interface SearchResult {
  name: string;
  score: number;
  description: string;
  type: "interface" | "class" | "other";
  propertiesCount: number;
  methodsCount: number;
}

/**
 * Получает подробную информацию об интерфейсе
 */
export async function getInterfaceInfo(index: DocsIndex, name: string): Promise<string> {
  const entry = index[name];
  
  if (!entry) {
    // Попробуем найти похожие
    const similar = searchDocs(index, name, 5);
    if (similar.length > 0) {
      return `Interface "${name}" not found. Did you mean:\n${similar.map(s => `- ${s.name}: ${s.description}`).join("\n")}`;
    }
    return `Interface "${name}" not found in documentation.`;
  }
  
  // Читаем markdown файл для полного описания
  const docsPath = path.join(__dirname, "..", "docs", entry.path);
  let fullDescription = entry.description;
  
  if (fs.existsSync(docsPath)) {
    const content = fs.readFileSync(docsPath, "utf8");
    fullDescription = content;
  }
  
  let result = `# ${name}\n\n`;
  
  if (entry.description) {
    result += `## Description\n${entry.description}\n\n`;
  }
  
  if (entry.properties && entry.properties.length > 0) {
    result += `## Properties (${entry.properties.length})\n`;
    result += entry.properties.map(p => `- \`${p}\``).join("\n");
    result += "\n\n";
  }
  
  if (entry.methods && entry.methods.length > 0) {
    result += `## Methods (${entry.methods.length})\n`;
    result += entry.methods.map(m => `- \`${m}()\``).join("\n");
    result += "\n\n";
  }

  const guidesIndex = loadGuidesIndex();
  const membersIndex = loadMembersIndex();
  const examplesIndex = loadCodeExamplesIndex();

  const relatedGuides = findGuidesForInterface(guidesIndex, name, 5);
  if (relatedGuides.length > 0) {
    result += `## Related Guides\n`;
    for (const g of relatedGuides) {
      result += `- **${g.title}** (${g.type}) — docs/${g.path}\n`;
      if (g.summary) result += `  ${g.summary.slice(0, 120)}...\n`;
    }
    result += "\n";
  }

  const membersWithExamples = getTopMembersWithExamples(membersIndex, name, 10);
  const allMembers = listInterfaceMembers(membersIndex, name);
  if (allMembers.length > 0) {
    result += `## Members (${allMembers.length} total`;
    if (membersWithExamples.length > 0) {
      result += `, ${membersWithExamples.length} with examples`;
    }
    result += `)\n`;
    const shown = membersWithExamples.length > 0 ? membersWithExamples : allMembers.slice(0, 15);
    for (const m of shown) {
      result += `- \`${m.id}\` (${m.memberType})`;
      if (m.hasExample) result += ` [example]`;
      if (m.description) result += ` — ${m.description.slice(0, 80)}`;
      result += `\n`;
    }
    result += "\n";
  }

  const exampleCount = examplesIndex.byEntity[name]?.length ?? 0;
  if (exampleCount > 0) {
    result += `## Code Examples\n`;
    result += `${exampleCount} пример(ов) в базе. Используйте get_code_examples("${name}").\n\n`;
  }
  
  result += `## Full Documentation\n\n${fullDescription}`;
  
  return result;
}

// getCodeExamples перенесён в code-examples.ts

