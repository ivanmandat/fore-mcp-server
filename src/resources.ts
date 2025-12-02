import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCS_PATH = path.join(__dirname, "..", "docs");

/**
 * Читает файл документации по URI
 */
export async function readDocFile(uri: string): Promise<string> {
  // URI формат: fore://docs/path/to/file.md
  const match = uri.match(/^fore:\/\/docs\/(.+)$/);
  
  if (!match) {
    throw new Error(`Invalid URI format: ${uri}`);
  }
  
  const relativePath = match[1];
  const fullPath = path.join(DOCS_PATH, relativePath);
  
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${relativePath}`);
  }
  
  return fs.readFileSync(fullPath, "utf8");
}

/**
 * Возвращает список основных ресурсов документации
 */
export function listDocFiles(): Resource[] {
  const resources: Resource[] = [];
  
  // Добавляем основные категории документации
  const categories = [
    { name: "KeReport", description: "Report interfaces (IPrxReport, IPrxControl, etc.)" },
    { name: "KeSom", description: "Metabase interfaces (IMetabase, IMetabaseObject, etc.)" },
    { name: "KeCubes", description: "Cube interfaces (ICubeInstance, ICubeSegment, etc.)" },
    { name: "KeDims", description: "Dimension interfaces (IDimInstance, IDimElements, etc.)" },
    { name: "KeDb", description: "Database interfaces (IDatabaseInstance, IDalCommand, etc.)" },
    { name: "Dal", description: "Data Access Layer interfaces" },
    { name: "KeRds", description: "RDS Dictionary interfaces" },
    { name: "ModForms", description: "Forms and controls" },
    { name: "Fore", description: "FORe language reference" },
    { name: "ForeSys", description: "System interfaces" },
  ];
  
  for (const cat of categories) {
    const catPath = path.join(DOCS_PATH, cat.name);
    if (fs.existsSync(catPath)) {
      resources.push({
        uri: `fore://docs/${cat.name}/README.md`,
        name: cat.name,
        description: cat.description,
        mimeType: "text/markdown",
      });
    }
  }
  
  return resources;
}

export interface Resource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

/**
 * Рекурсивно собирает все markdown файлы
 */
export function getAllDocFiles(dir: string = DOCS_PATH, prefix: string = ""): string[] {
  const files: string[] = [];
  
  if (!fs.existsSync(dir)) {
    return files;
  }
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    
    if (entry.isDirectory()) {
      files.push(...getAllDocFiles(path.join(dir, entry.name), relativePath));
    } else if (entry.name.endsWith(".md")) {
      files.push(relativePath);
    }
  }
  
  return files;
}

