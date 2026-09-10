# Lead Entity Design

**Date:** 2026-09-10  
**Status:** approved in chat  
**Scope:** add leads as the second CRM entity without enabling real deletion

## Goal

Extend CRM Cleaner from a deal-only application to a two-entity application
that can safely preview old failed leads in both demo and real Bitrix24 iframe
modes. Leads must reuse the existing selection, CSV, confirmation, checkpoint,
locking, retry, pause, stop, and reporting guarantees. This increment remains
read-only against a real portal.

## Product boundary

- The application offers an explicit `Сделки` / `Лиды` entity selector.
- Deals keep their current behavior: only lost stages, optional pipeline,
  optional stage, optional assignee, and an optional inclusive date boundary.
- Leads use the same date and assignee filters, omit the pipeline filter, and
  offer only statuses whose Bitrix24 semantics are failed (`F` or `failure`).
- Active and successful leads are never included in an implicit “all statuses”
  lead search. “All statuses” means all failed lead statuses discovered from
  Bitrix24, not every lead status.
- The 3,000 unique-item limit, ten-minute preview lifetime, exact-ID
  confirmation, administrator requirement, and portal/user isolation apply to
  both entities.
- Demo mode supports the complete lead flow, including the existing simulated
  delete executor. Real iframe mode supports preview and CSV only. Adding a
  mutating SDK allowlist entry or real delete transport is outside this scope.

## Approaches considered

### Duplicate the deal flow

Create separate lead state, UI, CSV, confirmation, and operation components.
This is initially quick but duplicates the most safety-sensitive logic and
makes fixes likely to diverge. Rejected.

### One generic untyped item model

Make deal-only fields nullable everywhere and drive behavior with string flags.
This reduces file count but permits invalid states such as a lead with a deal
pipeline. Rejected.

### Shared discriminated CRM core

Use `entity: "deal" | "lead"` as the discriminator for item, options, draft,
criteria, selection, and checkpoint data. Shared components handle common
fields; entity-specific branches render and validate the pipeline field only
for deals. This keeps one safety path while retaining compile-time checks.
Selected.

## Domain model

Introduce `CrmEntity = "deal" | "lead"` and discriminated unions for:

- preview items;
- filter options;
- editable search drafts and normalized criteria;
- search results and state;
- operation context and persisted records.

Both item variants contain ID, title, status ID/name, assignee ID/name, creation
time, and modification time. Only the deal variant contains pipeline ID/name.
Both criteria variants contain date field, optional date, optional status, and
optional assignee. Only deal criteria contains an optional pipeline.

The public adapter boundary becomes entity-aware:

```ts
interface CrmAdapter {
  readonly supportedEntities: readonly CrmEntity[];
  getFilterOptions(entity: CrmEntity): Promise<CrmFilterOptions>;
  search(criteria: CrmSearchCriteria): Promise<CrmSearchResult>;
}
```

Returned options and items must have the requested entity discriminator.
Mismatches are treated as invalid adapter responses rather than rendered.

Existing deal behavior is preserved with characterization tests before names or
interfaces are generalized. Physical file moves are not required for this
increment; avoiding a repository-wide rename keeps the functional diff focused.

## Entity selection and state lifecycle

The selector sits above the filters and defaults to deals so existing startup
behavior does not change. It is disabled while a mock operation is busy.

Changing the entity:

1. creates the entity’s empty draft;
2. clears validation errors, preview rows, exclusions, and stale-result state;
3. invalidates any open confirmation;
4. loads the selected entity’s dictionaries;
5. switches the checkpoint/lock key through the operation context entity.

Late dictionary or search responses for the previously selected entity are
ignored. A failed lead dictionary request cannot replace valid deal options and
vice versa.

## Bitrix24 read path

The existing gateway allowlist does not expand. Leads use the already permitted
methods:

- `crm.status.list` with `filter: { ENTITY_ID: "STATUS" }` for lead statuses;
- `user.get` for active assignees;
- `crm.item.list` with `entityTypeId: 1` for lead items.

Status pages are collected to completion through the SDK list helper,
deduplicated by status ID, sorted by `SORT`, and reduced to failed semantics.
Both `SEMANTICS: "F"` and `EXTRA.SEMANTICS: "failure"` are accepted, matching
the defensive deal-stage parser.

Lead search sends a single server filter containing all failed status IDs when
no specific failed status was selected. Optional assignee and inclusive
date-boundary filters follow the existing deal rules. Requested fields are
`id`, `title`, `stageId`, `assignedById`, `createdTime`, and `updatedTime`.
Items are validated, deduplicated by numeric ID, and collection stops as soon as
the 3,001st unique item is observed. If the portal exposes no failed lead
statuses, search returns an empty result without issuing an unfiltered item
request.

Lead card links use the validated portal origin and numeric ID with the path
`/crm/lead/details/<id>/`.

## UI and exports

Shared wording uses the selected entity:

- deals: `Старые проигранные сделки`;
- leads: `Старые неуспешные лиды`.

Lead filters show date, failed status, and assignee, but no pipeline. Preview
shows ID, title, status, assignee, creation time, and modification time. Counts,
pagination, row exclusion, keyboard behavior, and read-only labels stay common.

CSV keeps UTF-8 BOM, formula neutralization, quoting, line-break handling, and
the exact selected set. Deals retain `crm-cleaner-deals.csv`; leads download as
`crm-cleaner-leads.csv` and omit the pipeline column.

Confirmation text and operation progress use entity-correct Russian nouns.
The confirmation snapshot includes the entity discriminator, so switching
entity or presenting a selection from another entity makes it invalid.

## Checkpoint compatibility

The current schema version remains `1` because its stored shape already has an
entity field and adding the `lead` enum value does not remove or reinterpret any
existing field. The parser accepts only `deal` and `lead`, continues to reject
unknown entities, and requires the stored entity to equal the current operation
context. Existing deal checkpoints remain valid.

Mock deletion is renamed at the transport boundary from deal-specific wording
to item wording and verifies the context entity before looking up the selected
mock dataset. Real SDK deletion remains impossible because the read gateway
continues to reject `crm.item.delete`.

## Failure behavior

- Malformed lead status or item payload: `invalid-bitrix-response`.
- SDK/REST failure: stable `bitrix-request-failed` without raw external text.
- No failed statuses or no matches: valid empty result.
- More than 3,000 unique leads: over-limit result; no partial preview.
- Dictionary/search race after entity switching: obsolete response ignored.
- Unsupported entity or cross-entity item/options mismatch: rejected locally.
- Storage or lock failure: operation start remains blocked as for deals.

## Verification

Development follows red-green-refactor. Tests must cover:

- existing deal behavior before and after generalization;
- entity switching, reset behavior, late-response races, and busy-state lockout;
- lead draft validation with no pipeline dependency;
- lead status pagination, 50/51 boundaries, deduplication, CRM sort order, and
  failed-semantics filtering;
- exact `crm.item.list` lead parameters, paging, date boundary, assignee/status
  filters, 0/3,000/3,001 unique items, and duplicates across pages;
- malformed lead payloads and unknown assignees;
- lead card links, preview columns, exclusions, counts, and pagination;
- entity-specific CSV contents and filenames;
- confirmation invalidation and deal/lead checkpoint isolation;
- complete mock lead operation while real lead mode exposes no delete control;
- continued gateway rejection of every mutating CRM method.

Before completion run the full test suite, TypeScript, ESLint, Prettier,
production build, PHP lint, document mirror checks, `git diff --check`, SDK
license comparison, and source/bundle secret and mutating-method scans. A final
independent review must have no open Critical or Important findings.

## Documentation

`PLAN.md` and `PRODUCT.md` remain authoritative. Implementation updates them
first to record leads as the selected second entity and then copies the result
to their `docs/` mirrors byte-for-byte. `STATUS.md`, `TEST-MATRIX.md`, and
`DECISIONS.md` record what is locally proven and keep real iframe and deletion
checks explicitly unverified until they are performed on the test portal.
