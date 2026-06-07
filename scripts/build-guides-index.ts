#!/usr/bin/env tsx
/**
 * Индексирует руководства (Intro, Samples, Programming, module README).
 * Запуск: npx tsx scripts/build-guides-index.ts
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  normalizeText,
  extractTitle,
  extractDescription,
  extractH2Headings,
  extractRelatedInterfaces,
  tokenize,
  walkMarkdownFiles,
} from "./lib/markdown-parse.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCS_DIR = path.join(__dirname, "..", "docs");
const OUTPUT_PATH = path.join(__dirname, "..", "data", "guides-index.json");
const CODE_EXAMPLES_PATH = path.join(__dirname, "..", "data", "code-examples-index.json");

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

function classifyGuide(relativePath: string): GuideType | null {
  const normalized = relativePath.replace(/\\/g, "/");
  const parts = normalized.split("/");

  if (parts.length === 2 && parts[1] === "README.md") {
    return "module-overview";
  }
  if (normalized.includes("/Intro/")) {
    return "guide";
  }
  if (normalized.includes("/Samples/")) {
    return "tutorial";
  }
  if (/_Programming/i.test(path.basename(normalized))) {
    return "programming";
  }
  return null;
}

function buildTopics(title: string, summary: string, h2s: string[]): string[] {
  const tokens = new Set<string>();
  for (const source of [title, summary, ...h2s]) {
    for (const t of tokenize(source)) {
      tokens.add(t);
    }
  }
  return [...tokens].slice(0, 40);
}

function loadCodeExamplePaths(): Set<string> {
  if (!fs.existsSync(CODE_EXAMPLES_PATH)) return new Set();
  const index = JSON.parse(fs.readFileSync(CODE_EXAMPLES_PATH, "utf8"));
  return new Set(
    (index.examples as { sourcePath: string }[]).map((ex) =>
      ex.sourcePath.replace(/\\/g, "/")
    )
  );
}

function buildIndex(): GuidesIndex {
  const files = walkMarkdownFiles(DOCS_DIR);
  const examplePaths = loadCodeExamplePaths();
  const guides: GuideEntry[] = [];

  for (const relativePath of files) {
    const guideType = classifyGuide(relativePath);
    if (!guideType) continue;

    const fullPath = path.join(DOCS_DIR, relativePath);
    const content = fs.readFileSync(fullPath, "utf8");
    const normalizedPath = relativePath.replace(/\\/g, "/");
    const module = normalizedPath.split("/")[0];
    const title = extractTitle(content) || path.basename(normalizedPath, ".md");
    const summary = extractDescription(content);
    const h2s = extractH2Headings(content);

    guides.push({
      id: normalizedPath.replace(/\.md$/, ""),
      path: normalizedPath,
      module,
      type: guideType,
      title,
      summary,
      topics: buildTopics(title, summary, h2s),
      relatedInterfaces: extractRelatedInterfaces(content),
      hasCodeExamples: examplePaths.has(normalizedPath),
    });
  }

  const byModule: Record<string, string[]> = {};
  const byType: Record<string, string[]> = {};

  for (const g of guides) {
    if (!byModule[g.module]) byModule[g.module] = [];
    byModule[g.module].push(g.id);

    if (!byType[g.type]) byType[g.type] = [];
    byType[g.type].push(g.id);
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    totalGuides: guides.length,
    guides,
    byModule,
    byType,
  };
}

function main() {
  console.error("Building guides index...");
  const index = buildIndex();

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(index, null, 2), "utf8");

  console.error(`Done: ${index.totalGuides} guides`);
  console.error(`By type: ${JSON.stringify(index.byType, null, 0).replace(/\n/g, " ")}`);
  console.error(`Output: ${OUTPUT_PATH}`);
}

main();
