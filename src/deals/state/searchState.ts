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
      readonly collectedAt: number;
      readonly selectionVersion: number;
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
      readonly collectedAt: number;
    }
  | { readonly type: "toggle-excluded"; readonly id: string };

function resolvedState(
  state: Extract<DealSearchState, { kind: "loading" }>,
  result: DealSearchResult,
  collectedAt: number,
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
            collectedAt,
            selectionVersion: 0,
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
      if (state.kind !== "loading" || state.revision !== action.revision) {
        return state;
      }
      return resolvedState(state, action.result, action.collectedAt);
    case "toggle-excluded":
      if (
        state.kind !== "ready" ||
        !state.items.some((deal) => deal.id === action.id)
      ) {
        return state;
      }
      return {
        ...state,
        excludedIds: toggleExcludedId(state.excludedIds, action.id),
        selectionVersion: state.selectionVersion + 1,
      };
  }
}
