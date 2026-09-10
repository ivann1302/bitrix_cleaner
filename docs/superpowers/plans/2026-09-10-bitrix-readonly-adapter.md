# Bitrix24 Read-only Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and test a real, read-only Bitrix24 deal adapter while preserving the safe local mock workflow.

**Architecture:** A narrow gateway owns the official SDK and rejects every method outside an explicit read allowlist. A deal adapter validates portal payloads, loads dictionaries, builds lost-deal filters, and streams at most 3,001 unique items. An async runtime bootstrap selects mock mode only at top level and real read-only mode inside an iframe.

**Tech Stack:** React 19.3, TypeScript 6.0.3, Vite 8.2.2, Vitest 5.0, `@bitrix24/b24jssdk` 2.2.0

**Spec:** `docs/superpowers/specs/2026-09-10-bitrix-readonly-adapter-design.md`, `PRODUCT.md`, and `PLAN.md`

## Global Constraints

- Root `PRODUCT.md` and `PLAN.md` win on conflicts; their `docs/` mirrors stay byte-identical.
- No external deployment, real portal call, or mutating Bitrix24 request is part of this plan.
- Real mode is read-only and must never receive the mock deletion transport.
- A successful preview contains at most 3,000 unique IDs; 3,001 returns `over-limit`.
- Tokens, SDK error details, and secrets must not enter UI text, storage, or logs.
- Every implementation change follows a failing focused test.

---

### Task 1: SDK gateway and runtime-safe context types

**Files:**

- Create: `src/bitrix/BitrixReadGateway.ts`
- Create: `src/bitrix/B24SdkReadGateway.ts`
- Create: `src/bitrix/B24SdkReadGateway.test.ts`
- Modify: `src/deals/domain/types.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**

- Consumes: official `initializeB24Frame(): Promise<B24Frame>`.
- Produces: `BitrixReadGateway`, its method union types, `connectB24SdkReadGateway()`, and `AppContext`.

- [x] **Step 1: Write the failing gateway tests**

```ts
it("unwraps successful SDK calls", async () => {
  const gateway = new B24SdkReadGateway(fakeFrame);
  await expect(gateway.call("profile")).resolves.toEqual(profilePayload);
});

it("rejects methods outside the read allowlist", async () => {
  await expect(
    gateway.call("crm.item.delete", { id: 1 }),
  ).rejects.toMatchObject({
    code: "bitrix-method-not-allowed",
  });
});
```

- [x] **Step 2: Run `npm test -- src/bitrix/B24SdkReadGateway.test.ts` and verify module-not-found failure**
- [x] **Step 3: Implement the gateway, success unwrapping, stable local errors, cursor-list bridge, portal/admin fields, and destroy**
- [x] **Step 4: Run the focused test and verify it passes**
- [x] **Step 5: Record completion in this plan**

### Task 2: Context and dynamic filter dictionaries

**Files:**

- Create: `src/deals/data/BitrixDealReadAdapter.ts`
- Create: `src/deals/data/BitrixDealReadAdapter.test.ts`

**Interfaces:**

- Consumes: `BitrixReadGateway` and validated `profile`, category, stage, and user payloads.
- Produces: `BitrixDealReadAdapter.loadContext(): Promise<AppContext>` and `getDealFilterOptions(): Promise<DealFilterOptions>`.

- [x] **Step 1: Write failing tests for profile parsing, UTC offset formatting, category/stage directory IDs, lost semantics, active-user paging, caching, and malformed payload rejection**
- [x] **Step 2: Run the focused adapter test and verify missing implementation failure**
- [x] **Step 3: Implement small runtime parsers and dictionary loading; map main category `0` to `DEAL_STAGE` and other categories to `DEAL_STAGE_<id>`**
- [x] **Step 4: Run the focused tests and verify they pass**
- [x] **Step 5: Record completion in this plan**

### Task 3: Safe streamed deal search

**Files:**

- Modify: `src/deals/data/BitrixDealReadAdapter.ts`
- Modify: `src/deals/data/BitrixDealReadAdapter.test.ts`

**Interfaces:**

- Consumes: loaded context/options and `fetchList("crm.item.list", ...)`.
- Produces: the existing `BitrixAdapter.searchDeals(criteria): Promise<DealSearchResult>` contract.

- [x] **Step 1: Write failing tests for exact `crm.item.list` parameters, created/updated date fields, all optional filters, no-lost-stage short circuit, deal mapping, historical-user fallback, deduplication, 0/3,000/3,001 boundaries, early generator close, and stable failures**
- [x] **Step 2: Run the focused tests and verify behavioral failures**
- [x] **Step 3: Implement filter construction, date boundary formatting, streamed parsing, deduplication, early limit stop, and safe result mapping**
- [x] **Step 4: Run focused adapter and existing search tests and verify they pass**
- [x] **Step 5: Record completion in this plan**

### Task 4: Async runtime selection and read-only UI

**Files:**

- Create: `src/app/runtime.ts`
- Create: `src/app/runtime.test.ts`
- Create: `src/app/BootstrapError.tsx`
- Modify: `src/main.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/deals/ui/SearchFeedback.tsx`
- Modify: `src/deals/ui/DealPreview.tsx`
- Modify: `src/deals/ui/DealPreview.test.tsx`

**Interfaces:**

- Consumes: gateway connector, real adapter, existing mock adapter/context.
- Produces: `createAppRuntime()`, `AppRuntime`, mode-aware `App` properties, and safe iframe initialization failure UI.

- [x] **Step 1: Write failing runtime/UI tests for top-level mock, iframe real mode, safe init failure, destroy, portal/user/admin rendering, non-demo messages, and no delete actions in real mode**
- [x] **Step 2: Run focused tests and verify missing runtime/mode behavior failures**
- [x] **Step 3: Implement runtime selection, bootstrap rendering, cleanup, context-driven copy, and read-only gating**
- [x] **Step 4: Run focused and complete UI tests and verify they pass**
- [x] **Step 5: Record completion in this plan**

### Task 5: Documentation and release-quality verification

**Files:**

- Modify: `PLAN.md`
- Modify: `docs/PLAN.md`
- Modify: `docs/STATUS.md`
- Modify: `docs/TEST-MATRIX.md`
- Modify: `docs/DECISIONS.md`
- Modify: `docs/THIRD-PARTY-NOTICES.md`
- Modify: `README.md`
- Modify: this plan

**Interfaces:**

- Consumes: verified test/build output.
- Produces: truthful project status and a reproducible validation record.

- [x] **Step 1: Update authoritative plan status, mirror it byte-for-byte, and document the SDK decision, dependency license, automated coverage, and remaining iframe verification**
- [x] **Step 2: Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm run build`**
- [x] **Step 3: Run PHP syntax checks, root/docs mirror comparisons, and scans for webhook/token/client-secret patterns and forbidden mutating method strings in the real adapter path**
- [x] **Step 4: Inspect the production bundle to ensure the official SDK is included and no secrets are present**
- [x] **Step 5: Record exact evidence and remaining shared work in `docs/STATUS.md`, then mark this plan complete**
