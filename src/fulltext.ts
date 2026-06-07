import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type FulltextDocType =
  | "guide"
  | "tutorial"
  | "programming"
  | "module-overview"
  | "member"
  | "api"
  | "doc";

export interface FulltextEntry {
  id: string;
  path: string;
  module: string;
  docType: FulltextDocType;
  title: string;
  headings: string[];
  bodyText: string;
  relatedInterfaces: string[];
}

export interface FulltextIndex {
  version: number;
  generatedAt: string;
  totalDocuments: number;
  documents: FulltextEntry[];
  byModule: Record<string, string[]>;
  byType: Record<string, string[]>;
}

export interface FulltextSearchResult {
  id: string;
  score: number;
  path: string;
  module: string;
  docType: FulltextDocType;
  title: string;
  snippet: string;
  relatedInterfaces: string[];
}

let cachedIndex: FulltextIndex | null = null;

function normalizeRussian(text: string): string {
  return text.toLowerCase().replace(/ё/g, "е");
}

function tokenize(text: string): string[] {
  return normalizeRussian(text)
    .split(/[\s,;.!?()[\]{}«»"']+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

export function loadFulltextIndex(): FulltextIndex {
  if (cachedIndex) return cachedIndex;

  const indexPath = path.join(__dirname, "..", "data", "fulltext-index.json");
  if (!fs.existsSync(indexPath)) {
    console.error(`Fulltext index not found at: ${indexPath}`);
    return {
      version: 1,
      generatedAt: "",
      totalDocuments: 0,
      documents: [],
      byModule: {},
      byType: {},
    };
  }

  cachedIndex = JSON.parse(fs.readFileSync(indexPath, "utf8")) as FulltextIndex;
  return cachedIndex;
}

function makeSnippet(bodyText: string, queryTokens: string[], maxLen = 200): string {
  if (!bodyText) return "";

  const bodyNorm = normalizeRussian(bodyText);
  let bestPos = -1;

  for (const token of queryTokens) {
    const pos = bodyNorm.indexOf(token);
    if (pos >= 0 && (bestPos < 0 || pos < bestPos)) {
      bestPos = pos;
    }
  }

  if (bestPos < 0) {
    return bodyText.slice(0, maxLen) + (bodyText.length > maxLen ? "..." : "");
  }

  const start = Math.max(0, bestPos - 60);
  const excerpt = bodyText.slice(start, start + maxLen);
  const prefix = start > 0 ? "..." : "";
  const suffix = start + maxLen < bodyText.length ? "..." : "";
  return prefix + excerpt.trim() + suffix;
}

export function searchFulltext(
  index: FulltextIndex,
  query: string,
  options: { limit?: number; module?: string; docType?: FulltextDocType } = {}
): FulltextSearchResult[] {
  const { limit = 10, module, docType } = options;
  const queryNorm = normalizeRussian(query);
  const queryTokens = tokenize(query);
  const results: FulltextSearchResult[] = [];

  for (const doc of index.documents) {
    if (module && doc.module.toLowerCase() !== module.toLowerCase()) continue;
    if (docType && doc.docType !== docType) continue;

    const titleNorm = normalizeRussian(doc.title);
    const bodyNorm = normalizeRussian(doc.bodyText);
    const headingsNorm = doc.headings.map(normalizeRussian);

    let score = 0;

    if (titleNorm === queryNorm) score = 100;
    else if (titleNorm.includes(queryNorm)) score = 85;
    else if (headingsNorm.some((h) => h.includes(queryNorm))) score = 75;
    else if (bodyNorm.includes(queryNorm)) score = 65;
    else if (doc.relatedInterfaces.some((i) => i.toLowerCase() === queryNorm)) score = 60;

    if (score === 0 && queryTokens.length > 0) {
      let matched = 0;
      for (const token of queryTokens) {
        if (
          titleNorm.includes(token) ||
          bodyNorm.includes(token) ||
          headingsNorm.some((h) => h.includes(token))
        ) {
          matched++;
        }
      }
      if (matched > 0) {
        score = 25 + (matched / queryTokens.length) * 55;
      }
    }

    if (score > 0) {
      results.push({
        id: doc.id,
        score,
        path: doc.path,
        module: doc.module,
        docType: doc.docType,
        title: doc.title,
        snippet: makeSnippet(doc.bodyText, queryTokens),
        relatedInterfaces: doc.relatedInterfaces,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

export function getFulltextDocument(idOrPath: string): string | null {
  const index = loadFulltextIndex();
  const normalized = idOrPath.replace(/\\/g, "/").replace(/\.md$/, "");

  const doc =
    index.documents.find((d) => d.id === normalized) ??
    index.documents.find((d) => d.path === idOrPath || d.path === normalized + ".md");

  if (!doc) return null;

  const docsPath = path.join(__dirname, "..", "docs", doc.path);
  if (!fs.existsSync(docsPath)) {
    return `# ${doc.title}\n\nФайл не найден: docs/${doc.path}`;
  }

  const content = fs.readFileSync(docsPath, "utf8");
  return `# ${doc.title}\n\n**Модуль:** ${doc.module} | **Тип:** ${doc.docType}\n**Путь:** docs/${doc.path}\n\n${content}`;
}
