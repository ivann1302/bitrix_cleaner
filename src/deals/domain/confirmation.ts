import type { Deal, DealSearchCriteria } from "./types";
import {
  criteriaSignature,
  DEAL_SEARCH_LIMIT,
  validateDealSearchDraft,
} from "./dealSearch";

export interface OperationContext {
  readonly portal: string;
  readonly userId: string;
  readonly entity: "deal";
  readonly isAdmin: boolean;
}

export interface SelectionSnapshot {
  readonly context: OperationContext;
  readonly revision: number;
  readonly selectionVersion: number;
  readonly criteria: DealSearchCriteria;
  readonly ids: readonly string[];
  readonly collectedAt: number;
}

interface SelectionInput {
  readonly context: OperationContext;
  readonly revision: number;
  readonly selectionVersion: number;
  readonly criteria: DealSearchCriteria;
  readonly items: readonly Deal[];
  readonly excludedIds: ReadonlySet<string>;
  readonly collectedAt: number;
}

function isFresh(collectedAt: number, now: number): boolean {
  return (
    Number.isFinite(now) &&
    Number.isFinite(collectedAt) &&
    now >= collectedAt &&
    now - collectedAt < 600_000
  );
}

function isValidSelection(snapshot: SelectionSnapshot, now: number): boolean {
  const { context, criteria, ids } = snapshot;
  return (
    context.isAdmin &&
    context.portal.trim() !== "" &&
    context.userId.trim() !== "" &&
    context.entity === "deal" &&
    Number.isSafeInteger(snapshot.revision) &&
    snapshot.revision > 0 &&
    Number.isSafeInteger(snapshot.selectionVersion) &&
    snapshot.selectionVersion >= 0 &&
    (criteria.dateField === "createdAt" ||
      criteria.dateField === "updatedAt") &&
    validateDealSearchDraft({
      dateField: criteria.dateField,
      beforeDate: criteria.beforeDate ?? "",
      pipelineId: criteria.pipelineId ?? "",
      stageId: criteria.stageId ?? "",
      assignedById: criteria.assignedById ?? "",
    }).ok &&
    ids.length > 0 &&
    ids.length <= DEAL_SEARCH_LIMIT &&
    ids.every((id) => /^[1-9]\d*$/.test(id)) &&
    new Set(ids).size === ids.length &&
    isFresh(snapshot.collectedAt, now)
  );
}

export function createSelectionSnapshot(
  input: SelectionInput,
  now: number,
): SelectionSnapshot | null {
  const snapshot: SelectionSnapshot = {
    context: { ...input.context },
    criteria: { ...input.criteria },
    revision: input.revision,
    selectionVersion: input.selectionVersion,
    ids: input.items.map((item) => item.id),
    collectedAt: input.collectedAt,
  };
  // Check the full collection before exclusions: a partial over-limit preview is unsafe.
  if (!isValidSelection(snapshot, now)) return null;
  const ids = snapshot.ids.filter((id) => !input.excludedIds.has(id));
  if (ids.length === 0) return null;
  return Object.freeze({
    ...snapshot,
    context: Object.freeze(snapshot.context),
    criteria: Object.freeze(snapshot.criteria),
    ids: Object.freeze(ids),
  });
}

export function isSelectionCurrent(
  snapshot: SelectionSnapshot,
  current: SelectionSnapshot,
  now: number,
): boolean {
  if (!isValidSelection(snapshot, now) || !isValidSelection(current, now))
    return false;
  const currentIds = new Set(current.ids);
  return (
    snapshot.context.portal === current.context.portal &&
    snapshot.context.userId === current.context.userId &&
    snapshot.context.entity === current.context.entity &&
    snapshot.context.isAdmin === current.context.isAdmin &&
    snapshot.revision === current.revision &&
    snapshot.selectionVersion === current.selectionVersion &&
    snapshot.collectedAt === current.collectedAt &&
    criteriaSignature(snapshot.criteria) ===
      criteriaSignature(current.criteria) &&
    snapshot.ids.length === current.ids.length &&
    snapshot.ids.every((id) => currentIds.has(id))
  );
}
