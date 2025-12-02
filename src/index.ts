#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { loadDocsIndex, searchDocs, getInterfaceInfo, getCodeExamples } from "./search.js";
import { readDocFile, listDocFiles } from "./resources.js";

// Загружаем индекс документации
const docsIndex = loadDocsIndex();

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
        description: "Get code examples for a specific FORe interface or pattern.",
        inputSchema: {
          type: "object",
          properties: {
            topic: {
              type: "string",
              description: "Interface name or pattern (e.g., IPrxReport, sql-execution, dimension-iteration)",
            },
          },
          required: ["topic"],
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
      const topic = args?.topic as string;
      const examples = getCodeExamples(topic);
      return {
        content: [
          {
            type: "text",
            text: examples,
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

// Запуск сервера
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("FORe MCP Server running on stdio");
}

main().catch(console.error);

