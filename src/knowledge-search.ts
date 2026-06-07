import { searchDocs, type DocsIndex, type SearchResult } from "./search.js";
import { searchGuides, type GuidesIndex, type GuideSearchResult } from "./guides.js";
import {
  searchMembers,
  type MembersIndex,
  type MemberSearchResult,
  type MemberEntry,
} from "./members.js";
import { searchCodeExamples, type CodeExamplesIndex, type CodeExampleSearchResult } from "./code-examples.js";
import { searchTaskRecipes, getTaskRecipe, type RecipeSearchResult, type ResolvedTaskRecipe } from "./task-recipes.js";

export type KnowledgeSource = "task-recipe" | "guide" | "member" | "api" | "code-example";

const SOURCE_WEIGHTS: Record<KnowledgeSource, number> = {
  "task-recipe": 1.2,
  guide: 1.0,
  member: 0.9,
  api: 0.8,
  "code-example": 0.7,
};

export interface KnowledgeSearchResult {
  source: KnowledgeSource;
  id: string;
  score: number;
  weightedScore: number;
  title: string;
  description: string;
  nextTool: string;
  nextToolArgs: Record<string, string>;
  metadata: Record<string, unknown>;
}

export interface KnowledgeIndexes {
  docs: DocsIndex;
  guides: GuidesIndex;
  members: MembersIndex;
  examples: CodeExamplesIndex;
}

export interface ForeContext {
  query: string;
  summary: string;
  recipe: ResolvedTaskRecipe | null;
  recipes: RecipeSearchResult[];
  guides: GuideSearchResult[];
  members: MemberSearchResult[];
  interfaces: SearchResult[];
  codeExamples: CodeExampleSearchResult[];
  suggestedNextTools: { tool: string; args: Record<string, string>; reason: string }[];
}

function toRecipeResult(r: RecipeSearchResult): KnowledgeSearchResult {
  return {
    source: "task-recipe",
    id: r.id,
    score: r.score,
    weightedScore: r.score * SOURCE_WEIGHTS["task-recipe"],
    title: r.title,
    description: r.description,
    nextTool: "get_task_recipe",
    nextToolArgs: { id: r.id },
    metadata: { keywords: r.keywords, stepCount: r.stepCount },
  };
}

function toGuideResult(r: GuideSearchResult): KnowledgeSearchResult {
  return {
    source: "guide",
    id: r.id,
    score: r.score,
    weightedScore: r.score * SOURCE_WEIGHTS.guide,
    title: r.title,
    description: r.summary,
    nextTool: "get_guide",
    nextToolArgs: { id: r.id },
    metadata: {
      path: r.path,
      module: r.module,
      type: r.type,
      relatedInterfaces: r.relatedInterfaces,
      hasCodeExamples: r.hasCodeExamples,
    },
  };
}

function toMemberResult(r: MemberSearchResult): KnowledgeSearchResult {
  return {
    source: "member",
    id: r.id,
    score: r.score,
    weightedScore: r.score * SOURCE_WEIGHTS.member,
    title: r.id,
    description: r.description || r.syntax,
    nextTool: "get_member_info",
    nextToolArgs: { id: r.id },
    metadata: {
      parent: r.parent,
      member: r.member,
      memberType: r.memberType,
      module: r.module,
      hasExample: r.hasExample,
    },
  };
}

function toApiResult(r: SearchResult): KnowledgeSearchResult {
  return {
    source: "api",
    id: r.name,
    score: r.score,
    weightedScore: r.score * SOURCE_WEIGHTS.api,
    title: r.name,
    description: r.description,
    nextTool: "get_interface_info",
    nextToolArgs: { name: r.name },
    metadata: {
      type: r.type,
      propertiesCount: r.propertiesCount,
      methodsCount: r.methodsCount,
    },
  };
}

function toExampleResult(r: CodeExampleSearchResult): KnowledgeSearchResult {
  const label = r.parentEntity && r.memberName ? `${r.parentEntity}.${r.memberName}` : r.entityName;
  return {
    source: "code-example",
    id: r.id,
    score: r.score,
    weightedScore: r.score * SOURCE_WEIGHTS["code-example"],
    title: r.title || label,
    description: r.description || r.codePreview,
    nextTool: "get_code_example",
    nextToolArgs: { id: r.id },
    metadata: {
      entityName: r.entityName,
      parentEntity: r.parentEntity,
      memberName: r.memberName,
      module: r.module,
      language: r.language,
      codePreview: r.codePreview,
    },
  };
}

/**
 * Параллельный поиск по всем индексам с взвешенным merge.
 */
export function searchForeKnowledge(
  indexes: KnowledgeIndexes,
  query: string,
  options: { limit?: number; module?: string } = {}
): KnowledgeSearchResult[] {
  const { limit = 15, module } = options;
  const perSourceLimit = Math.max(limit, 10);

  const recipes = searchTaskRecipes(query, perSourceLimit);
  const guides = searchGuides(indexes.guides, query, { limit: perSourceLimit, module });
  const members = searchMembers(indexes.members, query, { limit: perSourceLimit, module });
  const apis = searchDocs(indexes.docs, query, perSourceLimit);
  const examples = searchCodeExamples(indexes.examples, query, { limit: perSourceLimit, module });

  const merged: KnowledgeSearchResult[] = [
    ...recipes.map(toRecipeResult),
    ...guides.map(toGuideResult),
    ...members.map(toMemberResult),
    ...apis.map(toApiResult),
    ...examples.map(toExampleResult),
  ];

  merged.sort((a, b) => b.weightedScore - a.weightedScore);
  return merged.slice(0, limit);
}

/**
 * Собирает структурированный контекст по теме — рецепт, гайды, API, примеры.
 */
export function getForeContext(
  indexes: KnowledgeIndexes,
  query: string,
  options: { module?: string } = {}
): ForeContext {
  const { module } = options;

  const recipes = searchTaskRecipes(query, 3);
  const guides = searchGuides(indexes.guides, query, { limit: 5, module });
  const members = searchMembers(indexes.members, query, { limit: 8, module });
  const interfaces = searchDocs(indexes.docs, query, 5);
  const codeExamples = searchCodeExamples(indexes.examples, query, { limit: 5, module });

  const topRecipe = recipes[0];
  const recipe =
    topRecipe && topRecipe.score >= 30
      ? (getTaskRecipe(topRecipe.id, true) as ResolvedTaskRecipe | null)
      : null;

  // Дополняем члены API из рецепта и связанных интерфейсов
  const enrichedMembers = enrichMembersFromContext(indexes.members, members, recipe, interfaces);

  const suggestedNextTools: ForeContext["suggestedNextTools"] = [];

  if (recipe) {
    suggestedNextTools.push({
      tool: "get_task_recipe",
      args: { id: recipe.id },
      reason: "Пошаговый план задачи",
    });
  }

  if (guides.length > 0) {
    suggestedNextTools.push({
      tool: "get_guide",
      args: { id: guides[0].id },
      reason: "Руководство по теме",
    });
  }

  for (const m of enrichedMembers.slice(0, 3)) {
    suggestedNextTools.push({
      tool: "get_member_info",
      args: { id: m.id },
      reason: `API: ${m.id}`,
    });
  }

  if (interfaces.length > 0) {
    suggestedNextTools.push({
      tool: "get_interface_info",
      args: { name: interfaces[0].name },
      reason: `Интерфейс ${interfaces[0].name}`,
    });
  }

  if (codeExamples.length > 0) {
    const entity = codeExamples[0].parentEntity ?? codeExamples[0].entityName;
    suggestedNextTools.push({
      tool: "get_code_examples",
      args: { entity },
      reason: "Примеры кода",
    });
  }

  const parts: string[] = [];
  if (recipe) parts.push(`рецепт «${recipe.title}» (${recipe.steps.length} шагов)`);
  if (guides.length > 0) parts.push(`${guides.length} руководств`);
  if (enrichedMembers.length > 0) parts.push(`${enrichedMembers.length} членов API`);
  if (interfaces.length > 0) parts.push(`${interfaces.length} интерфейсов`);
  if (codeExamples.length > 0) parts.push(`${codeExamples.length} примеров кода`);

  const summary =
    parts.length > 0
      ? `Найдено: ${parts.join(", ")}. Используйте suggestedNextTools для деталей.`
      : `По запросу «${query}» ничего не найдено. Попробуйте другие ключевые слова.`;

  return {
    query,
    summary,
    recipe,
    recipes,
    guides,
    members: enrichedMembers,
    interfaces,
    codeExamples,
    suggestedNextTools,
  };
}

function memberToSearchResult(m: MemberEntry, score = 50): MemberSearchResult {
  return {
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
  };
}

function enrichMembersFromContext(
  membersIndex: MembersIndex,
  fromSearch: MemberSearchResult[],
  recipe: ResolvedTaskRecipe | null,
  interfaces: SearchResult[]
): MemberSearchResult[] {
  const seen = new Set<string>();
  const result: MemberSearchResult[] = [];

  const add = (m: MemberSearchResult) => {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      result.push(m);
    }
  };

  for (const m of fromSearch) add(m);

  if (recipe) {
    const membersById = new Map(membersIndex.members.map((m) => [m.id, m]));
    for (const step of recipe.steps) {
      for (const memberId of step.members) {
        const entry = membersById.get(memberId);
        if (entry) add(memberToSearchResult(entry, 60));
      }
    }
  }

  if (result.length < 5) {
    for (const iface of interfaces.slice(0, 2)) {
      const eventMembers = searchMembers(membersIndex, "Event", {
        limit: 5,
        parent: iface.name,
        memberType: "event",
      });
      for (const m of eventMembers) add(m);
    }
  }

  return result.slice(0, 10);
}
