# FORe MCP Server

MCP-сервер для справки FORe (Foresight BI Desktop). Даёт ассистенту доступ к ~5000 интерфейсам, ~21 000 членам API, ~42 000 страницам документации и примерам кода.

## Что умеет

- **API**: поиск интерфейсов и классов, свойства, методы, связанные гайды и примеры
- **Члены API**: свойства, методы, события (например `IPrxReportUserEvents.EventOnBeforeOpenReport`)
- **Руководства**: Intro, Samples, Programming по модулям
- **Рецепты задач**: пошаговые планы для типовых сценариев (модуль событий отчёта, SQL, куб и т.д.)
- **Примеры кода**: паттерны FORe/JS/HTML из официальной справки
- **Единый поиск**: рецепты, гайды, API, члены и примеры в одном запросе
- **Полнотекст**: поиск по прозе всей справки на русском и английском

## Установка

```bash
cd fore-mcp-server
npm install
npm run build
```

После первой сборки или обновления `docs/` пересоберите индексы:

```bash
npm run index:all
```

## Подключение в Cursor

### Локально (stdio)

Добавьте в `~/.cursor/mcp.json`:

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

### Удалённый сервер (VPS / корпоративный сервер)

Сервер поддерживает **Streamable HTTP** — один инстанс для всей команды.

**1. Запуск на сервере**

```bash
npm run build
npm run start:http
```

Или через Docker:

```bash
docker compose up -d --build
```

**2. Подключение в Cursor**

```json
{
  "mcpServers": {
    "fore": {
      "url": "https://mcp.example.com/mcp"
    }
  }
}
```

**3. Reverse proxy (nginx)**

Пример конфигурации: [`deploy/nginx.conf.example`](deploy/nginx.conf.example)

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `FORE_MCP_TRANSPORT` | `stdio` | `http` для сетевого режима |
| `MCP_HOST` | `0.0.0.0` | Адрес прослушивания |
| `MCP_PORT` | `3000` | Порт |
| `MCP_PATH` | `/mcp` | HTTP-путь MCP |

Health-check: `GET /health`

## Как искать по задаче

Пример: *«Модуль отчёта: при открытии задать дату, при смене контрола пересчитать»*

```
1. search_fore_knowledge("модуль событий отчёта")
   рецепт + гайд + API в одном ответе

2. get_fore_context("модуль событий отчёта")
   полный контекст: рецепт, гайды, члены API, suggestedNextTools

3. get_task_recipe("report-events-module")
   пошаговый план со ссылками на гайды и API

4. get_guide("KeReport/Intro/Hierarchy/KeReport_H_Events.md")
   как устроен модуль событий

5. get_member_info("IPrxReportUserEvents.EventOnBeforeOpenReport")
   синтаксис и параметры события

6. get_code_examples("EventsClass")
   шаблон кода
```

Если структурированный поиск ничего не нашёл, попробуйте `search_fore_fulltext`.

## Инструменты MCP

### С чего начать

| Инструмент | Зачем |
|------------|-------|
| `search_fore_knowledge` | Поиск по всем индексам, в ответе есть подсказки `nextTool` |
| `get_fore_context` | Собрать контекст для задачи одним вызовом |
| `search_fore_fulltext` | Полнотекст по 42k страницам справки |

```json
{ "query": "модуль событий отчёта", "limit": 15 }
```

### Рецепты задач

| Инструмент | Зачем |
|------------|-------|
| `search_task_recipes` | Найти рецепт по описанию задачи |
| `get_task_recipe` | Полный план с гайдами, API и примерами |

```json
{ "id": "report-events-module" }
```

### Руководства

| Инструмент | Зачем |
|------------|-------|
| `search_fore_guides` | Поиск по Intro / Samples / Programming |
| `get_guide` | Полный markdown руководства |
| `list_module_guides` | Все гайды модуля (KeReport, KeDb, …) |

```json
{ "query": "модуль событий отчёта", "module": "KeReport" }
```

### API и члены

| Инструмент | Зачем |
|------------|-------|
| `search_fore_docs` | Поиск интерфейсов и классов |
| `get_interface_info` | Описание, свойства, методы, связанные гайды |
| `search_fore_members` | Поиск свойств, методов, событий |
| `get_member_info` | Синтаксис, описание, параметры |
| `list_interface_members` | Список членов интерфейса |

```json
{ "id": "IPrxReportUserEvents.EventOnBeforeOpenReport" }
```

### Примеры кода

| Инструмент | Зачем |
|------------|-------|
| `get_code_examples` | Примеры для сущности |
| `search_code_examples` | Поиск по имени, ключевому слову, паттерну |
| `get_code_example` | Один пример по ID |

```json
{ "entity": "IPrxReport", "limit": 5 }
```

### Синтаксис FORe

| Инструмент | Зачем |
|------------|-------|
| `get_fore_syntax` | Краткая справка по языку |

Темы: `basics`, `control-flow`, `types`, `operators`, `events`, `sql`, `dimensions`, `cubes`

```json
{ "topic": "events" }
```

## Сборка индексов

| Команда | Что строит | Файл |
|---------|------------|------|
| `npm run index:examples` | Примеры кода | `data/code-examples-index.json` |
| `npm run index:guides` | Руководства | `data/guides-index.json` |
| `npm run index:members` | Члены API | `data/members-index.json` |
| `npm run index:recipes` | Рецепты задач | `data/task-recipes.json` |
| `npm run index:fulltext` | Полнотекст | `data/fulltext-index.json` |
| `npm run index:all` | Всё сразу | |

## Разработка

```bash
npm run dev         # локально (stdio)
npm run dev:http    # HTTP на :3000
npm run build       # сборка
npm start           # stdio
npm run start:http  # HTTP-сервер
npm run test:smoke  # smoke-тесты
```

## Структура проекта

```
fore-mcp-server/
├── src/
│   ├── index.ts            # точка входа (stdio / --http)
│   ├── server.ts           # MCP-сервер и инструменты
│   ├── http-server.ts      # Streamable HTTP для VPS
│   ├── search.ts           # интерфейсы и классы
│   ├── guides.ts           # руководства
│   ├── members.ts          # члены API
│   ├── task-recipes.ts     # рецепты задач
│   ├── knowledge-search.ts # единый поиск
│   ├── fulltext.ts         # полнотекст
│   ├── code-examples.ts    # примеры кода
│   └── resources.ts        # MCP resources (docs/)
├── scripts/
│   ├── build-*-index.ts
│   ├── smoke-test.ts
│   └── lib/markdown-parse.ts
├── data/                   # JSON-индексы
├── docs/                   # markdown-справка
├── package.json
└── tsconfig.json
```

## Статистика (на момент сборки индексов)

| Метрика | Значение |
|---------|----------|
| Markdown-файлов | 42 551 |
| Полнотекстовый индекс | 42 551 документ (~65 МБ) |
| Интерфейсов и классов | 4 947 |
| Членов API | 21 432 |
| Примеров кода | 5 276 |
| Руководств | 478 |
| Рецептов задач | 498 |

## Лицензия

MIT

<!-- CHECKPOINT id="ckpt_mq4c3988_mieddy" time="2026-06-07T22:08:42.872Z" note="auto" fixes=0 questions=0 highlights=0 sections="" -->
