import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

export interface MemberSearchResult {
  id: string;
  score: number;
  parent: string;
  member: string;
  memberType: MemberType;
  module: string;
  syntax: string;
  description: string;
  hasExample: boolean;
  path: string;
}

let cachedIndex: MembersIndex | null = null;
let membersById: Map<string, MemberEntry> | null = null;

function normalizeRussian(text: string): string {
  return text.toLowerCase().replace(/ё/g, "е");
}

export function loadMembersIndex(): MembersIndex {
  if (cachedIndex) return cachedIndex;

  const indexPath = path.join(__dirname, "..", "data", "members-index.json");
  if (!fs.existsSync(indexPath)) {
    console.error(`Members index not found at: ${indexPath}`);
    return {
      version: 1,
      generatedAt: "",
      totalMembers: 0,
      members: [],
      byParent: {},
      byModule: {},
    };
  }

  cachedIndex = JSON.parse(fs.readFileSync(indexPath, "utf8")) as MembersIndex;
  membersById = new Map(cachedIndex.members.map((m) => [m.id, m]));
  return cachedIndex;
}

export function searchMembers(
  index: MembersIndex,
  query: string,
  options: { limit?: number; parent?: string; memberType?: MemberType; module?: string } = {}
): MemberSearchResult[] {
  const { limit = 10, parent, memberType, module } = options;
  const queryNorm = normalizeRussian(query);
  const results: MemberSearchResult[] = [];

  const candidates = parent
    ? (index.byParent[parent] ?? []).map((id) => membersById!.get(id)!).filter(Boolean)
    : index.members;

  for (const m of candidates) {
    if (memberType && m.memberType !== memberType) continue;
    if (module && m.module.toLowerCase() !== module.toLowerCase()) continue;

    let score = 0;

    if (m.id.toLowerCase() === queryNorm) score = 100;
    else if (m.id.toLowerCase() === query.toLowerCase()) score = 100;
    else if (m.member.toLowerCase() === queryNorm) score = 90;
    else if (m.parent.toLowerCase() === queryNorm) score = 70;
    else if (m.id.toLowerCase().includes(queryNorm)) score = 60;
    else if (m.member.toLowerCase().includes(queryNorm)) score = 50;
    else if (m.description && normalizeRussian(m.description).includes(queryNorm)) score = 40;
    else if (m.syntax && normalizeRussian(m.syntax).includes(queryNorm)) score = 35;
    else if (m.parent.toLowerCase().includes(queryNorm)) score = 25;

    if (score > 0) {
      results.push({
        id: m.id,
        score,
        parent: m.parent,
        member: m.member,
        memberType: m.memberType,
        module: m.module,
        syntax: m.syntax,
        description: m.description,
        hasExample: m.hasExample,
        path: m.path,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

export function getMemberInfo(id: string): string | null {
  loadMembersIndex();
  const normalized = id.includes(".") ? id : null;
  const member = membersById?.get(id) ?? (normalized ? membersById?.get(normalized) : null);

  if (!member) {
    const dotIdx = id.indexOf(".");
    if (dotIdx > 0) {
      const parent = id.slice(0, dotIdx);
      const memberName = id.slice(dotIdx + 1);
      const found = cachedIndex?.members.find(
        (m) => m.parent === parent && m.member.toLowerCase() === memberName.toLowerCase()
      );
      if (found) return formatMemberInfo(found);
    }
    return null;
  }

  return formatMemberInfo(member);
}

function formatMemberInfo(member: MemberEntry): string {
  const docsPath = path.join(__dirname, "..", "docs", member.path);
  let body = "";

  if (fs.existsSync(docsPath)) {
    body = fs.readFileSync(docsPath, "utf8");
  } else {
    body = [
      member.syntax ? `## Синтаксис\n\n${member.syntax}` : "",
      member.description ? `## Описание\n\n${member.description}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  return [
    `# ${member.id}`,
    ``,
    `**Тип:** ${member.memberType} | **Модуль:** ${member.module}`,
    `**Пример в справке:** ${member.hasExample ? "да" : "нет"}`,
    `**Путь:** docs/${member.path}`,
    ``,
    body,
  ].join("\n");
}

export function listInterfaceMembers(
  index: MembersIndex,
  parent: string,
  options: { memberType?: MemberType; withExamplesOnly?: boolean } = {}
): MemberEntry[] {
  const ids = index.byParent[parent] ?? [];
  return ids
    .map((id) => membersById?.get(id))
    .filter((m): m is MemberEntry => m !== undefined && m !== null)
    .filter((m) => !options.memberType || m.memberType === options.memberType)
    .filter((m) => !options.withExamplesOnly || m.hasExample);
}

export function getTopMembersWithExamples(index: MembersIndex, parent: string, limit = 10): MemberEntry[] {
  return listInterfaceMembers(index, parent, { withExamplesOnly: true }).slice(0, limit);
}
