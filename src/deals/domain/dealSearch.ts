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
  return JSON.stringify([
    criteria.dateField,
    criteria.beforeDate,
    criteria.pipelineId,
    criteria.stageId,
    criteria.assignedById,
  ]);
}
