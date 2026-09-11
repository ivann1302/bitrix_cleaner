# Lead Entity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add leads as a second, safely isolated CRM entity with complete demo operation support and read-only Bitrix24 preview support.

**Architecture:** Introduce a discriminated shared CRM domain while preserving the tested deal behavior. Entity-aware mock and real adapters return deal or lead variants; shared UI, confirmation, operation, and persistence code use the entity discriminator, with deal-only pipeline branches and lead-only failed statuses.

**Tech Stack:** React 19, TypeScript 6 strict mode, Vite 8, Vitest 5, Testing Library, official `@bitrix24/b24jssdk` 2.2.0, native IndexedDB and Web Locks.

**Spec:** `docs/superpowers/specs/2026-09-10-lead-entity-design.md`

## Global Constraints

- `PLAN.md` and `PRODUCT.md` are authoritative; update them before their byte-identical `docs/` mirrors.
- Real iframe mode remains read-only. Do not add `crm.item.delete` to any SDK gateway allowlist or construct a real deletion transport.
- Leads use `crm.item.list` with `entityTypeId: 1` and statuses from `crm.status.list` with `ENTITY_ID: "STATUS"`.
- Only failed lead statuses are eligible: `SEMANTICS: "F"` or `EXTRA.SEMANTICS: "failure"`.
- Active and successful leads never enter an implicit all-status lead search.
- Both entities retain the 3,000 unique-item limit, ten-minute preview lifetime, administrator requirement, exact-ID confirmation, checkpoint, and per-portal/user/entity lock isolation.
- Existing deal checkpoints with schema version `1` remain valid; unknown entity values remain invalid.
- CSV safety properties and exact selected-set semantics must not change.
- Every behavior change follows red-green-refactor, and every task ends with its focused tests plus the full tests relevant to touched shared code.

---

### Task 1: Add the discriminated CRM domain without breaking deals

**Files:**

- Modify: `src/deals/domain/types.ts`
- Modify: `src/deals/domain/dealSearch.ts`
- Modify: `src/deals/domain/dealSearch.test.ts`
- Modify: `src/deals/domain/selection.ts`
- Modify: `src/deals/domain/selection.test.ts`
- Modify: `src/deals/state/searchState.ts`
- Modify: `src/deals/state/searchState.test.ts`
- Modify: `src/deals/state/useDealSearch.ts`
- Modify: `src/deals/state/useDealSearch.test.tsx`
- Modify: `src/deals/data/BitrixAdapter.ts`
- Modify: `src/deals/data/MockBitrixAdapter.ts`
- Modify: `src/deals/data/mockDeals.ts`
- Modify: `src/deals/data/BitrixDealReadAdapter.ts`
- Modify: `src/deals/data/BitrixDealReadAdapter.test.ts`
- Modify: `src/deals/data/MockBitrixAdapter.test.ts`
- Modify: `src/deals/domain/confirmation.ts`
- Modify: `src/deals/domain/confirmation.test.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/test/dealFixtures.ts`

**Interfaces:**

- Consumes: current deal domain, reducer, hook, and the 3,000-item limit.
- Produces: `CrmEntity`, `CrmItem`, `CrmFilterOptions`, `CrmSearchDraft`, `CrmSearchCriteria`, `CrmSearchResult`, `CRM_SEARCH_LIMIT`, `createInitialDraft()`, `normalizeCrmSearchDraft()`, `validateCrmSearchDraft()`, `criteriaSignature()`, `CrmSearchState`, `useCrmSearch()`, and the entity-aware `BitrixAdapter` boundary.

- [x] **Step 1: Add failing domain tests for lead discrimination and validation**

Add tests that construct these exact shapes and prove that a lead needs no pipeline while an empty lead search is still rejected:

```ts
const leadDraft: LeadSearchDraft = {
  entity: "lead",
  dateField: "createdAt",
  beforeDate: "2026-09-01",
  statusId: "JUNK",
  assignedById: "",
};

expect(validateCrmSearchDraft(leadDraft)).toEqual({
  ok: true,
  criteria: {
    entity: "lead",
    dateField: "createdAt",
    beforeDate: "2026-09-01",
    statusId: "JUNK",
    assignedById: null,
  },
});
expect(validateCrmSearchDraft(createInitialDraft("lead"))).toMatchObject({
  ok: false,
  formError: "Добавьте хотя бы одно условие поиска.",
});
```

Add a signature assertion proving otherwise identical deal and lead criteria differ. Add reducer/hook tests proving `reset` returns to `initial`, and an old lead search response cannot resolve a newer deal search.

- [x] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npm test -- src/deals/domain/dealSearch.test.ts src/deals/domain/selection.test.ts src/deals/state/searchState.test.ts src/deals/state/useDealSearch.test.tsx
```

Expected: FAIL because the CRM unions, factories, reset action, and generic hook do not exist.

- [x] **Step 3: Introduce the minimal discriminated types and generic helpers**

Use these public shapes; keep deal aliases only where needed to migrate later tasks without making this task uncompilable:

```ts
export type CrmEntity = "deal" | "lead";

interface CrmItemBase {
  readonly id: string;
  readonly title: string;
  readonly statusId: string;
  readonly statusName: string;
  readonly assignedById: string;
  readonly assignedByName: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Deal extends CrmItemBase {
  readonly entity: "deal";
  readonly pipelineId: string;
  readonly pipelineName: string;
  readonly stageId: string;
  readonly stageName: string;
}

export interface Lead extends CrmItemBase {
  readonly entity: "lead";
}

export type CrmItem = Deal | Lead;

export interface DealFilterOptions {
  readonly entity: "deal";
  readonly pipelines: readonly NamedOption[];
  readonly stages: readonly DealStageOption[];
  readonly assignees: readonly NamedOption[];
  readonly timeZoneLabel: string;
}

export interface LeadStatusOption extends NamedOption {
  readonly isFailed: true;
}

export interface LeadFilterOptions {
  readonly entity: "lead";
  readonly statuses: readonly LeadStatusOption[];
  readonly assignees: readonly NamedOption[];
  readonly timeZoneLabel: string;
}

export interface LeadSearchDraft {
  readonly entity: "lead";
  readonly dateField: DateField;
  readonly beforeDate: string;
  readonly statusId: string;
  readonly assignedById: string;
}

export interface LeadSearchCriteria {
  readonly entity: "lead";
  readonly dateField: DateField;
  readonly beforeDate: string | null;
  readonly statusId: string | null;
  readonly assignedById: string | null;
}

export type CrmFilterOptions = DealFilterOptions | LeadFilterOptions;
export type CrmSearchDraft = DealSearchDraft | LeadSearchDraft;
export type CrmSearchCriteria = DealSearchCriteria | LeadSearchCriteria;
export type CrmSearchResult =
  | { readonly kind: "success"; readonly items: readonly CrmItem[] }
  | { readonly kind: "empty" }
  | { readonly kind: "over-limit"; readonly matchedAtLeast: number }
  | { readonly kind: "failure"; readonly code: string };
```

Add `entity: "deal"` to every deal draft, criteria, item constructor, mock literal,
and test fixture. Map existing `stageId`/`stageName` to the shared status fields
when constructing deals while retaining the deal fields during this migration.
Update exact adapter expectations to include the discriminator and shared status
fields. Rename the shared numeric limit to `CRM_SEARCH_LIMIT` and retain
`DEAL_SEARCH_LIMIT` as a temporary alias until Task 5 removes internal use.

Implement factories and entity-aware signatures:

```ts
export function createInitialDraft(entity: CrmEntity): CrmSearchDraft {
  return entity === "deal"
    ? {
        entity,
        dateField: "createdAt",
        beforeDate: "",
        pipelineId: "",
        stageId: "",
        assignedById: "",
      }
    : {
        entity,
        dateField: "createdAt",
        beforeDate: "",
        statusId: "",
        assignedById: "",
      };
}

export function criteriaSignature(criteria: CrmSearchCriteria): string {
  return criteria.entity === "deal"
    ? JSON.stringify([
        criteria.entity,
        criteria.dateField,
        criteria.beforeDate,
        criteria.pipelineId,
        criteria.stageId,
        criteria.assignedById,
      ])
    : JSON.stringify([
        criteria.entity,
        criteria.dateField,
        criteria.beforeDate,
        criteria.statusId,
        criteria.assignedById,
      ]);
}
```

Generalize selection utilities to `readonly CrmItem[]`. Generalize the reducer and hook, add `{ type: "reset" }`, and ensure request revision—not entity strings alone—rejects late results.

Change `BitrixAdapter` to the final entity-aware interface in this task. Adapt
the existing mock and real implementations conservatively so they advertise
only `["deal"]`, return the current deal options for
`getFilterOptions("deal")`, and run the current deal code for `search()` with
deal criteria. Reject lead calls locally until Tasks 2 and 3 add their
respective implementations. Update `App` to the generic method names while it
still fixes the selected entity to deals. This keeps the repository
type-correct at the Task 1 commit.

- [x] **Step 4: Run focused and full shared-domain tests and verify GREEN**

Run:

```bash
npm test -- src/deals/domain src/deals/state
npm run typecheck
```

Expected: all selected tests and typecheck PASS; existing deal semantics remain unchanged.

- [x] **Step 5: Commit the domain increment**

```bash
git add src/deals/domain src/deals/state src/deals/data/BitrixAdapter.ts src/deals/data/MockBitrixAdapter.ts src/deals/data/mockDeals.ts src/deals/data/BitrixDealReadAdapter.ts src/deals/data/BitrixDealReadAdapter.test.ts src/deals/data/MockBitrixAdapter.test.ts src/app/App.tsx src/test/dealFixtures.ts
git commit -m "refactor: introduce shared CRM entity domain"
```

---

### Task 2: Generalize confirmation, checkpoints, and mock transport

**Files:**

- Modify: `src/deals/domain/confirmation.ts`
- Modify: `src/deals/domain/confirmation.test.ts`
- Modify: `src/deals/operation/types.ts`
- Modify: `src/deals/operation/operationRecord.ts`
- Modify: `src/deals/operation/operationRecord.test.ts`
- Modify: `src/deals/operation/OperationRunner.ts`
- Modify: `src/deals/operation/OperationRunner.test.ts`
- Modify: `src/deals/data/MockBitrixAdapter.ts`
- Modify: `src/deals/data/MockBitrixAdapter.test.ts`
- Modify: `src/deals/data/MockDeletion.test.ts`
- Modify: `src/deals/data/mockDeals.ts`
- Create: `src/deals/data/mockLeads.ts`

**Interfaces:**

- Consumes: Task 1 CRM unions and `CRM_SEARCH_LIMIT`.
- Produces: entity-aware `OperationContext`, `SelectionSnapshot`, `DeleteTransport.deleteItem()`, mock lead dictionaries/items, and a mock adapter implementing both entities.

- [x] **Step 1: Write failing safety tests for cross-entity isolation**

Add confirmation tests using a valid lead selection and assert:

```ts
expect(createSelectionSnapshot(validLeadInput, now)?.context.entity).toBe(
  "lead",
);
expect(isSelectionCurrent(leadSnapshot, dealSnapshot, now)).toBe(false);
```

Add checkpoint tests proving schema `1` accepts a lead record only in a matching lead context, rejects it in a deal context, continues to accept an existing deal record, and rejects `entity: "contact"`.

Add runner tests proving `deleteItem(id, context)` receives `entity: "lead"`, and add mock tests for successful lead search/deletion plus rejection of a lead ID under a deal context.

- [x] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm test -- src/deals/domain/confirmation.test.ts src/deals/operation src/deals/data/MockBitrixAdapter.test.ts src/deals/data/MockDeletion.test.ts
```

Expected: FAIL because operation records only accept deals and the transport is deal-specific.

- [x] **Step 3: Implement entity-aware safety boundaries and mock data**

Change the operation contracts exactly as follows:

```ts
export interface OperationContext {
  readonly portal: string;
  readonly userId: string;
  readonly entity: CrmEntity;
  readonly isAdmin: boolean;
}

export interface DeleteTransport {
  deleteItem(id: string, context: OperationContext): Promise<DeleteOutcome>;
}
```

Validate criteria through `validateCrmSearchDraft()` and require its entity to equal `context.entity`. In `parseOperationRecord()`, accept only `deal` or `lead`, preserve the stored literal entity, and keep `schemaVersion: 1`. Do not loosen any ID, attempts, status, size, portal, user, or administrator checks.

Add deterministic failed-lead mock statuses and at least three lead items covering date, status, assignee, exclusion, and pagination/UI tests. Extend the mock adapter:

```ts
readonly supportedEntities = ["deal", "lead"] as const;
getFilterOptions(entity: CrmEntity): Promise<CrmFilterOptions>;
search(criteria: CrmSearchCriteria): Promise<CrmSearchResult>;
deleteItem(id: string, context: OperationContext): Promise<DeleteOutcome>;
```

The lead search must enforce failed statuses even if called without a specific status. The delete method must choose the dataset by `context.entity` and never match an ID from the other entity.

- [x] **Step 4: Run focused tests, operation tests, and typecheck**

Run:

```bash
npm test -- src/deals/domain/confirmation.test.ts src/deals/operation src/deals/data/MockBitrixAdapter.test.ts src/deals/data/MockDeletion.test.ts
npm run typecheck
```

Expected: all selected tests and typecheck PASS.

- [x] **Step 5: Commit the safety and mock increment**

```bash
git add src/deals/domain/confirmation.ts src/deals/domain/confirmation.test.ts src/deals/operation src/deals/data/MockBitrixAdapter.ts src/deals/data/MockBitrixAdapter.test.ts src/deals/data/MockDeletion.test.ts src/deals/data/mockDeals.ts src/deals/data/mockLeads.ts
git commit -m "feat: add isolated mock lead operations"
```

---

### Task 3: Add the real read-only Bitrix24 lead adapter path

**Files:**

- Modify: `src/deals/data/BitrixDealReadAdapter.ts`
- Modify: `src/deals/data/BitrixDealReadAdapter.test.ts`
- Modify: `src/bitrix/B24SdkReadGateway.test.ts`
- Modify: `src/app/runtime.test.ts`

**Interfaces:**

- Consumes: entity-aware adapter contract from Task 1 and existing read gateway allowlist.
- Produces: lead dictionaries and `crm.item.list` preview with `entityTypeId: 1`; no new gateway methods.

- [x] **Step 1: Add failing contract tests for lead statuses and item search**

Add tests asserting the exact lead status request:

```ts
expect(gateway.fetchList).toHaveBeenCalledWith(
  "crm.status.list",
  { filter: { ENTITY_ID: "STATUS" } },
  { idKey: "ID" },
);
```

Return paginated statuses including process, success, and failed entries. Assert only failed entries appear, duplicates are removed, and `SORT` order wins over response order. Cover page sizes 50 and 51.

Add exact lead search expectations for a UTC context and a valid
date-restricted search with no specifically selected failed status:

```ts
expect(gateway.fetchList).toHaveBeenCalledWith(
  "crm.item.list",
  {
    entityTypeId: 1,
    select: [
      "id",
      "title",
      "stageId",
      "assignedById",
      "createdTime",
      "updatedTime",
    ],
    filter: {
      "@stageId": ["JUNK", "NOT_INTERESTED"],
      "<=createdTime": "2026-09-01T23:59:59.000Z",
    },
  },
  { idKey: "id" },
);
```

Also cover one selected status, assignee/date filters, unknown historical assignee fallback, malformed fields, no failed statuses with no item request, duplicates, and the 0/3,000/3,001 boundaries.

- [x] **Step 2: Run adapter tests and verify RED**

Run:

```bash
npm test -- src/deals/data/BitrixDealReadAdapter.test.ts src/bitrix/B24SdkReadGateway.test.ts src/app/runtime.test.ts
```

Expected: FAIL because the real adapter exposes only deal methods.

- [x] **Step 3: Implement the lead read branch with shared parsers**

Implement the Task 1 `BitrixAdapter` interface for leads and advertise
`["deal", "lead"]`. Within the existing real adapter, cache dictionaries per
entity rather than in one global promise. Reuse context, time-zone, assignee,
datetime, sort, deduplication, and limit parsing. Implement lead status parsing
from `STATUS_ID`, `NAME`, `SORT`, and both semantics forms. Do not call
`crm.category.list` for leads.

Build lead item filters with `@stageId` for the discovered failed status IDs and merge the selected status, assignee, and inclusive date exactly as deal filters do. Parse `stageId` into shared `statusId`/`statusName` and set `entity: "lead"`.

Keep the gateway allowlists byte-for-byte unchanged and add a regression assertion that `crm.item.delete` is still rejected before any SDK call.

- [x] **Step 4: Run focused adapter/runtime tests and typecheck**

Run:

```bash
npm test -- src/deals/data/BitrixDealReadAdapter.test.ts src/bitrix/B24SdkReadGateway.test.ts src/app/runtime.test.ts
npm run typecheck
```

Expected: all selected tests and typecheck PASS; no mutating method is permitted.

- [x] **Step 5: Commit the read-only integration increment**

```bash
git add src/deals/data/BitrixDealReadAdapter.ts src/deals/data/BitrixDealReadAdapter.test.ts src/bitrix/B24SdkReadGateway.test.ts src/app/runtime.test.ts
git commit -m "feat: read failed leads from Bitrix24"
```

---

### Task 4: Make CSV, preview, filters, and confirmation entity-aware

**Files:**

- Modify: `src/deals/domain/dealCsv.ts`
- Modify: `src/deals/domain/dealCsv.test.ts`
- Modify: `src/deals/domain/types.ts`
- Modify: `src/deals/data/BitrixDealReadAdapter.ts`
- Modify: `src/deals/data/BitrixDealReadAdapter.test.ts`
- Modify: `src/deals/data/mockDeals.ts`
- Modify: `src/test/dealFixtures.ts`
- Modify: `src/deals/ui/CriteriaSummary.tsx`
- Modify: `src/deals/ui/DealFilters.tsx`
- Modify: `src/deals/ui/DealPreview.tsx`
- Modify: `src/deals/ui/DealPreview.test.tsx`
- Modify: `src/deals/ui/DealCsvExport.tsx`
- Modify: `src/deals/ui/DealCsvExport.test.tsx`
- Modify: `src/deals/ui/DealConfirmation.tsx`
- Modify: `src/deals/ui/DealConfirmation.test.tsx`
- Modify: `src/deals/ui/SearchFeedback.tsx`
- Modify: `src/deals/ui/OperationProgress.tsx`

**Interfaces:**

- Consumes: Task 1 CRM unions and Task 2 selection snapshots.
- Produces: shared UI components that render entity-correct controls, links, nouns, and exports.

- [x] **Step 1: Write failing component and CSV tests for leads**

Add a lead CSV assertion with the exact header and no pipeline column:

```ts
expect(createCrmCsv("lead", [lead], new Set())).toBe(
  "\uFEFFID;Название;Статус;Ответственный;Дата создания;Дата изменения\r\n" +
    "41;Некачественная заявка;Забракован;Иван Иванов;2026-01-01T00:00:00.000Z;2026-02-01T00:00:00.000Z",
);
```

Add UI tests proving that lead filters contain `Неуспешный статус` but no `Воронка`, lead links equal `https://portal.example/crm/lead/details/41/`, preview text uses `лидов`, and the download filename is `crm-cleaner-leads.csv`. Assert deal labels, deal links, and the deal CSV header remain unchanged.

Add confirmation and progress assertions for the phrases `Удалить 3 демо-лида` and entity-correct result wording.

- [x] **Step 2: Run UI/domain tests and verify RED**

Run:

```bash
npm test -- src/deals/domain/dealCsv.test.ts src/deals/ui
```

Expected: FAIL because components assume deal-only pipelines, links, columns, and nouns.

- [x] **Step 3: Generalize UI behavior with explicit entity branches**

Export `createCrmCsv(entity, items, excludedIds)` and choose headers/rows by the
explicit entity. Reject any item whose discriminator does not match that
entity. The explicit argument keeps an empty export well-defined. Preserve the
existing CSV escaping and formula neutralization function unchanged.

Update shared components to accept discriminated options/criteria/items. Render the pipeline control and pipeline cell only when `entity === "deal"`. Build card paths through one helper:

```ts
const segment = item.entity === "deal" ? "deal" : "lead";
return new URL(`/crm/${segment}/details/${item.id}/`, portal).toString();
```

Centralize Russian labels in a small exhaustive map:

```ts
interface EntityCopy {
  readonly one: string;
  readonly few: string;
  readonly many: string;
  readonly title: string;
}

export const ENTITY_COPY = {
  deal: {
    one: "сделку",
    few: "сделки",
    many: "сделок",
    title: "Старые проигранные сделки",
  },
  lead: {
    one: "лид",
    few: "лида",
    many: "лидов",
    title: "Старые неуспешные лиды",
  },
} as const satisfies Record<CrmEntity, EntityCopy>;
```

Do not derive security decisions from localized text; the discriminator remains authoritative.

Complete the Task 1 migration by removing the temporary deal item aliases
`stageId` and `stageName`. Deal criteria and stage dictionary entries retain
their existing names, but every preview item uses the shared `statusId` and
`statusName` fields. Update the real parser, mock data, fixtures, and exact
expectations accordingly.

- [x] **Step 4: Run all UI and shared-domain tests plus typecheck**

Run:

```bash
npm test -- src/deals/domain src/deals/ui
npm run typecheck
```

Expected: all selected tests and typecheck PASS for both entities.

- [x] **Step 5: Commit the entity-aware presentation increment**

```bash
git add src/deals/domain/dealCsv.ts src/deals/domain/dealCsv.test.ts src/deals/domain/types.ts src/deals/data/BitrixDealReadAdapter.ts src/deals/data/BitrixDealReadAdapter.test.ts src/deals/data/mockDeals.ts src/deals/ui src/test/dealFixtures.ts
git commit -m "feat: present and export lead previews"
```

---

### Task 5: Wire the entity selector and lifecycle into the application

**Files:**

- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/app/OperationFlow.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**

- Consumes: Task 2 multi-entity mock adapter, Task 3 real adapter, Task 4 shared UI, and `useCrmSearch().reset()` from Task 1.
- Produces: a two-entity application with safe switching and complete demo lead flow.

- [x] **Step 1: Write failing application tests for selection and races**

Add tests that start on deals, switch to leads, and assert:

```ts
expect(
  screen.getByRole("heading", { name: "Старые неуспешные лиды" }),
).toBeVisible();
expect(screen.queryByLabelText("Воронка")).not.toBeInTheDocument();
expect(screen.getByLabelText("Неуспешный статус")).toBeVisible();
```

Cover these lifecycle cases:

- a ready deal preview disappears immediately after switching to leads;
- exclusions and an open confirmation do not cross the switch;
- a delayed deal options/search response cannot overwrite lead state;
- selector controls are disabled while a mock operation is running;
- complete mock lead search → exclusion → CSV → confirmation → deletion works;
- real read-only lead preview never renders a delete confirmation.

- [x] **Step 2: Run application tests and verify RED**

Run:

```bash
npm test -- src/app/App.test.tsx src/app/OperationFlow.test.tsx
```

Expected: FAIL because there is no entity selector or lead lifecycle wiring.

- [x] **Step 3: Implement the selector and entity-scoped async lifecycle**

Replace the fixed initial draft with `createInitialDraft(entity)`. On selection change, synchronously reset draft, errors, search state, and confirmation version before loading new options. Guard options with a monotonically increasing request revision in the effect cleanup:

```ts
useEffect(() => {
  let active = true;
  setOptionsState({ kind: "loading" });
  void adapter.getFilterOptions(entity).then(
    (value) => {
      if (active && value.entity === entity)
        setOptionsState({ kind: "ready", value });
    },
    () => {
      if (active) setOptionsState({ kind: "failure" });
    },
  );
  return () => {
    active = false;
  };
}, [adapter, entity]);
```

Render two radio buttons or a two-button radiogroup named `Сущность CRM`, with `Сделки` and `Лиды`. Disable it while `operation.busy`. Pass the selected entity into snapshot context and use shared entity copy for headings and status text. Keep the default entity `deal`.

Add only the CSS needed for the selector, following the current soft turquoise design and existing focus styles.

- [x] **Step 4: Run application tests, then the complete suite**

Run:

```bash
npm test -- src/app/App.test.tsx src/app/OperationFlow.test.tsx
npm test
npm run typecheck
```

Expected: focused tests, all project tests, and typecheck PASS.

- [x] **Step 5: Commit the integrated lead flow**

```bash
git add src/app/App.tsx src/app/App.test.tsx src/app/OperationFlow.test.tsx src/styles.css
git commit -m "feat: add safe deal and lead switching"
```

---

### Task 6: Update authoritative documentation and verify the release candidate

**Files:**

- Modify: `PLAN.md`
- Modify: `PRODUCT.md`
- Modify: `docs/PLAN.md`
- Modify: `docs/PRODUCT.md`
- Modify: `docs/STATUS.md`
- Modify: `docs/TEST-MATRIX.md`
- Modify: `docs/DECISIONS.md`

**Interfaces:**

- Consumes: the completed Tasks 1–5 behavior and verification evidence.
- Produces: authoritative roadmap/status text, byte-identical mirrors, and a fully verified local commit.

- [x] **Step 1: Update the root product documents first**

In `PLAN.md`, record leads as the selected second entity and state that local demo plus real read-only code is implemented while portal verification remains pending. Do not mark real iframe or real deletion stages complete.

In `PRODUCT.md`, replace the undecided “second CRM entity” wording with leads and document the conservative failed-status boundary. Preserve the statement that external payment—not local implementation—validates demand.

Apply the same textual changes to `docs/PLAN.md` and `docs/PRODUCT.md`, then
prove that both mirrors are byte-identical with `cmp` in Step 3.

- [x] **Step 2: Record exact evidence in status, matrix, and decisions**

Update `docs/STATUS.md` with the actual test count and production bundle sizes from this run. Update `docs/TEST-MATRIX.md` with local lead coverage and leave the Bitrix column unverified. Add a decision to `docs/DECISIONS.md` explaining `entityTypeId: 1`, `ENTITY_ID: STATUS`, failed-only semantics, shared discriminated core, and unchanged read-only allowlist.

- [x] **Step 3: Run the full verification suite**

Run:

```bash
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
rg --files public dist -g '*.php' | xargs -r -n1 php -l
cmp PLAN.md docs/PLAN.md
cmp PRODUCT.md docs/PRODUCT.md
git diff --check
cmp node_modules/@bitrix24/b24jssdk/LICENSE third-party/licenses/bitrix24-b24jssdk-LICENSE.txt
```

Expected: every command exits `0`; test count and bundle sizes match the values written to `docs/STATUS.md`.

- [x] **Step 4: Run read-only and secret regression scans**

Run:

```bash
if rg -n 'crm\.(item|deal|lead)\.(add|update|delete)' src/bitrix src/deals/data/BitrixDealReadAdapter.ts src/app/runtime.ts --glob '!*.test.*'; then exit 1; fi
if rg -n -i 'client[_-]?secret|refresh[_-]?token|access[_-]?token|webhook' src --glob '!*.test.*'; then exit 1; fi
if rg -n -P 'https://[^[:space:]`"<>]+/rest/[0-9]+/[A-Za-z0-9_-]{8,}' dist/assets -g '*.js'; then exit 1; fi
if rg -n -P '["`]?(access_token|refresh_token|client_secret)["`]?\s*:\s*["`][A-Za-z0-9._-]{12,}["`]' dist/assets -g '*.js'; then exit 1; fi
rg -o 'crm\.category\.list|crm\.item\.list|crm\.status\.list|user\.get' dist/assets/*.js | sort -u
```

Expected: the first four scans return no matches; the final scan prints only the four expected read methods.

- [x] **Step 5: Commit the documentation and verified release candidate**

```bash
git add PLAN.md PRODUCT.md docs/PLAN.md docs/PRODUCT.md docs/STATUS.md docs/TEST-MATRIX.md docs/DECISIONS.md
git commit -m "docs: record local lead entity verification"
```

- [x] **Step 6: Request final independent review**

Review the complete range from the pre-Task-1 base commit through Task 6 against `docs/superpowers/specs/2026-09-10-lead-entity-design.md`. Fix every Critical and Important finding, rerun the affected focused tests, and rerun the complete verification suite before completion.

Completed: independent review of `20656b8..259b5bb` found no Critical/Important issues. Minor date-field validation, wording and evidence corrections were addressed; reviewer rechecked the code delta with 78 passing tests. Full suite after corrections: 290 passing tests. See `docs/TEST-MATRIX.md`, run `local-lead-entity-2026-09-11`.
