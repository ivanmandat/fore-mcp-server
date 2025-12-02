# FORe MCP Server

MCP (Model Context Protocol) сервер для работы с документацией FORe (Foresight BI Desktop). Предоставляет AI-ассистентам доступ к 4900+ интерфейсам и 42000+ страницам документации.

## Возможности

- **Поиск по документации** - поиск интерфейсов, классов и документации
- **Информация об интерфейсах** - описание, свойства, методы
- **Справка по синтаксису** - базовый синтаксис, управляющие конструкции, типы
- **Примеры кода** - готовые паттерны для популярных задач

## Установка

```bash
cd fore-mcp-server
npm install
npm run build
```

## Использование с Cursor

Добавьте в настройки Cursor (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "fore": {
      "command": "node",
      "args": ["C:/path/to/fore-mcp-server/dist/index.js"]
    }
  }
}
```

## Доступные инструменты

### search_fore_docs
Поиск по документации FORe.

```json
{
  "query": "IPrxReport",
  "limit": 10
}
```

### get_interface_info
Получить информацию об интерфейсе.

```json
{
  "name": "IPrxReport"
}
```

### get_fore_syntax
Справка по синтаксису FORe.

```json
{
  "topic": "basics"
}
```

Доступные темы: `basics`, `control-flow`, `types`, `operators`, `events`, `sql`, `dimensions`, `cubes`

### get_code_examples
Примеры кода для интерфейсов и паттернов.

```json
{
  "topic": "sql-execution"
}
```

## Разработка

```bash
# Запуск в режиме разработки
npm run dev

# Сборка
npm run build

# Запуск
npm start
```

## Структура проекта

```
fore-mcp-server/
├── src/
│   ├── index.ts      # Точка входа MCP сервера
│   ├── search.ts     # Поиск и информация об интерфейсах
│   └── resources.ts  # Работа с файлами документации
├── data/
│   └── docs-index.json  # Индекс документации (4947 записей)
├── docs/                # Markdown документация (42551 файлов)
├── package.json
└── tsconfig.json
```

## Статистика документации

| Метрика | Значение |
|---------|----------|
| Markdown файлов | 42,551 |
| Объем текста | ~97.5 МБ |
| Интерфейсов/классов в индексе | 4,947 |

## Лицензия

MIT

