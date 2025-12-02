import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DocIndexEntry {
  path: string;
  description: string;
  properties: string[];
  methods: string[];
}

export type DocsIndex = Record<string, DocIndexEntry>;

/**
 * Загружает индекс документации
 */
export function loadDocsIndex(): DocsIndex {
  const indexPath = path.join(__dirname, "..", "data", "docs-index.json");
  
  if (!fs.existsSync(indexPath)) {
    console.error(`Docs index not found at: ${indexPath}`);
    return {};
  }
  
  const content = fs.readFileSync(indexPath, "utf8");
  return JSON.parse(content);
}

/**
 * Поиск по документации
 */
export function searchDocs(index: DocsIndex, query: string, limit: number = 10): SearchResult[] {
  const results: SearchResult[] = [];
  const queryLower = query.toLowerCase();
  
  for (const [name, entry] of Object.entries(index)) {
    // Пропускаем свойства/методы (содержат точку)
    if (name.includes(".")) continue;
    
    let score = 0;
    
    // Точное совпадение имени
    if (name.toLowerCase() === queryLower) {
      score = 100;
    }
    // Имя начинается с запроса
    else if (name.toLowerCase().startsWith(queryLower)) {
      score = 80;
    }
    // Имя содержит запрос
    else if (name.toLowerCase().includes(queryLower)) {
      score = 60;
    }
    // Описание содержит запрос
    else if (entry.description?.toLowerCase().includes(queryLower)) {
      score = 40;
    }
    // Свойства или методы содержат запрос
    else if (
      entry.properties?.some(p => p.toLowerCase().includes(queryLower)) ||
      entry.methods?.some(m => m.toLowerCase().includes(queryLower))
    ) {
      score = 20;
    }
    
    if (score > 0) {
      results.push({
        name,
        score,
        description: entry.description || "",
        type: name.startsWith("I") ? "interface" : name.endsWith("Class") ? "class" : "other",
        propertiesCount: entry.properties?.length || 0,
        methodsCount: entry.methods?.length || 0,
      });
    }
  }
  
  // Сортируем по score и берем limit результатов
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

export interface SearchResult {
  name: string;
  score: number;
  description: string;
  type: "interface" | "class" | "other";
  propertiesCount: number;
  methodsCount: number;
}

/**
 * Получает подробную информацию об интерфейсе
 */
export async function getInterfaceInfo(index: DocsIndex, name: string): Promise<string> {
  const entry = index[name];
  
  if (!entry) {
    // Попробуем найти похожие
    const similar = searchDocs(index, name, 5);
    if (similar.length > 0) {
      return `Interface "${name}" not found. Did you mean:\n${similar.map(s => `- ${s.name}: ${s.description}`).join("\n")}`;
    }
    return `Interface "${name}" not found in documentation.`;
  }
  
  // Читаем markdown файл для полного описания
  const docsPath = path.join(__dirname, "..", "docs", entry.path);
  let fullDescription = entry.description;
  
  if (fs.existsSync(docsPath)) {
    const content = fs.readFileSync(docsPath, "utf8");
    fullDescription = content;
  }
  
  let result = `# ${name}\n\n`;
  
  if (entry.description) {
    result += `## Description\n${entry.description}\n\n`;
  }
  
  if (entry.properties && entry.properties.length > 0) {
    result += `## Properties (${entry.properties.length})\n`;
    result += entry.properties.map(p => `- \`${p}\``).join("\n");
    result += "\n\n";
  }
  
  if (entry.methods && entry.methods.length > 0) {
    result += `## Methods (${entry.methods.length})\n`;
    result += entry.methods.map(m => `- \`${m}()\``).join("\n");
    result += "\n\n";
  }
  
  result += `## Full Documentation\n\n${fullDescription}`;
  
  return result;
}

/**
 * Получает примеры кода
 */
export function getCodeExamples(topic: string): string {
  const examples: Record<string, string> = {
    IPrxReport: `# IPrxReport Code Examples

## Access Active Report
\`\`\`fore
Var
    report: IPrxReport;
Begin
    report := PrxReport.ActiveReport;
End
\`\`\`

## Find Control by ID
\`\`\`fore
Var
    ctrl: IPrxControl;
Begin
    ctrl := Report.Controls.FindById("CONTROL_ID");
    ctrl.Value := "New Value";
    Report.Recalc;
End
\`\`\`

## Iterate Controls
\`\`\`fore
Var
    controls: IPrxControls;
    ctrl: IPrxControl;
    i: Integer;
Begin
    controls := Report.Controls;
    For i := 0 To controls.Count - 1 Do
        ctrl := controls.Item(i);
        Debug.WriteLine(ctrl.Id + ": " + ctrl.Value.ToString);
    End For;
End
\`\`\``,

    IMetabase: `# IMetabase Code Examples

## Get Active Metabase
\`\`\`fore
Var
    mb: IMetabase;
Begin
    mb := MetabaseClass.Active;
End
\`\`\`

## Open Object by ID
\`\`\`fore
Var
    mb: IMetabase;
    obj: IMetabaseObjectDescriptor;
    inst: IMetabaseObjectInstance;
Begin
    mb := MetabaseClass.Active;
    obj := mb.ItemByIdNamespace("OBJECT_ID", BA_KEY);
    inst := obj.Open(Null);
End
\`\`\`

## Find Object by Name
\`\`\`fore
Var
    mb: IMetabase;
    obj: IMetabaseObjectDescriptor;
Begin
    mb := MetabaseClass.Active;
    obj := mb.ItemByName("Object Name");
End
\`\`\``,

    "sql-execution": `# SQL Execution Examples

## Simple Query
\`\`\`fore
Var
    db: IDatabaseInstance;
    cmd: IDalCommand;
    cur: IDalCursor;
Begin
    db := MetabaseClass.Active.ItemByIdNamespace("DB_ID", BA_KEY).Open(Null) As IDatabaseInstance;
    cmd := db.Connection.CreateCommand("");
    cmd.SQL := "SELECT * FROM table";
    cur := cmd.CreateCursor;
    While Not cur.Eof Do
        Debug.WriteLine(cur.Fields.Item(0).Value.ToString);
        cur.MoveNext;
    End While;
    cur.Close;
    cmd.Close;
End
\`\`\`

## Parameterized Query
\`\`\`fore
Var
    db: IDatabaseInstance;
    cmd: IDalCommand;
    cur: IDalCursor;
Begin
    db := MetabaseClass.Active.ItemByIdNamespace("DB_ID", BA_KEY).Open(Null) As IDatabaseInstance;
    cmd := db.Connection.CreateCommand("");
    cmd.SQL := "SELECT * FROM users WHERE id = :userId AND status = :status";
    cmd.Params.Item("userId").Value := 123;
    cmd.Params.Item("status").Value := "active";
    cur := cmd.CreateCursor;
    // ... process results
    cur.Close;
    cmd.Close;
End
\`\`\``,

    "dimension-iteration": `# Dimension Iteration Examples

## Iterate All Elements
\`\`\`fore
Var
    dim: IDimInstance;
    elements: IDimElements;
    i: Integer;
Begin
    dim := MetabaseClass.Active.ItemByIdNamespace("DICT_ID", BA_KEY).Open(Null) As IDimInstance;
    elements := dim.Elements;
    For i := 0 To elements.Count - 1 Do
        Debug.WriteLine("ID: " + elements.Id(i).ToString);
        Debug.WriteLine("Name: " + elements.Name(i));
    End For;
End
\`\`\`

## Find Element by Name
\`\`\`fore
Var
    dim: IDimInstance;
    elements: IDimElements;
    index: Integer;
Begin
    dim := MetabaseClass.Active.ItemByIdNamespace("DICT_ID", BA_KEY).Open(Null) As IDimInstance;
    elements := dim.Elements;
    index := elements.FindByName("Element Name");
    If index >= 0 Then
        Debug.WriteLine("Found at index: " + index.ToString);
    End If;
End
\`\`\``,

    "events-class": `# EventsClass Examples

## Basic EventsClass
\`\`\`fore
Public Class EventsClass: ReportEvents

    Public Sub OnBeforeOpenReport(Report: IPrxReport; Var Cancel: Boolean);
    Begin
        // Initialize report
        Report.Recalc;
    End Sub OnBeforeOpenReport;

    Public Sub OnChangeControlValue(Control: IPrxControl);
    Begin
        PrxReport.ActiveReport.Recalc;
    End Sub OnChangeControlValue;

End Class EventsClass;
\`\`\`

## With Grid Parameters
\`\`\`fore
Public Class EventsClass: ReportEvents

    Public Sub OnBeforeOpenReport(Report: IPrxReport; Var Cancel: Boolean);
    Var
        grid: IEaxGrid;
        params: IMetabaseObjectParamValues;
    Begin
        grid := Report.DataArea.Slices.Item(0).Views.FindById("GRID1") As IEaxGrid;
        If grid <> Null Then
            params := grid.ParamValues;
            params.FindById("P_DATE").Value := DateTime.Today;
        End If;
        Report.Recalc;
    End Sub OnBeforeOpenReport;

End Class EventsClass;
\`\`\``,
  };
  
  const topicLower = topic.toLowerCase();
  
  // Ищем по ключу
  for (const [key, value] of Object.entries(examples)) {
    if (key.toLowerCase() === topicLower || key.toLowerCase().includes(topicLower)) {
      return value;
    }
  }
  
  return `No examples found for "${topic}". Available topics:\n${Object.keys(examples).map(k => `- ${k}`).join("\n")}`;
}

