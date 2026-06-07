import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type GuideType = "guide" | "tutorial" | "programming" | "module-overview";

export interface GuideEntry {
  id: string;
  path: string;
  module: string;
  type: GuideType;
  title: string;
  summary: string;
  topics: string[];
  relatedInterfaces: string[];
  hasCodeExamples: boolean;
}

export interface GuidesIndex {
  version: number;
  generatedAt: string;
  totalGuides: number;
  guides: GuideEntry[];
  byModule: Record<string, string[]>;
  byType: Record<string, string[]>;
}

export interface GuideSearchResult {
  id: string;
  score: number;
  path: string;
  module: string;
  type: GuideType;
  title: string;
  summary: string;
  relatedInterfaces: string[];
  hasCodeExamples: boolean;
}

let cachedIndex: GuidesIndex | null = null;
let guidesById: Map<string, GuideEntry> | null = null;

function normalizeRussian(text: string): string {
  return text.toLowerCase().replace(/ё/g, "е");
}

function tokenize(text: string): string[] {
  return normalizeRussian(text)
    .split(/[\s,;.!?()[\]{}«»"']+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

export function loadGuidesIndex(): GuidesIndex {
  if (cachedIndex) return cachedIndex;

  const indexPath = path.join(__dirname, "..", "data", "guides-index.json");
  if (!fs.existsSync(indexPath)) {
    console.error(`Guides index not found at: ${indexPath}`);
    return {
      version: 1,
      generatedAt: "",
      totalGuides: 0,
      guides: [],
      byModule: {},
      byType: {},
    };
  }

  cachedIndex = JSON.parse(fs.readFileSync(indexPath, "utf8")) as GuidesIndex;
  guidesById = new Map(cachedIndex.guides.map((g) => [g.id, g]));
  return cachedIndex;
}

export function searchGuides(
  index: GuidesIndex,
  query: string,
  options: { limit?: number; module?: string; type?: GuideType } = {}
): GuideSearchResult[] {
  const { limit = 10, module, type } = options;
  const queryTokens = tokenize(query);
  const queryNorm = normalizeRussian(query);
  const results: GuideSearchResult[] = [];

  for (const g of index.guides) {
    if (module && g.module.toLowerCase() !== module.toLowerCase()) continue;
    if (type && g.type !== type) continue;

    let score = 0;
    const titleNorm = normalizeRussian(g.title);
    const summaryNorm = normalizeRussian(g.summary);
    const topicsNorm = g.topics.map(normalizeRussian);

    if (titleNorm === queryNorm) score = 100;
    else if (titleNorm.includes(queryNorm)) score = 80;
    else if (summaryNorm.includes(queryNorm)) score = 60;
    else if (g.relatedInterfaces.some((i) => i.toLowerCase() === queryNorm)) score = 70;
    else if (g.relatedInterfaces.some((i) => i.toLowerCase().includes(queryNorm))) score = 50;

    if (score === 0 && queryTokens.length > 0) {
      let matched = 0;
      for (const token of queryTokens) {
        if (
          titleNorm.includes(token) ||
          summaryNorm.includes(token) ||
          topicsNorm.some((t) => t.includes(token) || token.includes(t))
        ) {
          matched++;
        }
      }
      if (matched > 0) {
        score = 30 + (matched / queryTokens.length) * 50;
      }
    }

    if (g.id.toLowerCase().includes(queryNorm)) score = Math.max(score, 40);

    if (score > 0) {
      results.push({
        id: g.id,
        score,
        path: g.path,
        module: g.module,
        type: g.type,
        title: g.title,
        summary: g.summary,
        relatedInterfaces: g.relatedInterfaces,
        hasCodeExamples: g.hasCodeExamples,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

export function getGuide(idOrPath: string): string | null {
  loadGuidesIndex();
  const normalized = idOrPath.replace(/\\/g, "/").replace(/\.md$/, "");
  const guide = guidesById?.get(normalized) ?? guidesById?.get(normalized + ".md");

  if (!guide) {
    const byPath = cachedIndex?.guides.find(
      (g) => g.path === idOrPath || g.path === idOrPath.replace(/\\/g, "/")
    );
    if (!byPath) return null;
    return readGuideContent(byPath);
  }

  return readGuideContent(guide);
}

function readGuideContent(guide: GuideEntry): string {
  const docsPath = path.join(__dirname, "..", "docs", guide.path);
  if (!fs.existsSync(docsPath)) {
    return `# ${guide.title}\n\nФайл не найден: docs/${guide.path}`;
  }
  const content = fs.readFileSync(docsPath, "utf8");
  return `# ${guide.title}\n\n**Модуль:** ${guide.module} | **Тип:** ${guide.type}\n**Путь:** docs/${guide.path}\n\n${content}`;
}

export function listModuleGuides(
  index: GuidesIndex,
  module: string,
  type?: GuideType
): GuideEntry[] {
  const ids = index.byModule[module] ?? [];
  return ids
    .map((id) => guidesById?.get(id))
    .filter((g): g is GuideEntry => g !== undefined && g !== null)
    .filter((g) => !type || g.type === type);
}

export function findGuidesForInterface(index: GuidesIndex, interfaceName: string, limit = 5): GuideEntry[] {
  const nameLower = interfaceName.toLowerCase();
  return index.guides
    .filter((g) => g.relatedInterfaces.some((i) => i.toLowerCase() === nameLower))
    .slice(0, limit);
}
