#!/usr/bin/env tsx
/**
 * Индексирует страницы членов API (Interface/Class *.Member.md).
 * Запуск: npx tsx scripts/build-members-index.ts
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  normalizeText,
  extractTitle,
  extractDescription,
  extractSection,
  walkMarkdownFiles,
} from "./lib/markdown-parse.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCS_DIR = path.join(__dirname, "..", "docs");
const OUTPUT_PATH = path.join(__dirname, "..", "data", "members-index.json");
const CODE_EXAMPLES_PATH = path.join(__dirname, "..", "data", "code-examples-index.json");

export type MemberType = "property" | "method" | "event";

export interface MemberEntry {
  id: string;
  path: string;
  module: string;
  parent: string;
  member: string;
  memberType: MemberType;
  title: string;
  syntax: string;
  description: string;
  hasExample: boolean;
}

export interface MembersIndex {
  version: number;
  generatedAt: string;
  totalMembers: number;
  members: MemberEntry[];
  byParent: Record<string, string[]>;
  byModule: Record<string, string[]>;
}

function isMemberPage(relativePath: string): { parent: string; member: string } | null {
  const normalized = relativePath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const fileName = parts[parts.length - 1].replace(/\.md$/, "");

  const ifaceIdx = parts.indexOf("Interface");
  if (ifaceIdx >= 0 && parts[ifaceIdx + 1]) {
    const parent = parts[ifaceIdx + 1];
    if (fileName.startsWith(parent + ".") && fileName !== parent) {
      return { parent, member: fileName.slice(parent.length + 1) };
    }
  }

  const classIdx = parts.indexOf("Class");
  if (classIdx >= 0 && parts[classIdx + 1]) {
    const parent = parts[classIdx + 1];
    if (fileName.startsWith(parent + ".") && fileName !== parent) {
      return { parent, member: fileName.slice(parent.length + 1) };
    }
    if (fileName !== parent && parts[classIdx + 1] === fileName) {
      return null;
    }
  }

  return null;
}

function detectMemberType(member: string, content: string): MemberType {
  if (/^EventOn/i.test(member) || /^On[A-Z]/.test(member)) return "event";
  if (/^## Параметры/m.test(normalizeText(content))) return "method";
  if (/^## Синтаксис/m.test(normalizeText(content))) {
    const syntax = extractSection(content, "Синтаксис");
    if (/\([^)]*\)/.test(syntax) && !/^(get|set)\s/i.test(syntax)) return "method";
  }
  return "property";
}

function loadExampleEntities(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  if (!fs.existsSync(CODE_EXAMPLES_PATH)) return map;
  const index = JSON.parse(fs.readFileSync(CODE_EXAMPLES_PATH, "utf8"));
  for (const [entity, ids] of Object.entries(index.byEntity || {})) {
    map.set(entity as string, new Set(ids as string[]));
  }
  return map;
}

function hasExampleForMember(
  exampleEntities: Map<string, Set<string>>,
  parent: string,
  member: string
): boolean {
  const fullId = `${parent}.${member}`;
  return (
    exampleEntities.has(fullId) ||
    (exampleEntities.get(member)?.size ?? 0) > 0
  );
}

function buildIndex(): MembersIndex {
  const files = walkMarkdownFiles(DOCS_DIR);
  const exampleEntities = loadExampleEntities();
  const members: MemberEntry[] = [];

  for (const relativePath of files) {
    const parsed = isMemberPage(relativePath);
    if (!parsed) continue;

    const fullPath = path.join(DOCS_DIR, relativePath);
    const content = fs.readFileSync(fullPath, "utf8");
    const normalizedPath = relativePath.replace(/\\/g, "/");
    const module = normalizedPath.split("/")[0];
    const id = `${parsed.parent}.${parsed.member}`;
    const memberType = detectMemberType(parsed.member, content);
    const syntax = extractSection(content, "Синтаксис");
    const description = extractDescription(content) || extractSection(content, "Описание");

    members.push({
      id,
      path: normalizedPath,
      module,
      parent: parsed.parent,
      member: parsed.member,
      memberType,
      title: extractTitle(content) || id,
      syntax: syntax.slice(0, 500),
      description: description.slice(0, 500),
      hasExample: hasExampleForMember(exampleEntities, parsed.parent, parsed.member),
    });
  }

  const byParent: Record<string, string[]> = {};
  const byModule: Record<string, string[]> = {};

  for (const m of members) {
    if (!byParent[m.parent]) byParent[m.parent] = [];
    byParent[m.parent].push(m.id);

    if (!byModule[m.module]) byModule[m.module] = [];
    byModule[m.module].push(m.id);
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    totalMembers: members.length,
    members,
    byParent,
    byModule,
  };
}

function main() {
  console.error("Building members index...");
  const index = buildIndex();

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(index, null, 2), "utf8");

  const byType = index.members.reduce(
    (acc, m) => {
      acc[m.memberType] = (acc[m.memberType] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  console.error(`Done: ${index.totalMembers} members`);
  console.error(`By type: ${JSON.stringify(byType)}`);
  console.error(`Output: ${OUTPUT_PATH}`);
}

main();
