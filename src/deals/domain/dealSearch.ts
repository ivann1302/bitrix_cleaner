import type {
  CrmEntity,
  CrmItem,
  CrmSearchCriteria,
  CrmSearchDraft,
  CrmSearchValidation,
  Deal,
  DealSearchCriteria,
  DealSearchDraft,
  DealSearchValidation,
  LeadSearchCriteria,
} from "./types";

export const CRM_SEARCH_LIMIT = 3000;
export const DEAL_SEARCH_LIMIT = CRM_SEARCH_LIMIT;
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
    entity: "deal",
    dateField: draft.dateField,
    beforeDate: emptyToNull(draft.beforeDate),
    pipelineId: emptyToNull(draft.pipelineId),
    stageId: emptyToNull(draft.stageId),
    assignedById: emptyToNull(draft.assignedById),
  };
}

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

export function normalizeCrmSearchDraft(
  draft: CrmSearchDraft,
): CrmSearchCriteria {
  return draft.entity === "deal"
    ? normalizeDealSearchDraft(draft)
    : {
        entity: "lead",
        dateField: draft.dateField,
        beforeDate: emptyToNull(draft.beforeDate),
        statusId: emptyToNull(draft.statusId),
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

export function validateCrmSearchDraft(
  draft: CrmSearchDraft,
): CrmSearchValidation {
  if (draft.entity === "deal") return validateDealSearchDraft(draft);
  const criteria: LeadSearchCriteria = {
    entity: "lead",
    dateField: draft.dateField,
    beforeDate: emptyToNull(draft.beforeDate),
    statusId: emptyToNull(draft.statusId),
    assignedById: emptyToNull(draft.assignedById),
  };
  if (criteria.beforeDate !== null && !isCalendarDate(criteria.beforeDate)) {
    return {
      ok: false,
      fieldErrors: { beforeDate: "Укажите корректную календарную дату." },
    };
  }
  if (
    criteria.beforeDate === null &&
    criteria.statusId === null &&
    criteria.assignedById === null
  ) {
    return {
      ok: false,
      fieldErrors: {},
      formError: "Добавьте хотя бы одно условие поиска.",
    };
  }
  return { ok: true, criteria };
}

export function isDealSearchOverLimit(count: number): boolean {
  return count > CRM_SEARCH_LIMIT;
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

export function deduplicateCrmItems(
  items: readonly CrmItem[],
): readonly CrmItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
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
