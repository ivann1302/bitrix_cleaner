# Local operation implementation plan

> **For agentic workers:** execute task-by-task with TDD and independent review. User requested autonomous local work; do not re-request routine design approval.

**Goal:** complete and test the local CSV → confirmation → mock operation → report flow.

**Architecture:** pure immutable confirmation; UI commands an independent sequential runner. Native IndexedDB persists minimal state; Web Locks excludes another tab. No real CRM requests.

**Tech Stack:** existing React/TypeScript/Vitest; native browser APIs, no additional runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-10-local-operation-design.md`.

## Global constraints

- Root PRODUCT.md/PLAN.md have priority; existing user files preserved.
- No real CRM requests, external deployment, tokens, backend or automatic resume.
- Maximum 3,000 records; preview lifetime 600,000 ms; maximum three attempts per ID.
- Fail closed on context, storage, locking or confirmation failures.

## Task 1: CSV and confirmation

- [x] Test then implement `domain/dealCsv.ts`, `ui/DealCsvExport.tsx`, `domain/confirmation.ts`, `ui/DealConfirmation.tsx`.
- [x] Extend ready search state with `collectedAt:number`, `selectionVersion:number`; increment selectionVersion on actual exclusion changes.
- [x] In App invalidate confirmation on every draft change, not only criteria inequality; render native modal with cancel focus and return focus.
- [x] Verify focused tests, then typecheck/lint.

## Task 2: Sequential runner

Create `src/deals/operation/types.ts`, `OperationRunner.ts`, `OperationRunner.test.ts`.
Types consumed by storage and UI:

```ts
type ItemStatus = 'pending' | 'sent' | 'deleted' | 'error' | 'unknown';
interface OperationItem { readonly id:string; readonly status:ItemStatus; readonly attempts:number; readonly errorCode?:string }
interface OperationRecord {
  readonly schemaVersion:1; readonly operationId:string;
  readonly context:OperationContext; readonly createdAt:number;
  readonly status:'running'|'paused'|'stopped'|'completed'|'interrupted';
  readonly items:readonly OperationItem[];
}
interface OperationStore {
  save(record:OperationRecord):Promise<void>;
  load(context:OperationContext):Promise<OperationRecord|null>;
}
interface OperationLock {
  runExclusive(key:string,work:()=>Promise<void>):Promise<boolean>;
}
type DeleteOutcome = {kind:'deleted'} | {kind:'unknown'} |
  {kind:'error';code:string;temporary:boolean;retryAfterMs?:number};
interface DeleteTransport {
  deleteDeal(id:string,context:OperationContext):Promise<DeleteOutcome>;
}
```

- [x] Write failing tests demonstrating no transport call until checkpoint succeeds; `await runner.start(snapshot)` handles only snapshot IDs, never repeats unknown.
- [x] Implement `OperationRunner` constructor `{store,lock,transport,getCurrentSnapshot,now?,wait?,onUpdate}`. `start(snapshot):Promise<void>`, `pause():void`, `resume():void`, `stop():void`. Report failures by safe rejected Error; caller catches. `onUpdate(record)` receives copied immutable state.
- [x] Test concurrent start, paused in-flight result, stop, capped retry, rights error, expiry/context change before sends, storage failure before and after transport, 3,000 IDs.
- [x] Run focused tests/typecheck/lint.

## Task 3: Browser storage and demo transport

Create `IndexedDbOperationStore.ts`, `BrowserOperationLock.ts`, `operationRecord.ts` plus tests under operation/.

- [x] Runtime parser accepts unknown; validate schema, canonical IDs, context match, finite timestamps, unique bounded records, statuses and attempts. Return interrupted copy for unfinished saved records and sent → unknown. No resumed sends.
- [x] Implement store with a single object store keyed by JSON tuple portal/user/entity. Await transaction completion; reject blocked/error/abort and schema mismatch. Store only defined safe fields, one record per context.
- [x] Implement Web Locks exclusive ifAvailable, returning false when occupied; unsupported rejects.
- [x] Verify parser/lock tests and actual browser IndexedDB persistence and cross-tab lock.

## Task 4: App integration and verification

- [x] Add a mock-only transport, deterministic successful deletion of existing mock IDs; missing ID produces error, not false success.
- [x] Test user flow through App, modal, operation progress, pause and results. App catches runner/storage errors, never starts from Effect. Disable filter/selection changes while active.
- [x] Add responsive modal/progress CSS using existing tokens. Show saved interruption without auto-start; explicit new search required.
- [x] Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` and browser checks. Review changed code for invariant bypasses.
- [x] Update STATUS, TEST-MATRIX and DECISIONS; mark root PLAN substeps complete only for their actual scope. Keep mirror identical.
