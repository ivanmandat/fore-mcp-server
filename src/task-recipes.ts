import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { loadGuidesIndex } from "./guides.js";
import { loadMembersIndex } from "./members.js";
import { loadCodeExamplesIndex, searchCodeExamples } from "./code-examples.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface RecipeStep {
  order: number;
  title: string;
  description: string;
  interfaces: string[];
  members: string[];
  guides: string[];
  exampleQueries: string[];
}

export interface TaskRecipe {
  id: string;
  title: string;
  keywords: string[];
  description: string;
  steps: RecipeStep[];
}

export interface TaskRecipesIndex {
  version: number;
  generatedAt: string;
  recipes: TaskRecipe[];
}

export interface RecipeSearchResult {
  id: string;
  score: number;
  title: string;
  description: string;
  keywords: string[];
  stepCount: number;
}

export interface ResolvedRecipeStep extends RecipeStep {
  resolvedGuides: { path: string; title: string; preview: string }[];
  resolvedMembers: { id: string; syntax: string; description: string }[];
  resolvedExamples: { id: string; title: string; codePreview: string }[];
}

export interface ResolvedTaskRecipe extends TaskRecipe {
  steps: ResolvedRecipeStep[];
}

let cachedRecipes: TaskRecipesIndex | null = null;
let recipesById: Map<string, TaskRecipe> | null = null;

function normalizeRussian(text: string): string {
  return text.toLowerCase().replace(/ё/g, "е");
}

function tokenize(text: string): string[] {
  return normalizeRussian(text)
    .split(/[\s,;.!?()[\]{}«»"']+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

export function loadTaskRecipes(): TaskRecipesIndex {
  if (cachedRecipes) return cachedRecipes;

  const recipesPath = path.join(__dirname, "..", "data", "task-recipes.json");
  if (!fs.existsSync(recipesPath)) {
    return { version: 1, generatedAt: "", recipes: [] };
  }

  cachedRecipes = JSON.parse(fs.readFileSync(recipesPath, "utf8")) as TaskRecipesIndex;
  recipesById = new Map(cachedRecipes.recipes.map((r) => [r.id, r]));
  return cachedRecipes;
}

export function searchTaskRecipes(query: string, limit = 10): RecipeSearchResult[] {
  const index = loadTaskRecipes();
  const queryNorm = normalizeRussian(query);
  const queryTokens = tokenize(query);
  const results: RecipeSearchResult[] = [];

  for (const recipe of index.recipes) {
    let score = 0;

    if (recipe.id === query || recipe.id === queryNorm) score = 100;
    else if (normalizeRussian(recipe.title).includes(queryNorm)) score = 80;
    else if (normalizeRussian(recipe.description).includes(queryNorm)) score = 60;
    else if (recipe.keywords.some((k) => normalizeRussian(k) === queryNorm)) score = 70;
    else if (recipe.keywords.some((k) => normalizeRussian(k).includes(queryNorm))) score = 50;

    if (score === 0 && queryTokens.length > 0) {
      const allText = [
        recipe.title,
        recipe.description,
        ...recipe.keywords,
        ...recipe.steps.flatMap((s) => [s.title, s.description, ...s.exampleQueries]),
      ]
        .map(normalizeRussian)
        .join(" ");

      let matched = 0;
      for (const token of queryTokens) {
        if (allText.includes(token)) matched++;
      }
      if (matched > 0) score = 30 + (matched / queryTokens.length) * 50;
    }

    if (score > 0) {
      results.push({
        id: recipe.id,
        score,
        title: recipe.title,
        description: recipe.description,
        keywords: recipe.keywords,
        stepCount: recipe.steps.length,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

export function getTaskRecipe(id: string, resolveLinks = true): ResolvedTaskRecipe | TaskRecipe | null {
  loadTaskRecipes();
  const recipe = recipesById?.get(id);
  if (!recipe) return null;
  if (!resolveLinks) return recipe;

  const guidesIndex = loadGuidesIndex();
  const membersIndex = loadMembersIndex();
  const examplesIndex = loadCodeExamplesIndex();

  const guidesByPath = new Map(guidesIndex.guides.map((g) => [g.path, g]));
  const membersByIdMap = new Map(membersIndex.members.map((m) => [m.id, m]));

  const resolvedSteps: ResolvedRecipeStep[] = recipe.steps.map((step) => {
    const resolvedGuides = step.guides.map((guidePath) => {
      const g = guidesByPath.get(guidePath);
      return {
        path: guidePath,
        title: g?.title ?? guidePath,
        preview: g?.summary?.slice(0, 200) ?? "",
      };
    });

    const resolvedMembers = step.members.map((memberId) => {
      const m = membersByIdMap.get(memberId);
      return {
        id: memberId,
        syntax: m?.syntax ?? "",
        description: m?.description ?? "",
      };
    });

    const resolvedExamples: ResolvedRecipeStep["resolvedExamples"] = [];
    const seenExampleIds = new Set<string>();

    for (const q of step.exampleQueries) {
      const found = searchCodeExamples(examplesIndex, q, { limit: 2 });
      for (const ex of found) {
        if (!seenExampleIds.has(ex.id)) {
          seenExampleIds.add(ex.id);
          resolvedExamples.push({
            id: ex.id,
            title: ex.title,
            codePreview: ex.codePreview,
          });
        }
      }
    }

    return { ...step, resolvedGuides, resolvedMembers, resolvedExamples };
  });

  return { ...recipe, steps: resolvedSteps };
}

export function formatTaskRecipe(recipe: ResolvedTaskRecipe | TaskRecipe): string {
  let result = `# Рецепт: ${recipe.title}\n\n`;
  result += `**ID:** ${recipe.id}\n`;
  result += `**Описание:** ${recipe.description}\n`;
  result += `**Ключевые слова:** ${recipe.keywords.join(", ")}\n\n`;

  for (const step of recipe.steps) {
    result += `## Шаг ${step.order}: ${step.title}\n\n`;
    result += `${step.description}\n\n`;

    if (step.interfaces.length > 0) {
      result += `**Интерфейсы:** ${step.interfaces.map((i) => `\`${i}\``).join(", ")}\n`;
    }
    if (step.members.length > 0) {
      result += `**Члены API:** ${step.members.map((m) => `\`${m}\``).join(", ")}\n`;
    }
    if (step.guides.length > 0) {
      result += `**Руководства:** ${step.guides.map((g) => `docs/${g}`).join(", ")}\n`;
    }

    if ("resolvedGuides" in step) {
      const rs = step as ResolvedRecipeStep;
      if (rs.resolvedMembers.length > 0) {
        result += `\n### API\n`;
        for (const m of rs.resolvedMembers) {
          result += `- **${m.id}**`;
          if (m.syntax) result += `: \`${m.syntax}\``;
          if (m.description) result += ` — ${m.description.slice(0, 150)}`;
          result += `\n`;
        }
      }
      if (rs.resolvedExamples.length > 0) {
        result += `\n### Примеры кода\n`;
        for (const ex of rs.resolvedExamples) {
          result += `- ${ex.title}: \`${ex.codePreview}\`\n`;
        }
      }
    }

    result += `\n`;
  }

  return result;
}
