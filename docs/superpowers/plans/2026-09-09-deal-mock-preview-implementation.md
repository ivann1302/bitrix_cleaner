# Deal Mock Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Создать локальный React-интерфейс фильтрации старых проигранных сделок с детерминированным mock-адаптером, полным preview до 3 000 записей, исключениями и точными счётчиками без сети и удаления.

**Architecture:** React-композиция зависит только от типизированного `BitrixAdapter`; текущая реализация `MockBitrixAdapter` фильтрует искусственные данные в памяти. Чистые доменные функции отвечают за нормализацию критериев, лимит, дедупликацию, выбор и пагинацию, а reducer принимает только результат актуальной ревизии поиска.

**Tech Stack:** React 19.3, TypeScript 6.0 со строгими флагами, Vite 8.2, Vitest 5, Testing Library, ESLint 10, Prettier 3.9, минимальный PHP 8.5.

**Spec:** `docs/superpowers/specs/2026-09-09-deal-mock-preview-design.md`

## Global Constraints

- Первая и единственная сущность этого среза — сделки; лиды не добавлять.
- Реальный SDK/REST Bitrix24, авторизация, CSV, подтверждение, DELETE, IndexedDB и публикация не входят в работу.
- Результат больше 3 000 записей возвращает `over-limit` без частичного списка; тихое обрезание запрещено.
- Все сделки mock-preview — проигранные; верхняя граница даты включительна и считается концом календарного дня mock-портала UTC+3.
- TypeScript: `strict`, `noUncheckedIndexedAccess` и `exactOptionalPropertyTypes` включены; `any`, `@ts-ignore` и двойные приведения запрещены.
- React запускается в `StrictMode`; поиск выполняется только после submit, поздний ответ старой ревизии игнорируется.
- Таблица показывает 25 строк на страницу; исключения и счётчики относятся ко всему результату.
- CRM-текст рендерится как текст; `dangerouslySetInnerHTML` и красные кнопки не используются.
- Vite собирает относительные asset-пути через `base: "./"`; `public/index.php` только отдаёт собранный `index.html`.
- Для каждого поведения сначала создаётся падающий тест, затем минимальная реализация и повторный прогон.
- Текущий каталог `.git` не является рабочим репозиторием. До исполнения плана пользователь должен разрешить его инициализацию или предоставить исправный checkout; шаги commit нельзя отмечать выполненными без реального commit.

## File Map

| Путь                                                       | Ответственность                                         |
| ---------------------------------------------------------- | ------------------------------------------------------- |
| `index.html`                                               | HTML-точка входа Vite                                   |
| `public/index.php`                                         | Тонкая PHP-точка входа собранного пакета                |
| `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` | Строгая компиляция приложения и конфигурации Vite       |
| `vite.config.ts`, `eslint.config.js`                       | Сборка, Vitest и lint                                   |
| `src/main.tsx`                                             | Единственный React mount в `StrictMode`                 |
| `src/app/App.tsx`                                          | Композиция адаптера, формы, поиска и preview            |
| `src/styles.css`                                           | Токены и адаптивная раскладка интерфейса                |
| `src/test/setup.ts`                                        | Настройка `jest-dom` для Vitest                         |
| `src/test/dealFixtures.ts`                                 | Малые тестовые фабрики сделок и справочников            |
| `src/deals/domain/types.ts`                                | Доменные модели, критерии и результаты адаптера         |
| `src/deals/domain/dealSearch.ts`                           | Нормализация, валидация, лимит и дедупликация           |
| `src/deals/domain/selection.ts`                            | Исключения, выбранные ID и счётчики                     |
| `src/deals/data/BitrixAdapter.ts`                          | Read-only порт приложения к данным сделок               |
| `src/deals/data/mockDeals.ts`                              | Детерминированные демо-данные и справочники             |
| `src/deals/data/MockBitrixAdapter.ts`                      | Фильтрация mock-данных и управляемое тестовое поведение |
| `src/deals/state/searchState.ts`                           | Дискриминированное состояние и reducer ревизий          |
| `src/deals/state/useDealSearch.ts`                         | Единственная асинхронная команда поиска                 |
| `src/deals/ui/DealFilters.tsx`                             | Доступная контролируемая форма критериев                |
| `src/deals/ui/SearchFeedback.tsx`                          | Initial/loading/empty/over-limit/failure сообщения      |
| `src/deals/ui/pagination.ts`                               | Чистая клиентская пагинация                             |
| `src/deals/ui/DealPreview.tsx`                             | Таблица, исключения, сводка и навигация страниц         |

---

### Task 1: Strict Vite Shell and PHP Entry

**Files:**

- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `eslint.config.js`
- Create: `index.html`
- Create: `public/index.php`
- Create: `src/test/setup.ts`
- Create: `src/app/App.test.tsx`
- Create: `src/app/App.tsx`
- Create: `src/main.tsx`
- Create: `src/styles.css`
- Verify: `package.json`

**Interfaces:**

- Consumes: установленные scripts и версии из `package.json`.
- Produces: `App(): JSX.Element`, DOM-контейнер `#root`, работающие `typecheck`, `lint`, `test`, `build` и PHP lint.

- [ ] **Step 1: Создать строгие TypeScript-конфиги**

`tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

`tsconfig.app.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": false,
    "verbatimModuleSyntax": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

`tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "types": ["node"]
  },
  "include": ["vite.config.ts", "eslint.config.js"]
}
```

- [ ] **Step 2: Настроить Vite, Vitest и ESLint без новых зависимостей**

`vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
```

`eslint.config.js`:

```js
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage", "crm-cleaner-docs"] },
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}", "vite.config.ts"],
    languageOptions: {
      ecmaVersion: 2024,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      ...reactRefresh.configs.vite.rules,
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
);
```

`src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Написать падающий smoke-тест приложения**

`src/app/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("явно показывает локальный режим сделок", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Старые проигранные сделки" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Демо-режим")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /удалить/i }),
    ).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Запустить smoke-тест и подтвердить ожидаемое падение**

Run: `npm test -- src/app/App.test.tsx`

Expected: FAIL с ошибкой импорта `./App`, потому что компонент ещё не создан.

- [ ] **Step 5: Реализовать минимальный React- и HTML-каркас**

`src/app/App.tsx`:

```tsx
export function App() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <strong>CRM Cleaner</strong>
        <span className="demo-badge">Демо-режим</span>
      </header>
      <section className="page" aria-labelledby="page-title">
        <p className="eyebrow">Сделки · только чтение</p>
        <h1 id="page-title">Старые проигранные сделки</h1>
        <p>Настройте условия и проверьте результат на искусственных данных.</p>
      </section>
    </main>
  );
}
```

`src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./styles.css";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("Root element is missing");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/styles.css`:

```css
:root {
  color: #172321;
  background: #f6f7f4;
  font-family:
    Inter,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}
```

`index.html`:

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light" />
    <title>CRM Cleaner · Демо</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Добавить минимальный PHP-вход**

`public/index.php`:

```php
<?php

declare(strict_types=1);

$indexPath = __DIR__ . '/index.html';

if (!is_file($indexPath)) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=UTF-8');
    echo 'CRM Cleaner build is incomplete.';
    exit;
}

header('Content-Type: text/html; charset=UTF-8');
readfile($indexPath);
```

- [ ] **Step 7: Проверить каркас всеми относящимися командами**

Run: `npm test -- src/app/App.test.tsx`

Expected: PASS, 1 test.

Run: `npm run typecheck`

Expected: exit 0 без TypeScript diagnostics.

Run: `npm run lint`

Expected: exit 0 без ESLint errors.

Run: `npm run build`

Expected: exit 0; `dist/index.html`, `dist/index.php` и hashed assets существуют.

Run: `php -l public/index.php`

Expected: `No syntax errors detected in public/index.php`.

- [ ] **Step 8: Зафиксировать каркас**

```bash
git add tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts eslint.config.js index.html public/index.php src
git commit -m "build: scaffold strict deal preview app"
```

---

### Task 2: Deal Domain Rules

**Files:**

- Create: `src/deals/domain/types.ts`
- Create: `src/deals/domain/dealSearch.ts`
- Create: `src/deals/domain/dealSearch.test.ts`
- Create: `src/deals/domain/selection.ts`
- Create: `src/deals/domain/selection.test.ts`
- Create: `src/test/dealFixtures.ts`

**Interfaces:**

- Consumes: только стандартные возможности TypeScript.
- Produces: `Deal`, `DealFilterOptions`, `DealSearchDraft`, `DealSearchCriteria`, `DealSearchResult`, `validateDealSearchDraft()`, `deduplicateDeals()`, `isDealSearchOverLimit()`, `getSelectionCounts()`, `getSelectedDealIds()`.

- [ ] **Step 1: Написать падающие тесты критериев, лимита и дедупликации**

`src/deals/domain/dealSearch.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEAL_SEARCH_LIMIT,
  criteriaSignature,
  deduplicateDeals,
  isDealSearchOverLimit,
  validateDealSearchDraft,
} from "./dealSearch";
import { createDeal } from "../../test/dealFixtures";

describe("validateDealSearchDraft", () => {
  it("отклоняет фильтр без содержательного ограничения", () => {
    const result = validateDealSearchDraft({
      dateField: "createdAt",
      beforeDate: "",
      pipelineId: "",
      stageId: "",
      assignedById: "",
    });

    expect(result).toEqual({
      ok: false,
      fieldErrors: {},
      formError: "Добавьте хотя бы одно условие поиска.",
    });
  });

  it("отклоняет невозможную календарную дату", () => {
    const result = validateDealSearchDraft({
      dateField: "updatedAt",
      beforeDate: "2026-02-30",
      pipelineId: "",
      stageId: "",
      assignedById: "",
    });

    expect(result).toEqual({
      ok: false,
      fieldErrors: { beforeDate: "Укажите корректную календарную дату." },
    });
  });

  it("нормализует пустые строки в null", () => {
    const result = validateDealSearchDraft({
      dateField: "updatedAt",
      beforeDate: "2026-08-31",
      pipelineId: " ",
      stageId: "",
      assignedById: "",
    });

    expect(result).toEqual({
      ok: true,
      criteria: {
        dateField: "updatedAt",
        beforeDate: "2026-08-31",
        pipelineId: null,
        stageId: null,
        assignedById: null,
      },
    });
  });
});

describe("deal search invariants", () => {
  it("допускает ровно 3 000 и блокирует 3 001", () => {
    expect(DEAL_SEARCH_LIMIT).toBe(3000);
    expect(isDealSearchOverLimit(3000)).toBe(false);
    expect(isDealSearchOverLimit(3001)).toBe(true);
  });

  it("оставляет первую сделку каждого ID", () => {
    const first = createDeal({ id: "7", title: "Первая" });
    const duplicate = createDeal({ id: "7", title: "Дубликат" });
    const second = createDeal({ id: "8", title: "Вторая" });

    expect(deduplicateDeals([first, duplicate, second])).toEqual([
      first,
      second,
    ]);
  });

  it("создаёт стабильную подпись нормализованных критериев", () => {
    expect(
      criteriaSignature({
        dateField: "createdAt",
        beforeDate: "2026-08-31",
        pipelineId: null,
        stageId: null,
        assignedById: null,
      }),
    ).toBe("createdAt|2026-08-31|||");
  });
});
```

- [ ] **Step 2: Написать падающие тесты выбранного набора и счётчиков**

`src/deals/domain/selection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createDeal } from "../../test/dealFixtures";
import {
  getSelectedDealIds,
  getSelectionCounts,
  toggleExcludedId,
} from "./selection";

describe("preview selection", () => {
  const deals = [createDeal({ id: "1" }), createDeal({ id: "2" })];

  it("исключает ID из выбранного набора и считает весь результат", () => {
    const excludedIds = toggleExcludedId(new Set<string>(), "2");

    expect(getSelectedDealIds(deals, excludedIds)).toEqual(["1"]);
    expect(getSelectionCounts(deals, excludedIds)).toEqual({
      found: 2,
      selected: 1,
      excluded: 1,
    });
  });

  it("повторное действие возвращает ID", () => {
    const excluded = toggleExcludedId(new Set<string>(), "2");
    const restored = toggleExcludedId(excluded, "2");

    expect([...restored]).toEqual([]);
  });
});
```

- [ ] **Step 3: Запустить доменные тесты и подтвердить ожидаемое падение**

Run: `npm test -- src/deals/domain`

Expected: FAIL с ошибками отсутствующих модулей `dealSearch`, `selection` и `dealFixtures`.

- [ ] **Step 4: Определить единые доменные типы**

`src/deals/domain/types.ts`:

```ts
export type DateField = "createdAt" | "updatedAt";

export interface Deal {
  readonly id: string;
  readonly title: string;
  readonly pipelineId: string;
  readonly pipelineName: string;
  readonly stageId: string;
  readonly stageName: string;
  readonly assignedById: string;
  readonly assignedByName: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NamedOption {
  readonly id: string;
  readonly name: string;
}

export interface DealStageOption extends NamedOption {
  readonly pipelineId: string;
  readonly isLost: boolean;
}

export interface DealFilterOptions {
  readonly pipelines: readonly NamedOption[];
  readonly stages: readonly DealStageOption[];
  readonly assignees: readonly NamedOption[];
  readonly timeZoneLabel: string;
}

export interface DealSearchDraft {
  readonly dateField: DateField;
  readonly beforeDate: string;
  readonly pipelineId: string;
  readonly stageId: string;
  readonly assignedById: string;
}

export interface DealSearchCriteria {
  readonly dateField: DateField;
  readonly beforeDate: string | null;
  readonly pipelineId: string | null;
  readonly stageId: string | null;
  readonly assignedById: string | null;
}

export type DealSearchResult =
  | { readonly kind: "success"; readonly items: readonly Deal[] }
  | { readonly kind: "empty" }
  | { readonly kind: "over-limit"; readonly matchedAtLeast: number }
  | { readonly kind: "failure"; readonly code: string };

export interface DealSearchValidationErrors {
  readonly beforeDate?: string;
  readonly form?: string;
}

export type DealSearchValidation =
  | { readonly ok: true; readonly criteria: DealSearchCriteria }
  | {
      readonly ok: false;
      readonly fieldErrors: DealSearchValidationErrors;
      readonly formError?: string;
    };
```

- [ ] **Step 5: Реализовать минимальные чистые правила поиска**

`src/deals/domain/dealSearch.ts`:

```ts
import type {
  Deal,
  DealSearchCriteria,
  DealSearchDraft,
  DealSearchValidation,
} from "./types";

export const DEAL_SEARCH_LIMIT = 3000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function emptyToNull(value: string): string | null {
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

function isCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function normalizeDealSearchDraft(
  draft: DealSearchDraft,
): DealSearchCriteria {
  return {
    dateField: draft.dateField,
    beforeDate: emptyToNull(draft.beforeDate),
    pipelineId: emptyToNull(draft.pipelineId),
    stageId: emptyToNull(draft.stageId),
    assignedById: emptyToNull(draft.assignedById),
  };
}

export function validateDealSearchDraft(
  draft: DealSearchDraft,
): DealSearchValidation {
  const criteria = normalizeDealSearchDraft(draft);

  if (criteria.beforeDate !== null && !isCalendarDate(criteria.beforeDate)) {
    return {
      ok: false,
      fieldErrors: { beforeDate: "Укажите корректную календарную дату." },
    };
  }

  const hasRestriction =
    criteria.beforeDate !== null ||
    criteria.pipelineId !== null ||
    criteria.stageId !== null ||
    criteria.assignedById !== null;

  if (!hasRestriction) {
    return {
      ok: false,
      fieldErrors: {},
      formError: "Добавьте хотя бы одно условие поиска.",
    };
  }

  return { ok: true, criteria };
}

export function isDealSearchOverLimit(count: number): boolean {
  return count > DEAL_SEARCH_LIMIT;
}

export function deduplicateDeals(deals: readonly Deal[]): readonly Deal[] {
  const seen = new Set<string>();
  return deals.filter((deal) => {
    if (seen.has(deal.id)) {
      return false;
    }
    seen.add(deal.id);
    return true;
  });
}

export function criteriaSignature(criteria: DealSearchCriteria): string {
  return [
    criteria.dateField,
    criteria.beforeDate ?? "",
    criteria.pipelineId ?? "",
    criteria.stageId ?? "",
    criteria.assignedById ?? "",
  ].join("|");
}
```

- [ ] **Step 6: Реализовать выбор и малую фабрику тестовых данных**

`src/deals/domain/selection.ts`:

```ts
import type { Deal } from "./types";

export interface SelectionCounts {
  readonly found: number;
  readonly selected: number;
  readonly excluded: number;
}

export function toggleExcludedId(
  excludedIds: ReadonlySet<string>,
  id: string,
): ReadonlySet<string> {
  const next = new Set(excludedIds);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

export function getSelectedDealIds(
  deals: readonly Deal[],
  excludedIds: ReadonlySet<string>,
): readonly string[] {
  return deals
    .filter((deal) => !excludedIds.has(deal.id))
    .map((deal) => deal.id);
}

export function getSelectionCounts(
  deals: readonly Deal[],
  excludedIds: ReadonlySet<string>,
): SelectionCounts {
  const excluded = deals.reduce(
    (count, deal) => count + Number(excludedIds.has(deal.id)),
    0,
  );
  return { found: deals.length, selected: deals.length - excluded, excluded };
}
```

`src/test/dealFixtures.ts`:

```ts
import type { Deal, DealFilterOptions } from "../deals/domain/types";

export function createDeal(overrides: Partial<Deal> = {}): Deal {
  return {
    id: "1",
    title: "Тестовая сделка",
    pipelineId: "main",
    pipelineName: "Основная",
    stageId: "main-lost",
    stageName: "Проиграна",
    assignedById: "10",
    assignedByName: "Анна Смирнова",
    createdAt: "2026-01-10T09:00:00.000Z",
    updatedAt: "2026-01-20T09:00:00.000Z",
    ...overrides,
  };
}

export const TEST_FILTER_OPTIONS: DealFilterOptions = {
  pipelines: [{ id: "main", name: "Основная" }],
  stages: [
    { id: "main-lost", name: "Проиграна", pipelineId: "main", isLost: true },
  ],
  assignees: [{ id: "10", name: "Анна Смирнова" }],
  timeZoneLabel: "UTC+3",
};
```

- [ ] **Step 7: Запустить доменные проверки**

Run: `npm test -- src/deals/domain`

Expected: PASS, 8 tests.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 8: Зафиксировать доменную модель**

```bash
git add src/deals/domain src/test/dealFixtures.ts
git commit -m "feat: define deal search domain rules"
```

---

### Task 3: Deterministic Mock Adapter

**Files:**

- Create: `src/deals/data/BitrixAdapter.ts`
- Create: `src/deals/data/mockDeals.ts`
- Create: `src/deals/data/MockBitrixAdapter.ts`
- Create: `src/deals/data/MockBitrixAdapter.test.ts`

**Interfaces:**

- Consumes: `DealSearchCriteria`, `DealSearchResult`, `DealFilterOptions`, `deduplicateDeals()`, `isDealSearchOverLimit()`.
- Produces: `BitrixAdapter.getDealFilterOptions()`, `BitrixAdapter.searchDeals()`, `MockBitrixAdapter`, `MOCK_DEALS`, `MOCK_FILTER_OPTIONS`.

- [x] **Step 1: Написать падающие контрактные тесты mock-адаптера**

`src/deals/data/MockBitrixAdapter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createDeal } from "../../test/dealFixtures";
import type { DealSearchCriteria } from "../domain/types";
import { MockBitrixAdapter } from "./MockBitrixAdapter";
import { MOCK_FILTER_OPTIONS } from "./mockDeals";

const baseCriteria: DealSearchCriteria = {
  dateField: "createdAt",
  beforeDate: "2026-01-31",
  pipelineId: null,
  stageId: null,
  assignedById: null,
};

describe("MockBitrixAdapter", () => {
  it("возвращает только проигранные стадии в справочнике", async () => {
    const adapter = new MockBitrixAdapter();
    const options = await adapter.getDealFilterOptions();

    expect(options.stages.every((stage) => stage.isLost)).toBe(true);
  });

  it("фильтрует по включительной дате создания", async () => {
    const adapter = new MockBitrixAdapter({
      deals: [
        createDeal({ id: "1", createdAt: "2026-01-31T20:59:59.999Z" }),
        createDeal({ id: "2", createdAt: "2026-01-31T21:00:00.000Z" }),
      ],
      options: MOCK_FILTER_OPTIONS,
    });

    await expect(adapter.searchDeals(baseCriteria)).resolves.toEqual({
      kind: "success",
      items: [expect.objectContaining({ id: "1" })],
    });
  });

  it("использует выбранное поле изменения и дополнительные условия", async () => {
    const adapter = new MockBitrixAdapter({
      deals: [
        createDeal({ id: "1", updatedAt: "2026-01-10T09:00:00.000Z" }),
        createDeal({ id: "2", assignedById: "20" }),
        createDeal({ id: "3", pipelineId: "repeat", stageId: "repeat-lost" }),
      ],
      options: MOCK_FILTER_OPTIONS,
    });

    await expect(
      adapter.searchDeals({
        dateField: "updatedAt",
        beforeDate: "2026-01-31",
        pipelineId: "main",
        stageId: "main-lost",
        assignedById: "10",
      }),
    ).resolves.toEqual({
      kind: "success",
      items: [expect.objectContaining({ id: "1" })],
    });
  });

  it("не возвращает активные сделки и удаляет повторные ID", async () => {
    const adapter = new MockBitrixAdapter({
      deals: [
        createDeal({ id: "1" }),
        createDeal({ id: "1", title: "Дубликат" }),
        createDeal({ id: "2", stageId: "main-active" }),
      ],
      options: MOCK_FILTER_OPTIONS,
    });

    await expect(adapter.searchDeals(baseCriteria)).resolves.toEqual({
      kind: "success",
      items: [expect.objectContaining({ id: "1", title: "Тестовая сделка" })],
    });
  });

  it("различает empty и управляемую failure", async () => {
    const emptyAdapter = new MockBitrixAdapter({
      deals: [],
      options: MOCK_FILTER_OPTIONS,
    });
    const failedAdapter = new MockBitrixAdapter({
      behavior: { failureCode: "mock-unavailable" },
    });

    await expect(emptyAdapter.searchDeals(baseCriteria)).resolves.toEqual({
      kind: "empty",
    });
    await expect(failedAdapter.searchDeals(baseCriteria)).resolves.toEqual({
      kind: "failure",
      code: "mock-unavailable",
    });
  });
});
```

- [x] **Step 2: Запустить тест адаптера и подтвердить ожидаемое падение**

Run: `npm test -- src/deals/data/MockBitrixAdapter.test.ts`

Expected: FAIL с ошибкой отсутствующего `MockBitrixAdapter`.

- [x] **Step 3: Определить read-only порт данных**

`src/deals/data/BitrixAdapter.ts`:

```ts
import type {
  DealFilterOptions,
  DealSearchCriteria,
  DealSearchResult,
} from "../domain/types";

export interface BitrixAdapter {
  getDealFilterOptions(): Promise<DealFilterOptions>;
  searchDeals(criteria: DealSearchCriteria): Promise<DealSearchResult>;
}
```

- [x] **Step 4: Добавить детерминированные справочники и сделки**

`src/deals/data/mockDeals.ts` должен экспортировать следующие точные объекты:

```ts
import type { Deal, DealFilterOptions } from "../domain/types";

export const MOCK_FILTER_OPTIONS: DealFilterOptions = {
  pipelines: [
    { id: "main", name: "Основная" },
    { id: "repeat", name: "Повторные продажи" },
  ],
  stages: [
    { id: "main-active", name: "В работе", pipelineId: "main", isLost: false },
    { id: "main-lost", name: "Проиграна", pipelineId: "main", isLost: true },
    {
      id: "repeat-lost",
      name: "Не состоялась",
      pipelineId: "repeat",
      isLost: true,
    },
  ],
  assignees: [
    { id: "10", name: "Анна Смирнова" },
    { id: "20", name: "Михаил Волков" },
  ],
  timeZoneLabel: "UTC+3",
};

export const MOCK_DEALS: readonly Deal[] = [
  {
    id: "101",
    title: "Поставка оборудования",
    pipelineId: "main",
    pipelineName: "Основная",
    stageId: "main-lost",
    stageName: "Проиграна",
    assignedById: "10",
    assignedByName: "Анна Смирнова",
    createdAt: "2025-11-15T08:10:00.000Z",
    updatedAt: "2026-01-19T12:30:00.000Z",
  },
  {
    id: "102",
    title: "Продление сопровождения",
    pipelineId: "repeat",
    pipelineName: "Повторные продажи",
    stageId: "repeat-lost",
    stageName: "Не состоялась",
    assignedById: "20",
    assignedByName: "Михаил Волков",
    createdAt: "2026-02-01T07:00:00.000Z",
    updatedAt: "2026-04-03T14:15:00.000Z",
  },
  {
    id: "103",
    title: "Пилот CRM",
    pipelineId: "main",
    pipelineName: "Основная",
    stageId: "main-active",
    stageName: "В работе",
    assignedById: "10",
    assignedByName: "Анна Смирнова",
    createdAt: "2025-09-05T10:00:00.000Z",
    updatedAt: "2026-08-15T11:45:00.000Z",
  },
];
```

- [x] **Step 5: Реализовать фильтрацию, дедупликацию, лимит и управляемую задержку**

`src/deals/data/MockBitrixAdapter.ts`:

```ts
import { deduplicateDeals, isDealSearchOverLimit } from "../domain/dealSearch";
import type {
  Deal,
  DealFilterOptions,
  DealSearchCriteria,
  DealSearchResult,
} from "../domain/types";
import type { BitrixAdapter } from "./BitrixAdapter";
import { MOCK_DEALS, MOCK_FILTER_OPTIONS } from "./mockDeals";

const MOCK_TIME_ZONE_OFFSET_MINUTES = 180;

export interface MockBitrixAdapterBehavior {
  readonly delayMs?: number | ((criteria: DealSearchCriteria) => number);
  readonly failureCode?: string;
}

export interface MockBitrixAdapterConfig {
  readonly deals?: readonly Deal[];
  readonly options?: DealFilterOptions;
  readonly behavior?: MockBitrixAdapterBehavior;
}

function endOfMockDay(date: string): number {
  return (
    Date.parse(`${date}T23:59:59.999Z`) -
    MOCK_TIME_ZONE_OFFSET_MINUTES * 60 * 1000
  );
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export class MockBitrixAdapter implements BitrixAdapter {
  private readonly deals: readonly Deal[];
  private readonly options: DealFilterOptions;
  private readonly behavior: MockBitrixAdapterBehavior;

  public constructor(config: MockBitrixAdapterConfig = {}) {
    this.deals = config.deals ?? MOCK_DEALS;
    this.options = config.options ?? MOCK_FILTER_OPTIONS;
    this.behavior = config.behavior ?? {};
  }

  public getDealFilterOptions(): Promise<DealFilterOptions> {
    return Promise.resolve({
      ...this.options,
      stages: this.options.stages.filter((stage) => stage.isLost),
    });
  }

  public async searchDeals(
    criteria: DealSearchCriteria,
  ): Promise<DealSearchResult> {
    const configuredDelay = this.behavior.delayMs ?? 0;
    const delay =
      typeof configuredDelay === "function"
        ? configuredDelay(criteria)
        : configuredDelay;
    if (delay > 0) {
      await wait(delay);
    }

    if (this.behavior.failureCode !== undefined) {
      return { kind: "failure", code: this.behavior.failureCode };
    }

    const lostStageIds = new Set(
      this.options.stages
        .filter((stage) => stage.isLost)
        .map((stage) => stage.id),
    );
    const cutoff =
      criteria.beforeDate === null ? null : endOfMockDay(criteria.beforeDate);

    const matches = deduplicateDeals(
      this.deals.filter((deal) => {
        if (!lostStageIds.has(deal.stageId)) return false;
        if (
          criteria.pipelineId !== null &&
          deal.pipelineId !== criteria.pipelineId
        )
          return false;
        if (criteria.stageId !== null && deal.stageId !== criteria.stageId)
          return false;
        if (
          criteria.assignedById !== null &&
          deal.assignedById !== criteria.assignedById
        )
          return false;
        if (cutoff !== null && Date.parse(deal[criteria.dateField]) > cutoff)
          return false;
        return true;
      }),
    );

    if (isDealSearchOverLimit(matches.length)) {
      return { kind: "over-limit", matchedAtLeast: matches.length };
    }
    if (matches.length === 0) {
      return { kind: "empty" };
    }
    return { kind: "success", items: matches };
  }
}
```

- [x] **Step 6: Запустить тесты адаптера и домена**

Run: `npm test -- src/deals/data src/deals/domain`

Expected: PASS, 18 tests.

Run: `npm run typecheck`

Expected: exit 0.

- [x] **Step 7: Зафиксировать mock-границу данных**

```bash
git add src/deals/data
git commit -m "feat: add deterministic deal mock adapter"
```

---

### Task 4: Revision-Safe Search State

**Files:**

- Create: `src/deals/state/searchState.ts`
- Create: `src/deals/state/searchState.test.ts`
- Create: `src/deals/state/useDealSearch.ts`
- Create: `src/deals/state/useDealSearch.test.tsx`

**Interfaces:**

- Consumes: `BitrixAdapter.searchDeals()`, `DealSearchCriteria`, `DealSearchResult`, `toggleExcludedId()`.
- Produces: `DealSearchState`, `dealSearchReducer()`, `useDealSearch(adapter)` returning `{ state, search, toggleExcluded }`.

- [ ] **Step 1: Написать падающие reducer-тесты переходов и ревизий**

`src/deals/state/searchState.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createDeal } from "../../test/dealFixtures";
import type { DealSearchCriteria } from "../domain/types";
import { INITIAL_DEAL_SEARCH_STATE, dealSearchReducer } from "./searchState";

const criteria: DealSearchCriteria = {
  dateField: "createdAt",
  beforeDate: "2026-01-31",
  pipelineId: null,
  stageId: null,
  assignedById: null,
};

describe("dealSearchReducer", () => {
  it("переходит initial → loading → ready", () => {
    const loading = dealSearchReducer(INITIAL_DEAL_SEARCH_STATE, {
      type: "started",
      revision: 1,
      criteria,
    });
    const ready = dealSearchReducer(loading, {
      type: "resolved",
      revision: 1,
      result: { kind: "success", items: [createDeal()] },
    });

    expect(loading).toMatchObject({ kind: "loading", revision: 1 });
    expect(ready).toMatchObject({ kind: "ready", revision: 1 });
  });

  it("игнорирует результат старой ревизии", () => {
    const first = dealSearchReducer(INITIAL_DEAL_SEARCH_STATE, {
      type: "started",
      revision: 1,
      criteria,
    });
    const second = dealSearchReducer(first, {
      type: "started",
      revision: 2,
      criteria: { ...criteria, beforeDate: "2026-02-28" },
    });
    const staleResolution = dealSearchReducer(second, {
      type: "resolved",
      revision: 1,
      result: { kind: "success", items: [createDeal({ id: "old" })] },
    });

    expect(staleResolution).toBe(second);
  });

  it("исключает и возвращает строку только в ready", () => {
    const ready = dealSearchReducer(
      dealSearchReducer(INITIAL_DEAL_SEARCH_STATE, {
        type: "started",
        revision: 1,
        criteria,
      }),
      {
        type: "resolved",
        revision: 1,
        result: { kind: "success", items: [createDeal({ id: "5" })] },
      },
    );
    const excluded = dealSearchReducer(ready, {
      type: "toggle-excluded",
      id: "5",
    });
    const restored = dealSearchReducer(excluded, {
      type: "toggle-excluded",
      id: "5",
    });

    expect(excluded.kind === "ready" && excluded.excludedIds.has("5")).toBe(
      true,
    );
    expect(restored.kind === "ready" && restored.excludedIds.has("5")).toBe(
      false,
    );
  });
});
```

- [ ] **Step 2: Написать падающий hook-тест позднего асинхронного ответа**

`src/deals/state/useDealSearch.test.tsx`:

```tsx
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createDeal, TEST_FILTER_OPTIONS } from "../../test/dealFixtures";
import type { BitrixAdapter } from "../data/BitrixAdapter";
import type { DealSearchCriteria, DealSearchResult } from "../domain/types";
import { useDealSearch } from "./useDealSearch";

function deferred<T>() {
  let settle: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      if (settle === undefined)
        throw new Error("Deferred promise is not initialized");
      settle(value);
    },
  };
}

const firstCriteria: DealSearchCriteria = {
  dateField: "createdAt",
  beforeDate: "2026-01-31",
  pipelineId: null,
  stageId: null,
  assignedById: null,
};

describe("useDealSearch", () => {
  it("не позволяет первому ответу заменить второй", async () => {
    const first = deferred<DealSearchResult>();
    const second = deferred<DealSearchResult>();
    let call = 0;
    const adapter: BitrixAdapter = {
      async getDealFilterOptions() {
        return TEST_FILTER_OPTIONS;
      },
      searchDeals() {
        call += 1;
        return call === 1 ? first.promise : second.promise;
      },
    };
    const { result } = renderHook(() => useDealSearch(adapter));

    function start(criteria: DealSearchCriteria): Promise<void> {
      let run: Promise<void> | undefined;
      act(() => {
        run = result.current.search(criteria);
      });
      if (run === undefined) throw new Error("Search did not start");
      return run;
    }

    const firstRun = start(firstCriteria);
    const secondRun = start({ ...firstCriteria, beforeDate: "2026-02-28" });

    await act(async () => {
      second.resolve({ kind: "success", items: [createDeal({ id: "new" })] });
      await secondRun;
    });
    await act(async () => {
      first.resolve({ kind: "success", items: [createDeal({ id: "old" })] });
      await firstRun;
    });

    expect(result.current.state).toMatchObject({
      kind: "ready",
      revision: 2,
      items: [expect.objectContaining({ id: "new" })],
    });
  });
});
```

- [ ] **Step 3: Запустить state-тесты и подтвердить ожидаемое падение**

Run: `npm test -- src/deals/state`

Expected: FAIL с ошибками отсутствующих `searchState` и `useDealSearch`.

- [ ] **Step 4: Реализовать исчерпывающее состояние поиска и reducer**

`src/deals/state/searchState.ts`:

```ts
import { toggleExcludedId } from "../domain/selection";
import type {
  Deal,
  DealSearchCriteria,
  DealSearchResult,
} from "../domain/types";

interface RevisionState {
  readonly revision: number;
  readonly criteria: DealSearchCriteria;
}

export type DealSearchState =
  | { readonly kind: "initial"; readonly revision: 0 }
  | ({ readonly kind: "loading" } & RevisionState)
  | ({
      readonly kind: "ready";
      readonly items: readonly Deal[];
      readonly excludedIds: ReadonlySet<string>;
    } & RevisionState)
  | ({ readonly kind: "empty" } & RevisionState)
  | ({
      readonly kind: "over-limit";
      readonly matchedAtLeast: number;
    } & RevisionState)
  | ({ readonly kind: "failure"; readonly code: string } & RevisionState);

export const INITIAL_DEAL_SEARCH_STATE: DealSearchState = {
  kind: "initial",
  revision: 0,
};

export type DealSearchAction =
  | {
      readonly type: "started";
      readonly revision: number;
      readonly criteria: DealSearchCriteria;
    }
  | {
      readonly type: "resolved";
      readonly revision: number;
      readonly result: DealSearchResult;
    }
  | { readonly type: "toggle-excluded"; readonly id: string };

function resolvedState(
  state: Extract<DealSearchState, { kind: "loading" }>,
  result: DealSearchResult,
): DealSearchState {
  const base = { revision: state.revision, criteria: state.criteria };
  switch (result.kind) {
    case "success":
      return result.items.length === 0
        ? { kind: "empty", ...base }
        : {
            kind: "ready",
            ...base,
            items: result.items,
            excludedIds: new Set(),
          };
    case "empty":
      return { kind: "empty", ...base };
    case "over-limit":
      return {
        kind: "over-limit",
        ...base,
        matchedAtLeast: result.matchedAtLeast,
      };
    case "failure":
      return { kind: "failure", ...base, code: result.code };
  }
}

export function dealSearchReducer(
  state: DealSearchState,
  action: DealSearchAction,
): DealSearchState {
  switch (action.type) {
    case "started":
      return {
        kind: "loading",
        revision: action.revision,
        criteria: action.criteria,
      };
    case "resolved":
      if (state.kind !== "loading" || state.revision !== action.revision)
        return state;
      return resolvedState(state, action.result);
    case "toggle-excluded":
      if (state.kind !== "ready") return state;
      return {
        ...state,
        excludedIds: toggleExcludedId(state.excludedIds, action.id),
      };
  }
}
```

- [ ] **Step 5: Реализовать единственную асинхронную команду поиска**

`src/deals/state/useDealSearch.ts`:

```ts
import { useReducer, useRef } from "react";
import type { BitrixAdapter } from "../data/BitrixAdapter";
import type { DealSearchCriteria, DealSearchResult } from "../domain/types";
import { INITIAL_DEAL_SEARCH_STATE, dealSearchReducer } from "./searchState";

export function useDealSearch(adapter: BitrixAdapter) {
  const [state, dispatch] = useReducer(
    dealSearchReducer,
    INITIAL_DEAL_SEARCH_STATE,
  );
  const nextRevision = useRef(0);

  async function search(criteria: DealSearchCriteria): Promise<void> {
    nextRevision.current += 1;
    const revision = nextRevision.current;
    dispatch({ type: "started", revision, criteria });

    let result: DealSearchResult;
    try {
      result = await adapter.searchDeals(criteria);
    } catch {
      result = { kind: "failure", code: "unexpected" };
    }
    dispatch({ type: "resolved", revision, result });
  }

  function toggleExcluded(id: string): void {
    dispatch({ type: "toggle-excluded", id });
  }

  return { state, search, toggleExcluded } as const;
}
```

- [ ] **Step 6: Запустить проверки состояния и всего доменного слоя**

Run: `npm test -- src/deals/state src/deals/domain src/deals/data`

Expected: PASS, 17 tests.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 7: Зафиксировать ревизионную модель поиска**

```bash
git add src/deals/state
git commit -m "feat: ignore stale deal search responses"
```

---

### Task 5: Filters and Observable Search States

**Files:**

- Create: `src/deals/ui/DealFilters.tsx`
- Create: `src/deals/ui/SearchFeedback.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`

**Interfaces:**

- Consumes: `BitrixAdapter`, `DealFilterOptions`, `DealSearchDraft`, `validateDealSearchDraft()`, `criteriaSignature()`, `useDealSearch()`.
- Produces: доступная форма с controlled draft, клиентскими ошибками, ручным submit и различимыми UI-состояниями поиска.

- [ ] **Step 1: Заменить smoke-тест падающими пользовательскими сценариями формы**

В `src/app/App.test.tsx` сохранить smoke-проверку отсутствия удаления и добавить следующий helper и тесты:

```tsx
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { BitrixAdapter } from "../deals/data/BitrixAdapter";
import type { DealSearchResult } from "../deals/domain/types";
import { createDeal, TEST_FILTER_OPTIONS } from "../test/dealFixtures";
import { App } from "./App";

function adapterWith(result: DealSearchResult): BitrixAdapter {
  return {
    async getDealFilterOptions() {
      return TEST_FILTER_OPTIONS;
    },
    async searchDeals() {
      return result;
    },
  };
}

describe("App", () => {
  it("показывает labels и не запускает пустой фильтр", async () => {
    const user = userEvent.setup();
    render(<App adapter={adapterWith({ kind: "empty" })} />);

    expect(
      screen.getByRole("heading", { name: "Старые проигранные сделки" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Демо-режим")).toBeInTheDocument();
    expect(await screen.findByLabelText("Дата до")).toBeInTheDocument();
    expect(screen.getByLabelText("Поле даты")).toBeInTheDocument();
    expect(screen.getByLabelText("Воронка")).toBeInTheDocument();
    expect(screen.getByLabelText("Проигранная стадия")).toBeInTheDocument();
    expect(screen.getByLabelText("Ответственный")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Найти сделки" }));
    expect(
      screen.getByText("Добавьте хотя бы одно условие поиска."),
    ).toBeInTheDocument();
  });

  it.each([
    [{ kind: "empty" } as const, "По этим условиям сделок нет"],
    [
      { kind: "over-limit", matchedAtLeast: 3001 } as const,
      "Найдено больше 3 000 сделок. Сузьте условия.",
    ],
    [
      { kind: "failure", code: "mock-unavailable" } as const,
      "Демо-данные временно недоступны. Повторите поиск.",
    ],
    [
      { kind: "failure", code: "unknown-code" } as const,
      "Не удалось получить сделки. Повторите поиск.",
    ],
  ])("различает результат %#", async (result, message) => {
    const user = userEvent.setup();
    render(<App adapter={adapterWith(result)} />);

    await user.type(await screen.findByLabelText("Дата до"), "2026-01-31");
    await user.click(screen.getByRole("button", { name: "Найти сделки" }));

    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it("показывает loading, ready и устаревший preview после изменения фильтра", async () => {
    const user = userEvent.setup();
    let resolveSearch: ((value: DealSearchResult) => void) | undefined;
    const adapter: BitrixAdapter = {
      async getDealFilterOptions() {
        return TEST_FILTER_OPTIONS;
      },
      searchDeals() {
        return new Promise((resolve) => {
          resolveSearch = resolve;
        });
      },
    };
    render(<App adapter={adapter} />);

    const date = await screen.findByLabelText("Дата до");
    await user.type(date, "2026-01-31");
    await user.click(screen.getByRole("button", { name: "Найти сделки" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Ищем сделки в демо-данных",
    );
    expect(screen.getByRole("button", { name: "Ищем сделки…" })).toBeDisabled();

    if (resolveSearch === undefined)
      throw new Error("Search resolver is missing");
    await act(async () => {
      resolveSearch({ kind: "success", items: [createDeal()] });
    });
    expect(await screen.findByText("Найдено: 1")).toBeInTheDocument();

    await user.clear(date);
    await user.type(date, "2026-02-28");
    expect(
      screen.getByText(
        "Условия изменены. Показан результат предыдущего поиска.",
      ),
    ).toBeInTheDocument();
  });

  it("не содержит действий удаления", async () => {
    render(
      <App adapter={adapterWith({ kind: "success", items: [createDeal()] })} />,
    );
    await screen.findByLabelText("Дата до");
    expect(
      screen.queryByRole("button", { name: /удалить/i }),
    ).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Запустить App-тесты и подтвердить ожидаемое падение**

Run: `npm test -- src/app/App.test.tsx`

Expected: FAIL, потому что `App` ещё не принимает адаптер и не показывает форму.

- [ ] **Step 3: Реализовать контролируемую форму фильтров**

`src/deals/ui/DealFilters.tsx`:

```tsx
import type { FormEvent } from "react";
import type {
  DealFilterOptions,
  DealSearchDraft,
  DealSearchValidationErrors,
} from "../domain/types";

interface DealFiltersProps {
  readonly draft: DealSearchDraft;
  readonly options: DealFilterOptions;
  readonly errors: DealSearchValidationErrors;
  readonly loading: boolean;
  readonly onDraftChange: (draft: DealSearchDraft) => void;
  readonly onSubmit: () => void;
}

export function DealFilters({
  draft,
  options,
  errors,
  loading,
  onDraftChange,
  onSubmit,
}: DealFiltersProps) {
  const stages = options.stages.filter(
    (stage) => draft.pipelineId === "" || stage.pipelineId === draft.pipelineId,
  );

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form className="filter-panel" onSubmit={submit} noValidate>
      <div className="filter-heading">
        <div>
          <p className="eyebrow">Условия</p>
          <h2>Какие сделки проверить</h2>
        </div>
        <span className="timezone">Часовой пояс: {options.timeZoneLabel}</span>
      </div>
      <div className="filter-grid">
        <label className="field">
          <span>Поле даты</span>
          <select
            value={draft.dateField}
            onChange={(event) =>
              onDraftChange({
                ...draft,
                dateField:
                  event.target.value === "updatedAt"
                    ? "updatedAt"
                    : "createdAt",
              })
            }
          >
            <option value="createdAt">Дата создания</option>
            <option value="updatedAt">Дата изменения</option>
          </select>
        </label>
        <label className="field">
          <span>Дата до</span>
          <input
            type="date"
            value={draft.beforeDate}
            aria-invalid={errors.beforeDate !== undefined}
            aria-describedby={
              errors.beforeDate === undefined ? undefined : "before-date-error"
            }
            onChange={(event) =>
              onDraftChange({ ...draft, beforeDate: event.target.value })
            }
          />
          {errors.beforeDate !== undefined && (
            <span className="field-error" id="before-date-error">
              {errors.beforeDate}
            </span>
          )}
        </label>
        <label className="field">
          <span>Воронка</span>
          <select
            value={draft.pipelineId}
            onChange={(event) =>
              onDraftChange({
                ...draft,
                pipelineId: event.target.value,
                stageId: "",
              })
            }
          >
            <option value="">Все воронки</option>
            {options.pipelines.map((pipeline) => (
              <option key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Проигранная стадия</span>
          <select
            value={draft.stageId}
            onChange={(event) =>
              onDraftChange({ ...draft, stageId: event.target.value })
            }
          >
            <option value="">Все проигранные стадии</option>
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Ответственный</span>
          <select
            value={draft.assignedById}
            onChange={(event) =>
              onDraftChange({ ...draft, assignedById: event.target.value })
            }
          >
            <option value="">Все ответственные</option>
            {options.assignees.map((assignee) => (
              <option key={assignee.id} value={assignee.id}>
                {assignee.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {errors.form !== undefined && (
        <p className="form-error" role="alert">
          {errors.form}
        </p>
      )}
      <button className="primary-button" type="submit" disabled={loading}>
        {loading ? "Ищем сделки…" : "Найти сделки"}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Реализовать отдельные сообщения состояний**

`src/deals/ui/SearchFeedback.tsx`:

```tsx
import type { DealSearchState } from "../state/searchState";

interface SearchFeedbackProps {
  readonly state: DealSearchState;
}

export function SearchFeedback({ state }: SearchFeedbackProps) {
  switch (state.kind) {
    case "initial":
      return <p className="status-panel">Задайте условия и запустите поиск.</p>;
    case "loading":
      return (
        <p className="status-panel" role="status">
          Ищем сделки в демо-данных. Ничего не удаляется.
        </p>
      );
    case "ready":
      return (
        <p className="status-panel" role="status">
          Найдено: {state.items.length}
        </p>
      );
    case "empty":
      return <p className="status-panel">По этим условиям сделок нет</p>;
    case "over-limit":
      return (
        <p className="status-panel warning">
          Найдено больше 3 000 сделок. Сузьте условия.
        </p>
      );
    case "failure":
      return (
        <p className="status-panel error" role="alert">
          {state.code === "mock-unavailable"
            ? "Демо-данные временно недоступны. Повторите поиск."
            : "Не удалось получить сделки. Повторите поиск."}
        </p>
      );
  }
}
```

- [ ] **Step 5: Связать адаптер, справочники, валидацию и поиск в App**

Заменить `src/app/App.tsx` следующим содержимым:

```tsx
import { useEffect, useState } from "react";
import type { BitrixAdapter } from "../deals/data/BitrixAdapter";
import { MockBitrixAdapter } from "../deals/data/MockBitrixAdapter";
import {
  criteriaSignature,
  normalizeDealSearchDraft,
  validateDealSearchDraft,
} from "../deals/domain/dealSearch";
import type {
  DealFilterOptions,
  DealSearchDraft,
  DealSearchValidationErrors,
} from "../deals/domain/types";
import { useDealSearch } from "../deals/state/useDealSearch";
import { DealFilters } from "../deals/ui/DealFilters";
import { SearchFeedback } from "../deals/ui/SearchFeedback";

const defaultAdapter = new MockBitrixAdapter({ behavior: { delayMs: 350 } });
const INITIAL_DRAFT: DealSearchDraft = {
  dateField: "createdAt",
  beforeDate: "",
  pipelineId: "",
  stageId: "",
  assignedById: "",
};

type OptionsState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly value: DealFilterOptions }
  | { readonly kind: "failure" };

interface AppProps {
  readonly adapter?: BitrixAdapter;
}

export function App({ adapter = defaultAdapter }: AppProps) {
  const [draft, setDraft] = useState(INITIAL_DRAFT);
  const [errors, setErrors] = useState<DealSearchValidationErrors>({});
  const [optionsState, setOptionsState] = useState<OptionsState>({
    kind: "loading",
  });
  const { state, search } = useDealSearch(adapter);

  useEffect(() => {
    let active = true;
    adapter.getDealFilterOptions().then(
      (value) => {
        if (active) setOptionsState({ kind: "ready", value });
      },
      () => {
        if (active) setOptionsState({ kind: "failure" });
      },
    );
    return () => {
      active = false;
    };
  }, [adapter]);

  function submit(): void {
    const validation = validateDealSearchDraft(draft);
    if (!validation.ok) {
      setErrors({
        ...validation.fieldErrors,
        ...(validation.formError === undefined
          ? {}
          : { form: validation.formError }),
      });
      return;
    }
    setErrors({});
    void search(validation.criteria);
  }

  const previewIsStale =
    state.kind === "ready" &&
    criteriaSignature(normalizeDealSearchDraft(draft)) !==
      criteriaSignature(state.criteria);

  return (
    <main className="app-shell">
      <header className="topbar">
        <strong>CRM Cleaner</strong>
        <span className="demo-badge">Демо-режим</span>
      </header>
      <section className="page" aria-labelledby="page-title">
        <p className="eyebrow">Сделки · только чтение</p>
        <h1 id="page-title">Старые проигранные сделки</h1>
        <p className="intro">
          Настройте условия и проверьте результат на искусственных данных.
        </p>

        {optionsState.kind === "loading" && (
          <p role="status">Загружаем фильтры…</p>
        )}
        {optionsState.kind === "failure" && (
          <p className="status-panel error" role="alert">
            Не удалось загрузить демо-фильтры.
          </p>
        )}
        {optionsState.kind === "ready" && (
          <DealFilters
            draft={draft}
            options={optionsState.value}
            errors={errors}
            loading={state.kind === "loading"}
            onDraftChange={setDraft}
            onSubmit={submit}
          />
        )}
        {previewIsStale && (
          <p className="status-panel warning">
            Условия изменены. Показан результат предыдущего поиска.
          </p>
        )}
        <SearchFeedback state={state} />
      </section>
    </main>
  );
}
```

- [ ] **Step 6: Запустить пользовательские тесты формы и состояний**

Run: `npm test -- src/app/App.test.tsx`

Expected: PASS, 7 tests.

Run: `npm run typecheck`

Expected: exit 0.

Run: `npm run lint`

Expected: exit 0.

- [ ] **Step 7: Зафиксировать фильтры и UI-состояния**

```bash
git add src/app src/deals/ui/DealFilters.tsx src/deals/ui/SearchFeedback.tsx
git commit -m "feat: add deal filters and search states"
```

---

### Task 6: Full Preview, Exclusions, and Pagination

**Files:**

- Create: `src/deals/ui/pagination.ts`
- Create: `src/deals/ui/pagination.test.ts`
- Create: `src/deals/ui/DealPreview.tsx`
- Create: `src/deals/ui/DealPreview.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`

**Interfaces:**

- Consumes: ready-вариант `DealSearchState`, `getSelectionCounts()`, `getSelectedDealIds()`, `toggleExcluded(id)`.
- Produces: `PREVIEW_PAGE_SIZE`, `getPreviewPageCount()`, `getPreviewPageItems()`, таблицу `DealPreview` с действиями для всего результата.

- [ ] **Step 1: Написать падающие тесты границ пагинации 0/1/50/51**

`src/deals/ui/pagination.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createDeal } from "../../test/dealFixtures";
import {
  PREVIEW_PAGE_SIZE,
  getPreviewPageCount,
  getPreviewPageItems,
} from "./pagination";

describe("preview pagination", () => {
  it("использует страницы по 25 строк", () => {
    expect(PREVIEW_PAGE_SIZE).toBe(25);
    expect(getPreviewPageCount(0)).toBe(1);
    expect(getPreviewPageCount(1)).toBe(1);
    expect(getPreviewPageCount(50)).toBe(2);
    expect(getPreviewPageCount(51)).toBe(3);
  });

  it("возвращает последнюю строку набора из 51 сделки на третьей странице", () => {
    const deals = Array.from({ length: 51 }, (_, index) =>
      createDeal({ id: String(index + 1), title: `Сделка ${index + 1}` }),
    );

    expect(getPreviewPageItems(deals, 3)).toEqual([
      expect.objectContaining({ id: "51" }),
    ]);
  });
});
```

- [ ] **Step 2: Написать падающие UI-тесты исключения, страниц и безопасного текста**

`src/deals/ui/DealPreview.test.tsx`:

```tsx
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createDeal } from "../../test/dealFixtures";
import type { Deal } from "../domain/types";
import type { DealSearchState } from "../state/searchState";
import { DealPreview } from "./DealPreview";

const criteria = {
  dateField: "createdAt" as const,
  beforeDate: "2026-01-31",
  pipelineId: null,
  stageId: null,
  assignedById: null,
};

function PreviewHarness({ items }: { readonly items: readonly Deal[] }) {
  const [excludedIds, setExcludedIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const state: Extract<DealSearchState, { kind: "ready" }> = {
    kind: "ready",
    revision: 1,
    criteria,
    items,
    excludedIds,
  };

  return (
    <DealPreview
      state={state}
      onToggleExcluded={(id) => {
        setExcludedIds((current) => {
          const next = new Set(current);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      }}
    />
  );
}

describe("DealPreview", () => {
  it("исключает и возвращает сделку с точными общими счётчиками", async () => {
    const user = userEvent.setup();
    render(
      <PreviewHarness
        items={[
          createDeal({ id: "1" }),
          createDeal({ id: "2", title: "Вторая" }),
        ]}
      />,
    );

    expect(
      screen.getByRole("group", { name: "Найдено 2" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Выбрано 2" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Исключить Вторая" }));
    expect(
      screen.getByRole("group", { name: "Выбрано 1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Исключено 1" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Вернуть Вторая" }));
    expect(
      screen.getByRole("group", { name: "Выбрано 2" }),
    ).toBeInTheDocument();
  });

  it("переключает три страницы и сохраняет счётчики всего результата", async () => {
    const user = userEvent.setup();
    const items = Array.from({ length: 51 }, (_, index) =>
      createDeal({ id: String(index + 1), title: `Сделка ${index + 1}` }),
    );
    render(<PreviewHarness items={items} />);

    await user.click(
      screen.getByRole("button", { name: "Следующая страница" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Следующая страница" }),
    );
    expect(screen.getByText("Страница 3 из 3")).toBeInTheDocument();
    expect(screen.getByText("Сделка 51")).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Найдено 51" }),
    ).toBeInTheDocument();
  });

  it("показывает CRM-название как текст, не как HTML", () => {
    render(
      <PreviewHarness
        items={[createDeal({ title: '<img src=x onerror="alert(1)">' })]}
      />,
    );

    expect(
      screen.getByText('<img src=x onerror="alert(1)">'),
    ).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});
```

- [ ] **Step 3: Запустить preview-тесты и подтвердить ожидаемое падение**

Run: `npm test -- src/deals/ui/pagination.test.ts src/deals/ui/DealPreview.test.tsx`

Expected: FAIL с ошибками отсутствующих `pagination` и `DealPreview`.

- [ ] **Step 4: Реализовать чистую пагинацию**

`src/deals/ui/pagination.ts`:

```ts
export const PREVIEW_PAGE_SIZE = 25;

export function getPreviewPageCount(itemCount: number): number {
  return Math.max(1, Math.ceil(itemCount / PREVIEW_PAGE_SIZE));
}

export function getPreviewPageItems<T>(
  items: readonly T[],
  page: number,
): readonly T[] {
  const safePage = Math.min(
    Math.max(1, page),
    getPreviewPageCount(items.length),
  );
  const start = (safePage - 1) * PREVIEW_PAGE_SIZE;
  return items.slice(start, start + PREVIEW_PAGE_SIZE);
}
```

- [ ] **Step 5: Реализовать preview-компонент без опасного продолжения**

`src/deals/ui/DealPreview.tsx`:

```tsx
import { useState } from "react";
import { getSelectionCounts } from "../domain/selection";
import type { Deal } from "../domain/types";
import type { DealSearchState } from "../state/searchState";
import { getPreviewPageCount, getPreviewPageItems } from "./pagination";

type ReadyState = Extract<DealSearchState, { kind: "ready" }>;

interface DealPreviewProps {
  readonly state: ReadyState;
  readonly onToggleExcluded: (id: string) => void;
}

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Moscow",
});

function formatDate(deal: Deal, field: "createdAt" | "updatedAt"): string {
  return dateFormatter.format(new Date(deal[field]));
}

export function DealPreview({ state, onToggleExcluded }: DealPreviewProps) {
  const [page, setPage] = useState(1);
  const pageCount = getPreviewPageCount(state.items.length);
  const currentPage = Math.min(page, pageCount);
  const rows = getPreviewPageItems(state.items, currentPage);
  const counts = getSelectionCounts(state.items, state.excludedIds);

  return (
    <section className="preview-layout" aria-labelledby="preview-title">
      <div className="table-panel">
        <div className="preview-heading">
          <div>
            <p className="eyebrow">Результат поиска</p>
            <h2 id="preview-title">Проверьте список</h2>
          </div>
          <p>Исключите сделки, которые хотите сохранить.</p>
        </div>
        <div className="table-scroll">
          <table className="deal-table">
            <thead>
              <tr>
                <th scope="col">В списке</th>
                <th scope="col">Сделка</th>
                <th scope="col">Ответственный</th>
                <th scope="col">Дата</th>
                <th scope="col">Стадия</th>
                <th scope="col">Действие</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((deal) => {
                const excluded = state.excludedIds.has(deal.id);
                return (
                  <tr
                    key={deal.id}
                    className={excluded ? "row-excluded" : undefined}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={!excluded}
                        aria-label={`Включить ${deal.title}`}
                        onChange={() => onToggleExcluded(deal.id)}
                      />
                    </td>
                    <td>
                      <strong>{deal.title}</strong>
                      <span className="deal-id">
                        ID {deal.id} · {deal.pipelineName}
                      </span>
                    </td>
                    <td>{deal.assignedByName}</td>
                    <td>{formatDate(deal, state.criteria.dateField)}</td>
                    <td>{deal.stageName}</td>
                    <td>
                      <button
                        className="row-action"
                        type="button"
                        aria-label={`${excluded ? "Вернуть" : "Исключить"} ${deal.title}`}
                        onClick={() => onToggleExcluded(deal.id)}
                      >
                        {excluded ? "Вернуть" : "Исключить"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <nav className="pagination" aria-label="Страницы результата">
          <button
            type="button"
            className="secondary-button"
            disabled={currentPage === 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            Предыдущая
          </button>
          <span>
            Страница {currentPage} из {pageCount}
          </span>
          <button
            type="button"
            className="secondary-button"
            aria-label="Следующая страница"
            disabled={currentPage === pageCount}
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
          >
            Следующая
          </button>
        </nav>
      </div>
      <aside className="summary-panel" aria-label="Сводка результата">
        <p className="eyebrow">К проверке</p>
        <strong className="summary-number">{counts.selected}</strong>
        <span>сделок выбрано</span>
        <dl className="metrics">
          <div role="group" aria-label={`Найдено ${counts.found}`}>
            <dt>Найдено</dt>
            <dd>{counts.found}</dd>
          </div>
          <div role="group" aria-label={`Выбрано ${counts.selected}`}>
            <dt>Выбрано</dt>
            <dd>{counts.selected}</dd>
          </div>
          <div role="group" aria-label={`Исключено ${counts.excluded}`}>
            <dt>Исключено</dt>
            <dd>{counts.excluded}</dd>
          </div>
        </dl>
        <p className="demo-note">
          Это локальный preview. Действия удаления нет.
        </p>
      </aside>
    </section>
  );
}
```

- [ ] **Step 6: Подключить preview к ready-ревизии App**

В `src/app/App.tsx` импортировать `DealPreview`, получить `toggleExcluded` из hook и после `SearchFeedback` добавить:

```tsx
<SearchFeedback state={state} />;
{
  state.kind === "ready" && (
    <DealPreview
      key={state.revision}
      state={state}
      onToggleExcluded={toggleExcluded}
    />
  );
}
```

Точные изменения существующих строк:

```tsx
import { DealPreview } from "../deals/ui/DealPreview";

const { state, search, toggleExcluded } = useDealSearch(adapter);
```

- [ ] **Step 7: Дополнить App-тест интеграцией preview и отсутствием удаления**

Добавить в `src/app/App.test.tsx` тест, который вводит дату, запускает поиск, исключает строку и проверяет, что доступен только обратимый action:

```tsx
it("связывает готовый результат с исключением без удаления", async () => {
  const user = userEvent.setup();
  render(
    <App adapter={adapterWith({ kind: "success", items: [createDeal()] })} />,
  );

  await user.type(await screen.findByLabelText("Дата до"), "2026-01-31");
  await user.click(screen.getByRole("button", { name: "Найти сделки" }));
  await user.click(
    await screen.findByRole("button", { name: "Исключить Тестовая сделка" }),
  );

  expect(
    screen.getByRole("group", { name: "Исключено 1" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Вернуть Тестовая сделка" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /удалить/i }),
  ).not.toBeInTheDocument();
});
```

- [ ] **Step 8: Запустить preview и интеграционные тесты**

Run: `npm test -- src/deals/ui src/app/App.test.tsx`

Expected: PASS, включая 2 pagination tests, 3 preview tests и 8 App tests.

Run: `npm run typecheck`

Expected: exit 0.

Run: `npm run lint`

Expected: exit 0.

- [ ] **Step 9: Зафиксировать полный локальный preview**

```bash
git add src/app src/deals/ui
git commit -m "feat: add paginated deal preview"
```

---

### Task 7: Visual System, Build Proof, and Project Status

**Files:**

- Modify: `src/styles.css`
- Modify: `README.md`
- Modify: `PLAN.md`
- Modify: `docs/PLAN.md`
- Modify: `docs/STATUS.md`
- Modify: `docs/TEST-MATRIX.md`

**Interfaces:**

- Consumes: все CSS-классы из Tasks 1, 5 и 6, проверенные npm/PHP-команды.
- Produces: адаптивный teal UI, production package с относительными assets, синхронизированный фактический статус и журнал mock-проверок.

- [ ] **Step 1: Зафиксировать падающую проверку адаптивных и focus-правил**

До изменения CSS выполнить:

Run: `rg -n --fixed-strings '@media (max-width: 1100px)' src/styles.css`

Expected: exit 1, правило ещё отсутствует.

Run: `rg -n --fixed-strings ':focus-visible' src/styles.css`

Expected: exit 1, правило ещё отсутствует.

- [ ] **Step 2: Заменить временный CSS на утверждённые визуальные правила**

`src/styles.css`:

```css
:root {
  color: #172321;
  background: #f6f7f4;
  font-family:
    Inter,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
  font-synthesis: none;
  --color-bg: #f6f7f4;
  --color-surface: #ffffff;
  --color-surface-muted: #eef5f2;
  --color-border: #d9e2df;
  --color-border-strong: #bcc9c5;
  --color-text: #172321;
  --color-text-muted: #64706d;
  --color-primary: #137d73;
  --color-primary-hover: #0f6b63;
  --color-primary-soft: #e7f3f0;
  --color-focus: #66bdb4;
  --color-danger-soft: #fff0f1;
  --color-danger-text: #a72831;
  --color-warning: #966100;
  --color-warning-soft: #fff6dd;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  background: var(--color-bg);
}

button,
input,
select {
  font: inherit;
}

button,
select,
input {
  min-height: 40px;
}

button:focus-visible,
input:focus-visible,
select:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

.app-shell {
  min-height: 100vh;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 64px;
  padding: 12px 32px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}

.topbar strong {
  font-size: 18px;
}

.demo-badge,
.timezone {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 4px 10px;
  border-radius: 999px;
  color: var(--color-primary);
  background: var(--color-primary-soft);
  font-size: 13px;
  font-weight: 600;
}

.page {
  width: min(1440px, 100%);
  margin: 0 auto;
  padding: 40px 32px 64px;
}

.eyebrow {
  margin: 0 0 4px;
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1,
h2,
p {
  margin-top: 0;
}

h1 {
  margin-bottom: 8px;
  font-size: clamp(28px, 4vw, 40px);
  line-height: 1.2;
}

h2 {
  margin-bottom: 0;
  font-size: 24px;
  line-height: 1.3;
}

.intro {
  max-width: 70ch;
  margin-bottom: 32px;
  color: var(--color-text-muted);
}

.filter-panel,
.table-panel,
.summary-panel,
.status-panel {
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface);
}

.filter-panel {
  padding: 24px;
}

.filter-heading,
.preview-heading,
.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(150px, 1fr));
  gap: 16px;
  margin: 24px 0;
}

.field {
  display: grid;
  align-content: start;
  gap: 6px;
  color: var(--color-text);
  font-size: 14px;
  font-weight: 600;
}

.field input,
.field select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  color: var(--color-text);
  background: var(--color-surface);
}

.field-error,
.form-error,
.status-panel.error {
  color: var(--color-danger-text);
}

.field-error {
  font-size: 12px;
  font-weight: 500;
}

.form-error {
  margin: 0 0 12px;
}

.primary-button,
.secondary-button,
.row-action {
  border-radius: 8px;
  cursor: pointer;
  font-weight: 650;
}

.primary-button {
  padding: 10px 18px;
  border: 1px solid var(--color-primary);
  color: #ffffff;
  background: var(--color-primary);
}

.primary-button:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.secondary-button {
  padding: 8px 12px;
  border: 1px solid var(--color-border-strong);
  color: var(--color-text);
  background: var(--color-surface);
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.status-panel {
  margin: 16px 0 0;
  padding: 16px;
}

.status-panel.warning {
  border-color: #e5c878;
  color: var(--color-warning);
  background: var(--color-warning-soft);
}

.status-panel.error {
  border-color: #efb8bc;
  background: var(--color-danger-soft);
}

.preview-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 24px;
  margin-top: 24px;
  align-items: start;
}

.table-panel {
  min-width: 0;
  overflow: hidden;
}

.preview-heading {
  align-items: flex-start;
  padding: 24px;
  border-bottom: 1px solid var(--color-border);
}

.preview-heading > p {
  max-width: 38ch;
  margin-bottom: 0;
  color: var(--color-text-muted);
}

.table-scroll {
  max-width: 100%;
  overflow-x: auto;
}

.deal-table {
  width: 100%;
  min-width: 840px;
  border-collapse: collapse;
  font-size: 14px;
}

.deal-table th,
.deal-table td {
  height: 60px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  vertical-align: middle;
}

.deal-table th {
  position: sticky;
  top: 0;
  color: var(--color-text-muted);
  background: var(--color-surface-muted);
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.deal-table tbody tr:hover {
  background: #f9fbfa;
}

.deal-table .row-excluded {
  color: var(--color-text-muted);
  background: #fafafa;
}

.deal-id {
  display: block;
  margin-top: 3px;
  color: var(--color-text-muted);
  font-size: 12px;
}

.row-action {
  min-height: 40px;
  padding: 6px 8px;
  border: 0;
  color: var(--color-primary);
  background: transparent;
}

.pagination {
  padding: 16px 24px;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.summary-panel {
  position: sticky;
  top: 24px;
  padding: 24px;
}

.summary-number {
  display: block;
  color: var(--color-primary);
  font-size: clamp(40px, 6vw, 48px);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.metrics {
  display: grid;
  gap: 10px;
  margin: 24px 0;
}

.metrics div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.metrics dt,
.metrics dd {
  margin: 0;
}

.metrics dd {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.demo-note {
  margin-bottom: 0;
  padding: 12px;
  border-radius: 8px;
  color: var(--color-text-muted);
  background: var(--color-surface-muted);
  font-size: 14px;
}

@media (max-width: 1100px) {
  .filter-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .preview-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .summary-panel {
    position: static;
    order: -1;
  }
}

@media (max-width: 700px) {
  .topbar,
  .page {
    padding-right: 20px;
    padding-left: 20px;
  }

  .page {
    padding-top: 32px;
  }

  .filter-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .filter-heading,
  .preview-heading,
  .pagination {
    align-items: stretch;
    flex-direction: column;
  }

  .pagination .secondary-button {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 3: Проверить наличие обязательных адаптивных и focus-правил**

Run: `rg -n --fixed-strings '@media (max-width: 1100px)' src/styles.css`

Expected: одна строка с media query.

Run: `rg -n --fixed-strings ':focus-visible' src/styles.css`

Expected: три selector-строки в одном правиле.

- [ ] **Step 4: Отформатировать только созданные файлы**

Run: `npm exec prettier -- --write "src/**/*.{ts,tsx,css}" index.html vite.config.ts eslint.config.js tsconfig.json tsconfig.app.json tsconfig.node.json`

Expected: exit 0; существующие архивные документы и vendored skills не изменены.

- [ ] **Step 5: Выполнить полный автоматический acceptance gate**

Run: `npm run typecheck`

Expected: exit 0.

Run: `npm run lint`

Expected: exit 0.

Run: `npm test`

Expected: exit 0; все unit/UI tests проходят.

Run: `npm run build`

Expected: exit 0; production bundle создан в `dist`.

Run: `php -l public/index.php`

Expected: `No syntax errors detected in public/index.php`.

Run: `php -l dist/index.php`

Expected: `No syntax errors detected in dist/index.php`.

Run: `find dist -maxdepth 2 -type f -printf '%P\n' | sort`

Expected: список содержит `index.html`, `index.php` и файлы `assets/index-*.js`, `assets/index-*.css`.

Run: `rg -n '(src|href)="/assets/' dist/index.html`

Expected: exit 1; абсолютных asset-путей нет.

Run: `rg -n 'client_secret|refresh_token|crm\.item\.delete|dangerouslySetInnerHTML' src dist`

Expected: exit 1; секретов, DELETE-контракта и небезопасного HTML нет.

- [ ] **Step 6: Выполнить визуальную проверку локального preview**

Run: `npm run dev -- --host 127.0.0.1`

Проверить в Chrome на ширинах 1440, 1024 и 700 px: labels и focus-ring видимы; при 1024 px сводка находится над таблицей; при 700 px фильтры идут одной колонкой; горизонтальная прокрутка ограничена таблицей; исключение строки сразу меняет три счётчика; ни на одном экране нет красной кнопки или действия удаления. Остановить dev-сервер после проверки.

- [ ] **Step 7: Обновить README только проверенными командами и статусом**

В `README.md` заменить раздел `Статус` текстом:

```markdown
Локальный vertical slice для сделок реализован на искусственных данных: фильтры, состояния поиска, полный preview до 3 000 записей, исключения, счётчики и клиентская пагинация. Реального подключения Bitrix24, CSV и удаления в этой версии нет. Проверенное состояние хранится в [docs/STATUS.md](docs/STATUS.md).
```

Первое предложение README заменить точным текущим описанием:

```markdown
Браузерное приложение для проверки и контролируемой массовой очистки старых проигранных сделок Bitrix24. Текущая локальная версия работает только с искусственными данными; лимит preview — 3 000 записей.
```

В разделе `Архитектура` отделить текущий срез от целевого MVP:

```markdown
Текущий срез использует React + TypeScript + Vite и локальный `MockBitrixAdapter`; PHP только отдаёт собранный `index.html`. Целевой MVP будет работать в iframe Bitrix24 через отдельно проверенный read-only адаптер, а затем — через подтверждённый исполнитель. Собственного backend обработки CRM, серверной БД, cron и постоянного Node-процесса нет.
```

В список документации добавить утверждённые артефакты:

```markdown
- [Дизайн mock-preview](docs/superpowers/specs/2026-09-09-deal-mock-preview-design.md) — утверждённый объём первого локального среза.
- [План реализации mock-preview](docs/superpowers/plans/2026-09-09-deal-mock-preview-implementation.md) — порядок TDD-реализации и проверки.
```

В `Начало работы` удалить выбор сущности и записать:

```markdown
1. Прочитать AGENTS.md, docs/STATUS.md и этап 1 плана.
2. Выполнить `npm install`.
3. Запустить локальный demo командой `npm run dev`.
4. Перед изменениями прочитать утверждённую спецификацию и применимые стандарты кода.
```

Таблицу `Команды` заменить точными строками:

```markdown
| Действие                  | Проверенная команда       |
| ------------------------- | ------------------------- |
| Установка зависимостей    | `npm install`             |
| Локальный запуск          | `npm run dev`             |
| Проверка типов            | `npm run typecheck`       |
| Проверка стиля            | `npm run lint`            |
| Тесты                     | `npm test`                |
| Production-сборка         | `npm run build`           |
| Локальный просмотр сборки | `npm run preview`         |
| Проверка PHP              | `php -l public/index.php` |
```

- [ ] **Step 8: Синхронно обновить PLAN и фактический STATUS**

В обоих файлах `PLAN.md` и `docs/PLAN.md` отметить 1.1 выполненным и разделить 1.2 без изменения объёма:

```markdown
- [x] **1.1 · А:** создать React + TypeScript + Vite, строгую типизацию, lockfile, базовые lint/typecheck/test/build-команды и минимальный PHP-вход.
- [x] **1.2а · А:** выделить `BitrixAdapter`, сделать mock-адаптер и локальный экран фильтров/preview выбранной сущности без сети.
- [ ] **1.2б · А:** сделать минимальный реальный read-only адаптер выбранной сущности по отдельно утверждённому интеграционному дизайну.
```

Сразу проверить зеркала:

Run: `cmp -s PLAN.md docs/PLAN.md`

Expected: exit 0.

В `docs/STATUS.md` зафиксировать только подтверждённые Step 5–6 факты:

```markdown
- Создан и проверен строгий React/TypeScript/Vite-каркас с минимальным PHP-входом.
- Реализован локальный mock-preview старых проигранных сделок: фильтры, состояния, дедупликация, лимит 3 000, пагинация, исключения и точные счётчики.
- Реальных запросов Bitrix24, CSV, подтверждения и DELETE в коде нет.
- Следующая задача — отдельно спроектировать и реализовать минимальный read-only адаптер сделок, затем проверить iframe на согласованном тестовом портале.
```

Убрать из `Ещё не сделано` утверждения, что каркас, конфиги, сборка, тесты и mock-адаптер отсутствуют. Не объявлять SprintHost или Bitrix24 проверенными.

- [ ] **Step 9: Записать только полностью пройденные mock-сценарии в TEST-MATRIX**

После успешного Step 5 изменить Mock-ячейки `T01`, `T02`, `T05`, `T26` и `T28` с `НЗ` на `PASS`. Остальные строки оставить `НЗ`, потому что подтверждение, CSV, реальный портал и удаление находятся вне среза.

В `Журнал прогонов` добавить запись `mock-preview-2026-09-10` со следующими доказательствами:

```markdown
- Среда: локальный MockBitrixAdapter, Chrome, Node.js и PHP-версии из `docs/STATUS.md`.
- T01 PASS: unit-тесты покрывают 0/1, страницы для 50/51, предел 3 000/3 001 и дедупликацию ID.
- T02 PASS: пустой фильтр блокируется; в source и bundle отсутствует DELETE-контракт.
- T05 PASS: исключённый ID отсутствует в выбранном наборе, счётчики обновляются.
- T26 PASS: поздний ответ старой ревизии не заменяет актуальный результат.
- T28 PASS: production build использует относительные asset-пути и не содержит секретных переменных.
- Ограничения: Bitrix24, SprintHost, CSV, подтверждение и реальные изменения CRM не проверялись.
```

- [ ] **Step 10: Повторить финальную проверку после документации**

Run: `npm run typecheck`

Expected: exit 0.

Run: `npm run lint`

Expected: exit 0.

Run: `npm test`

Expected: exit 0.

Run: `npm run build`

Expected: exit 0.

Run: `php -l public/index.php`

Expected: syntax PASS.

Run: `cmp -s PLAN.md docs/PLAN.md`

Expected: exit 0.

Run: `npm ls --depth=0`

Expected: exit 0 без missing/invalid packages.

- [ ] **Step 11: Зафиксировать визуальную и документальную приёмку**

```bash
git add src/styles.css README.md PLAN.md docs/PLAN.md docs/STATUS.md docs/TEST-MATRIX.md
git commit -m "docs: record verified deal mock preview"
```

---

## Completion Evidence

План завершён только при одновременном выполнении следующих условий:

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` и оба PHP lint завершаются с exit 0;
- `dist/index.php` существует, а `dist/index.html` не содержит абсолютных `/assets/` путей;
- тестами доказаны валидация, обе даты, сочетание фильтров, 0/1/50/51, 3 000/3 001, дедупликация, исключения, счётчики и поздний ответ;
- UI вручную проверен на трёх ширинах, доступен с клавиатуры и не содержит DELETE;
- root/docs копии `PLAN.md` совпадают, а STATUS и TEST-MATRIX сообщают только фактические результаты;
- история содержит отдельные commits задач; если Git не инициализирован, выполнение плана сначала остановлено до решения пользователя, а не объявлено завершённым.
