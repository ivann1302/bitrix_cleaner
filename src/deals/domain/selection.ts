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
