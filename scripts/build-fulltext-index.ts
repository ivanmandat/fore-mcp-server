#!/usr/bin/env tsx
/**
 * Полнотекстовый индекс docs/ — проза без tab-кода и fenced-блоков.
 * Запуск: npx tsx scripts/build-fulltext-index.ts
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  extractTitle,
  extractH2Headings,
  extractRelatedInterfaces,
  extractSearchableText,
  walkMarkdownFiles,
} from "./lib/markdown-parse.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCS_DIR = path.join(__dirname, "..", "docs");
const OUTPUT_PATH = path.join(__dirname, "..", "data", "fulltext-index.json");

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

function classifyDoc(relativePath: string): FulltextDocType {
  const normalized = relativePath.replace(/\\/g, "/");
  const basename = path.basename(normalized);

  if (normalized.includes("/Intro/")) return "guide";
  if (normalized.includes("/Samples/")) return "tutorial";
  if (/_Programming/i.test(basename)) return "programming";
  if (basename === "README.md") return "module-overview";

  if (normalized.includes("/Interface/") || normalized.includes("/Class/")) {
    return basename.includes(".") ? "member" : "api";
  }

  return "doc";
}

function buildIndex(): FulltextIndex {
  const files = walkMarkdownFiles(DOCS_DIR);
  const documents: FulltextEntry[] = [];

  for (const relativePath of files) {
    const fullPath = path.join(DOCS_DIR, relativePath);
    const content = fs.readFileSync(fullPath, "utf8");
    const normalizedPath = relativePath.replace(/\\/g, "/");
    const module = normalizedPath.split("/")[0];
    const title = extractTitle(content) || path.basename(normalizedPath, ".md");
    const headings = extractH2Headings(content);
    const bodyText = extractSearchableText(content);

    if (!bodyText && !title) continue;

    documents.push({
      id: normalizedPath.replace(/\.md$/, ""),
      path: normalizedPath,
      module,
      docType: classifyDoc(normalizedPath),
      title,
      headings,
      bodyText,
      relatedInterfaces: extractRelatedInterfaces(content),
    });
  }

  const byModule: Record<string, string[]> = {};
  const byType: Record<string, string[]> = {};

  for (const doc of documents) {
    if (!byModule[doc.module]) byModule[doc.module] = [];
    byModule[doc.module].push(doc.id);

    if (!byType[doc.docType]) byType[doc.docType] = [];
    byType[doc.docType].push(doc.id);
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    totalDocuments: documents.length,
    documents,
    byModule,
    byType,
  };
}

function main() {
  console.error("Building fulltext index...");
  const index = buildIndex();

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(index), "utf8");

  const sizeMb = (fs.statSync(OUTPUT_PATH).size / 1024 / 1024).toFixed(1);
  console.error(`Done: ${index.totalDocuments} documents (${sizeMb} MB)`);
  console.error(`Output: ${OUTPUT_PATH}`);
}

main();
