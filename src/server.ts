#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { loadDocsIndex, searchDocs, getInterfaceInfo } from "./search.js";
import {
  loadCodeExamplesIndex,
  searchCodeExamples,
  getCodeExamplesForEntity,
  getExampleById,
  formatExampleDetails,
} from "./code-examples.js";
import { loadGuidesIndex, searchGuides, getGuide, listModuleGuides } from "./guides.js";
import { loadMembersIndex, searchMembers, getMemberInfo, listInterfaceMembers } from "./members.js";
import {
  searchTaskRecipes,
  getTaskRecipe,
  formatTaskRecipe,
} from "./task-recipes.js";
import { searchForeKnowledge, getForeContext } from "./knowledge-search.js";
import { loadFulltextIndex, searchFulltext } from "./fulltext.js";
import { readDocFile, listDocFiles } from "./resources.js";

// Загружаем индексы документации и примеров кода
const docsIndex = loadDocsIndex();
const codeExamplesIndex = loadCodeExamplesIndex();
const guidesIndex = loadGuidesIndex();
const membersIndex = loadMembersIndex();
const fulltextIndex = loadFulltextIndex();

export function createForeMcpServer(): Server {
  const server = new Server(
    {
      name: "fore-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  registerHandlers(server);
  return server;
}

function registerHandlers(server: Server): void {
  // Список доступных инструментов
  server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_fore_docs",
        description: "Search FORe (Foresight BI Desktop) documentation. Returns matching interfaces, classes, and documentation pages.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query (interface name, class name, or keyword)",
            },
            limit: {
              type: "number",
              description: "Maximum number of results (default: 10)",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "get_interface_info",
        description: "Get detailed information about a FORe interface or class, including description, properties, and methods.",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Interface or class name (e.g., IPrxReport, IMetabase, MetabaseClass)",
            },
          },
          required: ["name"],
        },
      },
      {
        name: "get_fore_syntax",
        description: "Get FORe language syntax reference and common patterns.",
        inputSchema: {
          type: "object",
          properties: {
            topic: {
              type: "string",
              description: "Syntax topic: 'basics', 'control-flow', 'types', 'operators', 'events', 'sql', 'dimensions', 'cubes'",
            },
          },
          required: ["topic"],
        },
      },
      {
        name: "get_code_examples",
        description: "Get code examples from FORe documentation for a specific interface, class, property, or method. Examples are extracted from official docs.",
        inputSchema: {
          type: "object",
          properties: {
            entity: {
              type: "string",
              description: "Entity name (e.g., IPrxReport, IMetabase, IDatabaseInstance.Views, IPrxReport.Recalc)",
            },
            limit: {
              type: "number",
              description: "Maximum number of examples to return (default: 5)",
            },
          },
          required: ["entity"],
        },
      },
      {
        name: "search_code_examples",
        description: "Search code examples database by interface/class/method name, keyword, or code pattern. Returns ranked results with previews.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query: interface name (IPrxReport), member (Views, Recalc), or keyword",
            },
            limit: {
              type: "number",
              description: "Maximum number of results (default: 10)",
            },
            language: {
              type: "string",
              description: "Filter by language: fore, javascript, html",
            },
            module: {
              type: "string",
              description: "Filter by module (e.g., KeReport, KeDb, KeSom)",
            },
            entityType: {
              type: "string",
              description: "Filter by type: interface, class, property, method, tutorial, syntax",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "get_code_example",
        description: "Get a single code example by its ID (from search_code_examples results).",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Example ID (e.g., KeDb/Interface/IDatabaseInstance/IDatabaseInstance.Views.md#1)",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "search_fore_guides",
        description:
          "Search FORe guides and tutorials (Intro, Samples, Programming docs). Use for task-oriented questions like 'how to write report events module' or 'модуль событий отчёта'.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query (topic, keyword, interface name)" },
            limit: { type: "number", description: "Maximum results (default: 10)" },
            module: { type: "string", description: "Filter by module (KeReport, KeDb, ...)" },
            type: {
              type: "string",
              description: "Filter by type: guide, tutorial, programming, module-overview",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "get_guide",
        description: "Get full guide/tutorial markdown by id or path (e.g., KeReport/Intro/Hierarchy/KeReport_H_Events.md).",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Guide id or path (with or without .md extension)",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "list_module_guides",
        description: "List all guides/tutorials for a FORe module (KeReport, KeDb, KeSom, ...).",
        inputSchema: {
          type: "object",
          properties: {
            module: { type: "string", description: "Module name" },
            type: {
              type: "string",
              description: "Optional filter: guide, tutorial, programming, module-overview",
            },
          },
          required: ["module"],
        },
      },
      {
        name: "search_fore_members",
        description:
          "Search API member pages (properties, methods, events). Use for specific members like EventOnBeforeOpenReport or IPrxReport.ForeModule.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Member name, Parent.Member, or keyword" },
            limit: { type: "number", description: "Maximum results (default: 10)" },
            parent: { type: "string", description: "Filter by parent interface/class" },
            memberType: {
              type: "string",
              description: "Filter: property, method, event",
            },
            module: { type: "string", description: "Filter by module" },
          },
          required: ["query"],
        },
      },
      {
        name: "get_member_info",
        description:
          "Get full member documentation (syntax, description, parameters). E.g. IPrxReportUserEvents.EventOnBeforeOpenReport.",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Member id in Parent.Member format",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "list_interface_members",
        description: "List all members of an interface/class with brief descriptions.",
        inputSchema: {
          type: "object",
          properties: {
            parent: { type: "string", description: "Interface or class name (e.g., IPrxReportUserEvents)" },
            memberType: {
              type: "string",
              description: "Optional filter: property, method, event",
            },
            withExamplesOnly: {
              type: "boolean",
              description: "Only members that have code examples (default: false)",
            },
          },
          required: ["parent"],
        },
      },
      {
        name: "search_task_recipes",
        description:
          "Search task recipes — step-by-step plans for common FORe tasks (report events module, SQL query, cube params, etc.).",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Task description or keywords" },
            limit: { type: "number", description: "Maximum results (default: 10)" },
          },
          required: ["query"],
        },
      },
      {
        name: "get_task_recipe",
        description:
          "Get a complete task recipe with resolved guides, API members, and code examples. E.g. report-events-module.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Recipe id (e.g., report-events-module)" },
          },
          required: ["id"],
        },
      },
      {
        name: "search_fore_knowledge",
        description:
          "Unified search across all FORe knowledge: task recipes, guides, API members, interfaces, and code examples. " +
          "Use as the first call for task-oriented questions like 'модуль событий отчёта' or 'how to export report'. " +
          "Returns ranked results with nextTool hints for follow-up calls.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Task description or keywords" },
            limit: { type: "number", description: "Maximum results (default: 15)" },
            module: { type: "string", description: "Filter by module (KeReport, KeDb, ...)" },
          },
          required: ["query"],
        },
      },
      {
        name: "get_fore_context",
        description:
          "Gather structured context for a FORe task in one call: top recipe with steps, guides, API members, " +
          "interfaces, code examples, and suggestedNextTools. Use when you need enough context to write a module " +
          "without multiple separate searches.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Task description or topic" },
            module: { type: "string", description: "Filter by module (KeReport, KeDb, ...)" },
          },
          required: ["query"],
        },
      },
      {
        name: "search_fore_fulltext",
        description:
          "Full-text search across all FORe documentation prose (42k+ pages). Use for arbitrary RU/EN questions " +
          "when structured search returns nothing, e.g. 'как добавить диаграмму на лист' or 'before open report handler'.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Natural language search query" },
            limit: { type: "number", description: "Maximum results (default: 10)" },
            module: { type: "string", description: "Filter by module (KeReport, KeDb, ...)" },
            docType: {
              type: "string",
              description: "Filter by type: guide, tutorial, programming, module-overview, member, api, doc",
            },
          },
          required: ["query"],
        },
      },
    ],
  };
});

// Обработка вызовов инструментов
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "search_fore_docs": {
      const query = args?.query as string;
      const limit = (args?.limit as number) || 10;
      const results = searchDocs(docsIndex, query, limit);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    }

    case "get_interface_info": {
      const interfaceName = args?.name as string;
      const info = await getInterfaceInfo(docsIndex, interfaceName);
      return {
        content: [
          {
            type: "text",
            text: info,
          },
        ],
      };
    }

    case "get_fore_syntax": {
      const topic = args?.topic as string;
      const syntax = getForeSyntax(topic);
      return {
        content: [
          {
            type: "text",
            text: syntax,
          },
        ],
      };
    }

    case "get_code_examples": {
      const entity = args?.entity as string;
      const limit = (args?.limit as number) || 5;
      const examples = getCodeExamplesForEntity(codeExamplesIndex, entity, limit);
      return {
        content: [
          {
            type: "text",
            text: examples,
          },
        ],
      };
    }

    case "search_code_examples": {
      const query = args?.query as string;
      const limit = (args?.limit as number) || 10;
      const language = args?.language as string | undefined;
      const module = args?.module as string | undefined;
      const entityType = args?.entityType as string | undefined;
      const results = searchCodeExamples(codeExamplesIndex, query, {
        limit,
        language,
        module,
        entityType,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                totalInIndex: codeExamplesIndex.totalExamples,
                resultsCount: results.length,
                results,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "get_code_example": {
      const id = args?.id as string;
      const example = getExampleById(id);
      if (!example) {
        return {
          content: [
            {
              type: "text",
              text: `Пример с id "${id}" не найден.`,
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text",
            text: formatExampleDetails(example),
          },
        ],
      };
    }

    case "search_fore_guides": {
      const query = args?.query as string;
      const limit = (args?.limit as number) || 10;
      const module = args?.module as string | undefined;
      const type = args?.type as "guide" | "tutorial" | "programming" | "module-overview" | undefined;
      const results = searchGuides(guidesIndex, query, { limit, module, type });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { totalInIndex: guidesIndex.totalGuides, resultsCount: results.length, results },
              null,
              2
            ),
          },
        ],
      };
    }

    case "get_guide": {
      const id = args?.id as string;
      const content = getGuide(id);
      return {
        content: [
          {
            type: "text",
            text: content ?? `Руководство "${id}" не найдено. Используйте search_fore_guides.`,
          },
        ],
      };
    }

    case "list_module_guides": {
      const module = args?.module as string;
      const type = args?.type as "guide" | "tutorial" | "programming" | "module-overview" | undefined;
      const guides = listModuleGuides(guidesIndex, module, type);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ module, count: guides.length, guides }, null, 2),
          },
        ],
      };
    }

    case "search_fore_members": {
      const query = args?.query as string;
      const limit = (args?.limit as number) || 10;
      const parent = args?.parent as string | undefined;
      const memberType = args?.memberType as "property" | "method" | "event" | undefined;
      const module = args?.module as string | undefined;
      const results = searchMembers(membersIndex, query, { limit, parent, memberType, module });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { totalInIndex: membersIndex.totalMembers, resultsCount: results.length, results },
              null,
              2
            ),
          },
        ],
      };
    }

    case "get_member_info": {
      const id = args?.id as string;
      const info = getMemberInfo(id);
      return {
        content: [
          {
            type: "text",
            text: info ?? `Член API "${id}" не найден. Используйте search_fore_members.`,
          },
        ],
      };
    }

    case "list_interface_members": {
      const parent = args?.parent as string;
      const memberType = args?.memberType as "property" | "method" | "event" | undefined;
      const withExamplesOnly = (args?.withExamplesOnly as boolean) ?? false;
      const members = listInterfaceMembers(membersIndex, parent, { memberType, withExamplesOnly });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ parent, count: members.length, members }, null, 2),
          },
        ],
      };
    }

    case "search_task_recipes": {
      const query = args?.query as string;
      const limit = (args?.limit as number) || 10;
      const results = searchTaskRecipes(query, limit);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ resultsCount: results.length, results }, null, 2),
          },
        ],
      };
    }

    case "get_task_recipe": {
      const id = args?.id as string;
      const recipe = getTaskRecipe(id, true);
      if (!recipe) {
        return {
          content: [
            {
              type: "text",
              text: `Рецепт "${id}" не найден. Используйте search_task_recipes.`,
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text",
            text: formatTaskRecipe(recipe as import("./task-recipes.js").ResolvedTaskRecipe),
          },
        ],
      };
    }

    case "search_fore_knowledge": {
      const query = args?.query as string;
      const limit = (args?.limit as number) || 15;
      const module = args?.module as string | undefined;
      const results = searchForeKnowledge(
        { docs: docsIndex, guides: guidesIndex, members: membersIndex, examples: codeExamplesIndex },
        query,
        { limit, module }
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ query, resultsCount: results.length, results }, null, 2),
          },
        ],
      };
    }

    case "get_fore_context": {
      const query = args?.query as string;
      const module = args?.module as string | undefined;
      const context = getForeContext(
        { docs: docsIndex, guides: guidesIndex, members: membersIndex, examples: codeExamplesIndex },
        query,
        { module }
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(context, null, 2),
          },
        ],
      };
    }

    case "search_fore_fulltext": {
      const query = args?.query as string;
      const limit = (args?.limit as number) || 10;
      const module = args?.module as string | undefined;
      const docType = args?.docType as
        | "guide"
        | "tutorial"
        | "programming"
        | "module-overview"
        | "member"
        | "api"
        | "doc"
        | undefined;
      const results = searchFulltext(fulltextIndex, query, { limit, module, docType });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { totalInIndex: fulltextIndex.totalDocuments, resultsCount: results.length, results },
              null,
              2
            ),
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Список ресурсов
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const resources = listDocFiles();
  return { resources };
});

// Чтение ресурса
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;
  const content = await readDocFile(uri);
  return {
    contents: [
      {
        uri,
        mimeType: "text/markdown",
        text: content,
      },
    ],
  };
});
}

// Справка по синтаксису FORe
function getForeSyntax(topic: string): string {
  const syntaxGuide: Record<string, string> = {
    basics: `# FORe Syntax Basics

FORe is a Pascal-like scripting language for Foresight BI Desktop.

## Variable Declaration
\`\`\`fore
Var
    name: Type;
    count: Integer;
    str: String;
    obj: IMetabase;
\`\`\`

## Procedure/Function Declaration
\`\`\`fore
Public Sub MyProcedure(param1: String; param2: Integer);
Begin
    // code
End Sub MyProcedure;

Public Function MyFunction(input: String): Integer;
Begin
    Return 42;
End Function MyFunction;
\`\`\`

## Assignment
- Use \`:=\` for assignment (not \`=\`)
\`\`\`fore
value := 5;
name := "Hello";
\`\`\``,

    "control-flow": `# FORe Control Flow

## If/Then/Else
\`\`\`fore
If condition Then
    // code
Else
    // code
End If;
\`\`\`

## For Loop
\`\`\`fore
For i := 0 To count - 1 Do
    // code
End For;
\`\`\`

## While Loop
\`\`\`fore
While Not cursor.Eof Do
    // code
    cursor.MoveNext;
End While;
\`\`\`

## Try/Except
\`\`\`fore
Try
    // risky code
Except On e: Exception Do
    Debug.WriteLine("Error: " + e.Message);
End Try;
\`\`\``,

    types: `# FORe Type System

## Primitive Types
- \`Integer\` - whole numbers
- \`String\` - text
- \`Boolean\` - True/False
- \`Variant\` - any type (like object)
- \`DateTime\` - date and time
- \`TimeSpan\` - time interval

## Collections
- \`Array\` - fixed-size array
- \`ArrayList\` - dynamic list
- \`HashTable\` - key-value pairs

## Interfaces (start with I)
- \`IPrxReport\` - Report object
- \`IMetabase\` - Repository
- \`ICubeInstance\` - Cube
- \`IDimInstance\` - Dimension

## Classes (end with Class)
- \`MetabaseClass\` - Metabase access
- \`PrxReport\` - Report class
- \`Debug\` - Debugging`,

    operators: `# FORe Operators

## Assignment
- \`:=\` - assign value

## Comparison
- \`=\` - equal
- \`<>\` - not equal
- \`<\`, \`>\`, \`<=\`, \`>=\` - comparison

## Logical
- \`And\` - logical AND
- \`Or\` - logical OR
- \`Not\` - logical NOT
- \`Xor\` - exclusive OR

## Arithmetic
- \`+\`, \`-\`, \`*\`, \`/\` - basic math
- \`Div\` - integer division
- \`Mod\` - modulo

## String
- \`+\` - concatenation`,

    events: `# FORe Event Handlers

## EventsClass Structure
\`\`\`fore
Public Class EventsClass: ReportEvents

    Public Sub OnBeforeOpenReport(Report: IPrxReport; Var Cancel: Boolean);
    Begin
        // Initialize report
        Report.Recalc;
    End Sub OnBeforeOpenReport;

    Public Sub OnChangeControlValue(Control: IPrxControl);
    Begin
        // React to control changes
        PrxReport.ActiveReport.Recalc;
    End Sub OnChangeControlValue;

End Class EventsClass;
\`\`\`

## Common Events
- \`OnBeforeOpenReport\` - before report opens
- \`OnChangeControlValue\` - control value changed
- \`OnBeforeTransferData\` - before data transfer
- \`OnAfterRefreshEaxGrid\` - after grid refresh`,

    sql: `# FORe SQL Execution

\`\`\`fore
Var
    db: IDatabaseInstance;
    cmd: IDalCommand;
    cur: IDalCursor;
    value: Variant;
Begin
    // Open database connection
    db := MetabaseClass.Active.ItemByIdNamespace("DB_ID", BA_KEY).Open(Null) As IDatabaseInstance;
    
    // Create command
    cmd := db.Connection.CreateCommand("");
    cmd.SQL := "SELECT column FROM table WHERE id = :id";
    cmd.Params.Item("id").Value := 123;
    
    // Execute and read results
    cur := cmd.CreateCursor;
    While Not cur.Eof Do
        value := cur.Fields.Item(0).Value;
        cur.MoveNext;
    End While;
    
    // Always close!
    cur.Close;
    cmd.Close;
End
\`\`\``,

    dimensions: `# FORe Dimension Operations

\`\`\`fore
Var
    dim: IDimInstance;
    elements: IDimElements;
    i: Integer;
Begin
    // Open dimension
    dim := MetabaseClass.Active.ItemByIdNamespace("DICT_ID", BA_KEY).Open(Null) As IDimInstance;
    elements := dim.Elements;
    
    // Iterate elements
    For i := 0 To elements.Count - 1 Do
        Debug.WriteLine("Name: " + elements.Name(i));
        Debug.WriteLine("Id: " + elements.Id(i).ToString);
    End For;
End
\`\`\`

## Key Interfaces
- \`IDimInstance\` - dimension instance
- \`IDimElements\` - element collection
- \`IDimSelection\` - selected elements
- \`IDimHierarchy\` - hierarchy`,

    cubes: `# FORe Cube Operations

\`\`\`fore
Var
    cube: ICubeInstance;
    segment: ICubeSegment;
    params: IMetabaseObjectParamValues;
Begin
    // Open cube
    cube := MetabaseClass.Active.ItemByIdNamespace("CUBE_ID", BA_KEY).Open(Null) As ICubeInstance;
    
    // Access segments
    segment := cube.Segments.Item(0);
    
    // Set parameters
    params := cube.ParamValues;
    params.FindById("P_DATE").Value := DateTime.Today;
End
\`\`\`

## Key Interfaces
- \`ICubeInstance\` - cube instance
- \`ICubeSegment\` - data segment
- \`ICubeSegments\` - segment collection`,
  };

  return syntaxGuide[topic] || `Unknown topic: ${topic}. Available topics: ${Object.keys(syntaxGuide).join(", ")}`;
}

