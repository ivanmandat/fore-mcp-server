#!/usr/bin/env tsx
/**
 * Извлекает примеры кода из docs/ и строит индекс для быстрого поиска через MCP.
 *
 * Запуск: npx tsx scripts/build-code-examples-index.ts
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCS_DIR = path.join(__dirname, "..", "docs");
const OUTPUT_PATH = path.join(__dirname, "..", "data", "code-examples-index.json");

export interface CodeExample {
  id: string;
  sourcePath: string;
  language: "fore" | "javascript" | "html" | "other";
  entityType: "interface" | "class" | "property" | "method" | "member" | "tutorial" | "syntax" | "other";
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

const STOP_MARKERS = [
  /^## /,
  /^См\.\s*также/,
  /^См\.также/,
  /^\t\tСправочная система/,
  /^# /,
];

function normalizeText(text: string): string {
  return text.replace(/\u00a0/g, " ");
}

function dedentBlock(lines: string[]): string {
  return lines
    .map((line) => line.replace(/^\t/, "").replace(/\u00a0/g, " "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isCodeStartLine(line: string): boolean {
  const trimmed = line.replace(/^\t+/, "").trim();
  if (!trimmed) return false;
  return /^(Sub|Function|Public\s+(Class|Sub|Function)|Var\b|Namespace\b|Class\b|Begin\b|While\b|For\b|If\b|Try\b|\/\/|var\s|function\s|PP\.Ui\.|<(?:script|html|!DOCTYPE))/i.test(
    trimmed
  );
}

function isValidCodeBlock(code: string): boolean {
  const trimmed = code.trim();
  if (trimmed.length < 15) return false;
  return (
    /(?:^|\n)\s*(Sub|Function|Public\s+Class|Var\b|Namespace\b|Begin\b)/m.test(trimmed) ||
    /(?:var\s|function\s|PP\.Ui\.)/m.test(trimmed) ||
    /<(?:script|html|!DOCTYPE)/i.test(trimmed)
  );
}

function extractTabBlocks(text: string): string[] {
  const lines = normalizeText(text).replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let current: string[] = [];

  const flush = () => {
    if (current.length === 0) return;
    const code = dedentBlock(current);
    if (isValidCodeBlock(code)) {
      blocks.push(code);
    }
    current = [];
  };

  for (const line of lines) {
    const hasTab = line.startsWith("\t");
    const isEmpty = line.trim().length === 0;

    if (hasTab && line.trim().length > 0) {
      current.push(line);
    } else if (isEmpty && current.length > 0) {
      current.push(line);
    } else {
      flush();
    }
  }
  flush();

  return blocks;
}

function extractPrimerSections(content: string): string[] {
  const normalized = normalizeText(content).replace(/\r\n/g, "\n");
  const sections: string[] = [];
  const lines = normalized.split("\n");

  for (let i = 0; i < lines.length; i++) {
    if (!/^## Пример\s*$/.test(lines[i])) continue;

    const sectionLines: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (/^## /.test(line)) break;
      if (/^См\.\s*также/.test(line) || /^См\.также/.test(line)) break;
      if (/^\t\tСправочная система/.test(line)) break;
      sectionLines.push(line);
    }

    const blocks = extractTabBlocks(sectionLines.join("\n"));
    sections.push(...blocks);
  }

  return sections;
}

function extractTitle(content: string): string {
  const match = normalizeText(content).match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "";
}

function extractDescription(content: string): string {
  const normalized = normalizeText(content);
  const descMatch = normalized.match(/^## Описание\s*\n+([\s\S]*?)(?=^## |$)/m);
  if (descMatch) {
    return descMatch[1].replace(/\s+/g, " ").trim().slice(0, 300);
  }
  const firstPara = normalized
    .split("\n\n")
    .find((p) => p.trim() && !p.startsWith("#") && !p.startsWith("!") && !p.startsWith("\t"));
  return firstPara ? firstPara.replace(/\s+/g, " ").trim().slice(0, 300) : "";
}

function detectLanguage(code: string): CodeExample["language"] {
  if (/<(?:script|html|!DOCTYPE)/i.test(code)) return "html";
  if (/(?:^|\n)\s*(var\s|function\s|PP\.Ui\.|\.prototype\.)/m.test(code)) return "javascript";
  if (/(?:^|\n)\s*(Sub|Function|Public|Var|Begin|Namespace)\b/m.test(code)) return "fore";
  return "other";
}

function parseEntityFromPath(relativePath: string, content: string): Pick<
  CodeExample,
  "entityType" | "entityName" | "parentEntity" | "memberName" | "module"
> {
  const parts = relativePath.replace(/\\/g, "/").split("/");
  const module = parts[0];
  const fileName = parts[parts.length - 1].replace(/\.md$/, "");

  if (parts.includes("Samples") || /Example|_example/i.test(fileName)) {
    return {
      module,
      entityType: "tutorial",
      entityName: fileName,
      parentEntity: null,
      memberName: null,
    };
  }

  if (parts[0] === "Fore") {
    return {
      module: "Fore",
      entityType: "syntax",
      entityName: fileName,
      parentEntity: null,
      memberName: null,
    };
  }

  const hasParams = /^## Параметры/m.test(content);
  const hasSyntax = /^## Синтаксис/m.test(content);

  if (parts.includes("Interface")) {
    const idx = parts.indexOf("Interface");
    const parentInterface = parts[idx + 1];

    if (fileName === parentInterface) {
      return {
        module,
        entityType: "interface",
        entityName: parentInterface,
        parentEntity: parentInterface,
        memberName: null,
      };
    }

    if (fileName.startsWith(parentInterface + ".")) {
      const member = fileName.slice(parentInterface.length + 1);
      return {
        module,
        entityType: hasParams ? "method" : "property",
        entityName: fileName,
        parentEntity: parentInterface,
        memberName: member,
      };
    }
  }

  if (parts.includes("Class")) {
    const idx = parts.indexOf("Class");
    const className = parts[idx + 1];

    if (fileName === className) {
      return {
        module,
        entityType: "class",
        entityName: className,
        parentEntity: className,
        memberName: null,
      };
    }

    const member = fileName.startsWith(className + ".")
      ? fileName.slice(className.length + 1)
      : fileName.replace(className, "").replace(/^[._]/, "");

    return {
      module,
      entityType: hasParams || hasSyntax ? "method" : "member",
      entityName: fileName,
      parentEntity: className,
      memberName: member || null,
    };
  }

  return {
    module,
    entityType: "other",
    entityName: fileName,
    parentEntity: null,
    memberName: null,
  };
}

function extractKeywords(code: string, entity: ReturnType<typeof parseEntityFromPath>): string[] {
  const keywords = new Set<string>();

  if (entity.parentEntity) keywords.add(entity.parentEntity);
  if (entity.memberName) keywords.add(entity.memberName);
  if (entity.entityName) keywords.add(entity.entityName);

  const ifaceMatches = code.match(/\bI[A-Z][A-Za-z0-9]+\b/g);
  ifaceMatches?.forEach((m) => keywords.add(m));

  const classMatches = code.match(/\b[A-Z][A-Za-z0-9]*Class\b/g);
  classMatches?.forEach((m) => keywords.add(m));

  return [...keywords].slice(0, 20);
}

function hashCode(code: string): string {
  return crypto.createHash("md5").update(code).digest("hex").slice(0, 12);
}

function walkMarkdownFiles(dir: string, base: string = dir): string[] {
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

function buildIndex(): CodeExamplesIndex {
  const files = walkMarkdownFiles(DOCS_DIR);
  const examples: CodeExample[] = [];
  const seenHashes = new Set<string>();
  let exampleCounter = 0;

  for (const relativePath of files) {
    const fullPath = path.join(DOCS_DIR, relativePath);
    const content = fs.readFileSync(fullPath, "utf8");
    const entity = parseEntityFromPath(relativePath, content);
    const title = extractTitle(content);
    const description = extractDescription(content);

    let codeBlocks: string[] = extractPrimerSections(content);

    if (codeBlocks.length === 0 && (entity.entityType === "tutorial" || entity.entityType === "syntax")) {
      codeBlocks = extractTabBlocks(content);
    }

    for (let i = 0; i < codeBlocks.length; i++) {
      const code = codeBlocks[i];
      const codeHash = hashCode(code);
      if (seenHashes.has(codeHash)) continue;
      seenHashes.add(codeHash);

      exampleCounter++;
      const id = `${relativePath.replace(/\\/g, "/").replace(/\.md$/, "")}#${i + 1}`;

      examples.push({
        id,
        sourcePath: relativePath.replace(/\\/g, "/"),
        language: detectLanguage(code),
        entityType: entity.entityType,
        entityName: entity.entityName,
        parentEntity: entity.parentEntity,
        memberName: entity.memberName,
        module: entity.module,
        title: title || entity.entityName,
        description,
        code,
        keywords: extractKeywords(code, entity),
      });
    }
  }

  const byEntity: Record<string, string[]> = {};
  const byModule: Record<string, string[]> = {};

  for (const ex of examples) {
    const entities = new Set<string>();
    entities.add(ex.entityName);
    if (ex.parentEntity) entities.add(ex.parentEntity);
    if (ex.memberName) {
      entities.add(ex.memberName);
      if (ex.parentEntity) entities.add(`${ex.parentEntity}.${ex.memberName}`);
    }

    for (const name of entities) {
      if (!byEntity[name]) byEntity[name] = [];
      byEntity[name].push(ex.id);
    }

    if (!byModule[ex.module]) byModule[ex.module] = [];
    byModule[ex.module].push(ex.id);
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    totalExamples: examples.length,
    totalFiles: files.length,
    examples,
    byEntity,
    byModule,
  };
}

function main() {
  console.error("Scanning docs/ for code examples...");
  const index = buildIndex();

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(index, null, 2), "utf8");

  const byLang = index.examples.reduce(
    (acc, ex) => {
      acc[ex.language] = (acc[ex.language] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const byType = index.examples.reduce(
    (acc, ex) => {
      acc[ex.entityType] = (acc[ex.entityType] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  console.error(`Done: ${index.totalExamples} examples from ${index.totalFiles} files`);
  console.error(`By language: ${JSON.stringify(byLang)}`);
  console.error(`By type: ${JSON.stringify(byType)}`);
  console.error(`Output: ${OUTPUT_PATH}`);
}

main();
