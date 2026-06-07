#!/usr/bin/env tsx
/**
 * Smoke-тесты для acceptance criteria из плана.
 */

import { loadDocsIndex } from "../src/search.js";
import { loadGuidesIndex, searchGuides } from "../src/guides.js";
import { loadMembersIndex, getMemberInfo } from "../src/members.js";
import { loadCodeExamplesIndex } from "../src/code-examples.js";
import { getTaskRecipe, searchTaskRecipes } from "../src/task-recipes.js";
import { searchForeKnowledge, getForeContext } from "../src/knowledge-search.js";
import { loadFulltextIndex, searchFulltext } from "../src/fulltext.js";

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.error(`✓ ${name}`);
    passed++;
  } else {
    console.error(`✗ ${name}${detail ? `: ${detail}` : ""}`);
    failed++;
  }
}

const guidesIndex = loadGuidesIndex();
const membersIndex = loadMembersIndex();
const docsIndex = loadDocsIndex();
const examplesIndex = loadCodeExamplesIndex();
const knowledgeIndexes = {
  docs: docsIndex,
  guides: guidesIndex,
  members: membersIndex,
  examples: examplesIndex,
};

// Критерий фазы 1
const guideResults = searchGuides(guidesIndex, "модуль событий отчёта", { limit: 5 });
const top3Ids = guideResults.slice(0, 3).map((r) => r.id);
assert(
  "search_fore_guides('модуль событий отчёта') → KeReport_H_Events в топ-3",
  top3Ids.some((id) => id.includes("KeReport_H_Events")),
  `top-3: ${top3Ids.join(", ")}`
);

// Критерий фазы 2
const memberInfo = getMemberInfo("IPrxReportUserEvents.EventOnBeforeOpenReport");
assert(
  "get_member_info('IPrxReportUserEvents.EventOnBeforeOpenReport') → синтаксис + описание",
  memberInfo !== null &&
    memberInfo.includes("EventOnBeforeOpenReport") &&
    memberInfo.includes("Синтаксис") &&
    memberInfo.includes("Описание"),
  memberInfo?.slice(0, 100)
);

// Критерий фазы 3
const recipeResults = searchTaskRecipes("модуль событий отчёта", 3);
assert(
  "search_task_recipes('модуль событий отчёта') → report-events-module",
  recipeResults.length > 0 && recipeResults[0].id === "report-events-module",
  `top: ${recipeResults[0]?.id}`
);

const recipe = getTaskRecipe("report-events-module", true);
assert(
  "get_task_recipe('report-events-module') → 3 шага",
  recipe !== null && "steps" in recipe && recipe.steps.length === 3,
  `steps: ${recipe && "steps" in recipe ? recipe.steps.length : 0}`
);

// Критерий фазы 4: единый поиск
const knowledgeResults = searchForeKnowledge(knowledgeIndexes, "модуль событий отчёта", { limit: 10 });
const sources = new Set(knowledgeResults.map((r) => r.source));
assert(
  "search_fore_knowledge → recipe + guide + member в одном ответе",
  sources.has("task-recipe") && sources.has("guide"),
  `sources: ${[...sources].join(", ")}`
);

const context = getForeContext(knowledgeIndexes, "модуль событий отчёта");
assert(
  "get_fore_context → recipe + guides + members + suggestedNextTools",
  context.recipe !== null &&
    context.guides.length > 0 &&
    context.members.length > 0 &&
    context.suggestedNextTools.length >= 3,
  `recipe=${context.recipe?.id}, guides=${context.guides.length}, members=${context.members.length}, tools=${context.suggestedNextTools.length}`
);

// Критерий фазы 5: полнотекстовый поиск
const fulltextIndex = loadFulltextIndex();
assert(
  "fulltext-index загружен",
  fulltextIndex.totalDocuments > 1000,
  `documents: ${fulltextIndex.totalDocuments}`
);

const fulltextResults = searchFulltext(fulltextIndex, "обработка событий отчета", { limit: 5 });
assert(
  "search_fore_fulltext('обработка событий отчета') → KeReport_H_Events",
  fulltextResults.some((r) => r.id.includes("KeReport_H_Events")),
  `top: ${fulltextResults.map((r) => r.id).join(", ")}`
);

console.error(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
