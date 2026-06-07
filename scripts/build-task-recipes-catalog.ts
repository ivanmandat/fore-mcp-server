#!/usr/bin/env tsx
/**
 * Генерирует расширенный каталог task-recipes.json из guides-index + handcrafted overrides.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GUIDES_INDEX = path.join(__dirname, "..", "data", "guides-index.json");
const HANDCRAFTED = path.join(__dirname, "..", "data", "task-recipes-handcrafted.json");
const OUTPUT = path.join(__dirname, "..", "data", "task-recipes.json");

interface GuideEntry {
  id: string;
  path: string;
  module: string;
  type: string;
  title: string;
  summary: string;
  topics: string[];
  relatedInterfaces: string[];
  hasCodeExamples: boolean;
}

interface RecipeStep {
  order: number;
  title: string;
  description: string;
  interfaces: string[];
  members: string[];
  guides: string[];
  exampleQueries: string[];
}

interface TaskRecipe {
  id: string;
  title: string;
  keywords: string[];
  description: string;
  steps: RecipeStep[];
}

const SKIP_TITLES = new Set(["README", "Примеры", "KeABAC_TitlePage", "KeAlgo_TitlePage"]);

const MODULE_PROGRAMMING_GUIDE: Record<string, string> = {
  KeReport: "KeReport/Intro/KeReport_Programming.md",
  KeSom: "KeSom/Intro/KeSom_Programming.md",
  KeMs: "KeMs/Intro/KeMs_Programming.md",
  KePivot: "KePivot/Intro/KePivot_Programming.md",
  KeABAC: "KeABAC/Intro/KeABAC_Programming.md",
  KeAlgo: "KeAlgo/Intro/KeAlgo_Programming.md",
  ModDBA: "ModDBA/Intro/ModDBA_Programming.md",
  PrjPlanningLib: "PrjPlanningLib/Intro/ProjectPlanning_Programming.md",
  TabSheet: "TabSheet/Intro/Programming_principles.md",
  KeExpress: "KeExpress/Intro/Programming.md",
};

function slugify(id: string): string {
  return id
    .replace(/\\/g, "/")
    .replace(/\.md$/, "")
    .replace(/\//g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .toLowerCase()
    .slice(0, 80);
}

function tokenizeFilename(pathStr: string): string[] {
  const base = path.basename(pathStr, ".md");
  return base
    .split(/[_\-.]+/)
    .filter((t) => t.length > 2 && !/^(sample|example|intro|readme)$/i.test(t));
}

function buildKeywords(guide: GuideEntry): string[] {
  const kw = new Set<string>();
  kw.add(guide.module);
  kw.add(guide.type);

  for (const t of guide.topics.slice(0, 15)) {
    if (t.length >= 3 && !/^[а-я]{1,2}$/i.test(t)) kw.add(t);
  }
  for (const iface of guide.relatedInterfaces) kw.add(iface);
  for (const t of tokenizeFilename(guide.path)) kw.add(t);

  const titleWords = guide.title
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/[\s,;.!?()[\]{}«»"']+/)
    .filter((w) => w.length >= 3);
  for (const w of titleWords.slice(0, 10)) kw.add(w);

  return [...kw].slice(0, 25);
}

function recipeFromGuide(guide: GuideEntry): TaskRecipe | null {
  if (SKIP_TITLES.has(guide.title)) return null;
  if (guide.type === "module-overview") return null;

  const id = slugify(guide.id);
  if (!id) return null;

  const programmingGuide = MODULE_PROGRAMMING_GUIDE[guide.module];
  const moduleReadme = `${guide.module}/README.md`;

  const guides: string[] = [guide.path];
  if (programmingGuide && guide.type === "tutorial") guides.push(programmingGuide);
  if (guide.type === "tutorial" && fs.existsSync(path.join(__dirname, "..", "docs", moduleReadme))) {
    if (!guides.includes(moduleReadme)) guides.push(moduleReadme);
  }

  const interfaces = [...guide.relatedInterfaces].slice(0, 8);
  const exampleQueries = [
    ...guide.relatedInterfaces.slice(0, 3),
    ...tokenizeFilename(guide.path).slice(0, 2),
    guide.module,
  ].filter((v, i, a) => a.indexOf(v) === i);

  const steps: RecipeStep[] = [];

  if (guide.type === "tutorial") {
    steps.push({
      order: 1,
      title: guide.title,
      description: guide.summary || `Практический пример из docs/${guide.path}`,
      interfaces,
      members: [],
      guides: [guide.path],
      exampleQueries,
    });
    if (programmingGuide) {
      steps.push({
        order: 2,
        title: "Справочник по программированию модуля",
        description: `Общие принципы программирования ${guide.module}.`,
        interfaces: [guide.module],
        members: [],
        guides: [programmingGuide],
        exampleQueries: [guide.module],
      });
    }
  } else if (guide.path.includes("_Programming") || guide.path.includes("/Programming")) {
    steps.push({
      order: 1,
      title: guide.title,
      description: guide.summary || `Руководство по программированию: ${guide.title}`,
      interfaces,
      members: [],
      guides: [guide.path],
      exampleQueries,
    });
  } else if (guide.type === "guide") {
    steps.push({
      order: 1,
      title: guide.title,
      description: guide.summary || `Руководство: ${guide.title}`,
      interfaces,
      members: [],
      guides: [guide.path],
      exampleQueries,
    });
    if (programmingGuide && !guides.includes(programmingGuide)) {
      steps.push({
        order: 2,
        title: "Программирование модуля",
        description: `Базовые принципы API ${guide.module}.`,
        interfaces,
        members: [],
        guides: [programmingGuide],
        exampleQueries: [guide.module],
      });
    }
  } else {
    return null;
  }

  return {
    id,
    title: guide.title,
    keywords: buildKeywords(guide),
    description: guide.summary || guide.title,
    steps,
  };
}

function recipeFromModuleOverview(guide: GuideEntry): TaskRecipe | null {
  if (guide.type !== "module-overview" || guide.title === "README") {
    // still create overview recipes for modules with README
  }
  if (guide.type !== "module-overview") return null;

  const id = `module-${guide.module.toLowerCase()}`;
  const programmingGuide = MODULE_PROGRAMMING_GUIDE[guide.module];

  const steps: RecipeStep[] = [
    {
      order: 1,
      title: `Обзор модуля ${guide.module}`,
      description: guide.summary || `Введение в сборку ${guide.module}.`,
      interfaces: guide.relatedInterfaces.slice(0, 5),
      members: [],
      guides: [guide.path],
      exampleQueries: [guide.module],
    },
  ];

  if (programmingGuide) {
    steps.push({
      order: 2,
      title: "Программирование",
      description: `Руководство по программированию ${guide.module}.`,
      interfaces: guide.relatedInterfaces.slice(0, 5),
      members: [],
      guides: [programmingGuide],
      exampleQueries: [guide.module],
    });
  }

  return {
    id,
    title: `Модуль ${guide.module} — обзор и API`,
    keywords: [guide.module, "модуль", "обзор", "api", "сборка", ...guide.topics.slice(0, 5)],
    description: guide.summary || `Обзор сборки ${guide.module} и точка входа в документацию.`,
    steps,
  };
}

function main() {
  const guidesIndex = JSON.parse(fs.readFileSync(GUIDES_INDEX, "utf8")) as {
    guides: GuideEntry[];
  };
  const handcrafted = JSON.parse(fs.readFileSync(HANDCRAFTED, "utf8")) as {
    recipes: TaskRecipe[];
  };

  const recipesById = new Map<string, TaskRecipe>();

  for (const recipe of handcrafted.recipes) {
    recipesById.set(recipe.id, recipe);
  }

  let generated = 0;
  let skipped = 0;

  for (const guide of guidesIndex.guides) {
    let recipe: TaskRecipe | null = null;

    if (guide.type === "module-overview") {
      recipe = recipeFromModuleOverview(guide);
    } else {
      recipe = recipeFromGuide(guide);
    }

    if (!recipe) {
      skipped++;
      continue;
    }

    if (recipesById.has(recipe.id)) {
      skipped++;
      continue;
    }

    recipesById.set(recipe.id, recipe);
    generated++;
  }

  const handcraftedIds = new Set(handcrafted.recipes.map((r) => r.id));
  const recipes = [...recipesById.values()].sort((a, b) => {
    const aHand = handcraftedIds.has(a.id) ? 0 : 1;
    const bHand = handcraftedIds.has(b.id) ? 0 : 1;
    if (aHand !== bHand) return aHand - bHand;
    const aMod = a.steps[0]?.guides[0]?.split("/")[0] ?? "";
    const bMod = b.steps[0]?.guides[0]?.split("/")[0] ?? "";
    if (aMod !== bMod) return aMod.localeCompare(bMod);
    return a.title.localeCompare(b.title, "ru");
  });

  const output = {
    version: 2,
    generatedAt: new Date().toISOString(),
    totalRecipes: recipes.length,
    handcraftedCount: handcrafted.recipes.length,
    generatedCount: generated,
    recipes,
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2), "utf8");

  const byModule: Record<string, number> = {};
  for (const r of recipes) {
    const mod = r.keywords.find((k) => /^Ke[A-Z]/.test(k)) ?? r.steps[0]?.guides[0]?.split("/")[0] ?? "other";
    byModule[mod] = (byModule[mod] || 0) + 1;
  }

  console.error(`Done: ${recipes.length} recipes (${handcrafted.recipes.length} handcrafted + ${generated} generated)`);
  console.error(`Skipped duplicates/empty: ${skipped}`);
  console.error(`By module (top): ${JSON.stringify(Object.fromEntries(Object.entries(byModule).sort((a, b) => b[1] - a[1]).slice(0, 15)))}`);
  console.error(`Output: ${OUTPUT}`);
}

main();
