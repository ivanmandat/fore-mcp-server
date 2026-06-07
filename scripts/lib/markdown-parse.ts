/**
 * Общие утилиты парсинга markdown из docs/ (переиспользуются в build-*-index.ts).
 */

export function normalizeText(text: string): string {
  return text.replace(/\u00a0/g, " ");
}

export function normalizeRussian(text: string): string {
  return normalizeText(text).toLowerCase().replace(/ё/g, "е");
}

export function extractTitle(content: string): string {
  const match = normalizeText(content).match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "";
}

export function extractDescription(content: string): string {
  const normalized = normalizeText(content);
  const descMatch = normalized.match(/^## Описание\s*\n+([\s\S]*?)(?=^## |$)/m);
  if (descMatch) {
    return descMatch[1].replace(/\s+/g, " ").trim().slice(0, 400);
  }
  const lines = normalized.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed &&
      !trimmed.startsWith("#") &&
      !trimmed.startsWith("!") &&
      !trimmed.startsWith("\t") &&
      !trimmed.startsWith("-") &&
      trimmed.length > 20
    ) {
      return trimmed.slice(0, 400);
    }
  }
  return "";
}

export function extractH2Headings(content: string): string[] {
  const normalized = normalizeText(content);
  const headings: string[] = [];
  for (const match of normalized.matchAll(/^## (.+)$/gm)) {
    const h = match[1].trim();
    if (h && !["Синтаксис", "Описание", "Параметры", "Пример", "См. также"].includes(h)) {
      headings.push(h);
    }
  }
  return headings;
}

export function extractSection(content: string, sectionName: string): string {
  const normalized = normalizeText(content);
  const regex = new RegExp(`^## ${sectionName}\\s*\\n+([\\s\\S]*?)(?=^## |$)`, "m");
  const match = normalized.match(regex);
  if (!match) return "";
  return match[1].replace(/\s+/g, " ").trim();
}

export function tokenize(text: string): string[] {
  return normalizeRussian(text)
    .split(/[\s,;.!?()[\]{}«»"']+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

const INTERFACE_RE = /\bI[A-Z][A-Za-z0-9]+\b/g;
const KNOWN_ENTITIES = [
  "ReportEvents",
  "MetabaseClass",
  "PrxReport",
  "EventsClass",
  "FormEvents",
  "Debug",
];

export function extractRelatedInterfaces(content: string): string[] {
  const found = new Set<string>();
  const text = normalizeText(content);

  for (const m of text.matchAll(INTERFACE_RE)) {
    found.add(m[0]);
  }
  for (const entity of KNOWN_ENTITIES) {
    if (text.includes(entity)) found.add(entity);
  }

  return [...found].slice(0, 30);
}

import * as fs from "fs";
import * as path from "path";

/** Извлекает прозу для полнотекстового поиска — без fenced-блоков и tab-кода. */
export function extractSearchableText(content: string, maxLen = 3000): string {
  let text = normalizeText(content);

  text = text.replace(/```[\s\S]*?```/g, " ");
  text = text
    .split("\n")
    .filter((line) => !line.startsWith("\t"))
    .join("\n");
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/^#{1,6}\s+/gm, "");
  text = text.replace(/<[^>]+>/g, " ");

  return text.replace(/\s+/g, " ").trim().slice(0, maxLen);
}

export function walkMarkdownFiles(dir: string, base: string = dir): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkMarkdownFiles(fullPath, base));
    } else if (entry.name.endsWith(".md")) {
      results.push(path.relative(base, fullPath));
    }
  }
  return results;
}
