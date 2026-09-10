import { toggleExcludedId } from "../domain/selection";
import type {
  CrmItem,
  CrmSearchCriteria,
  CrmSearchResult,
} from "../domain/types";

interface RevisionState {
  readonly revision: number;
  readonly criteria: CrmSearchCriteria;
}

export type CrmSearchState =
  | { readonly kind: "initial"; readonly revision: 0 }
  | ({ readonly kind: "loading" } & RevisionState)
  | ({
      readonly kind: "ready";
      readonly items: readonly CrmItem[];
      readonly excludedIds: ReadonlySet<string>;
      readonly collectedAt: number;
      readonly selectionVersion: number;
    } & RevisionState)
  | ({ readonly kind: "empty" } & RevisionState)
  | ({ readonly kind: "over-limit"; readonly matchedAtLeast: number } & RevisionState)
  | ({ readonly kind: "failure"; readonly code: string } & RevisionState);

export const INITIAL_CRM_SEARCH_STATE: CrmSearchState = {
  kind: "initial",
  revision: 0,
};

export type CrmSearchAction =
  | {
      readonly type: "started";
      readonly revision: number;
      readonly criteria: CrmSearchCriteria;
    }
  | {
      readonly type: "resolved";
      readonly revision: number;
      readonly result: CrmSearchResult;
      readonly collectedAt: number;
    }
  | { readonly type: "toggle-excluded"; readonly id: string }
  | { readonly type: "reset" };

function resolvedState(
  state: Extract<CrmSearchState, { kind: "loading" }>,
  result: CrmSearchResult,
  collectedAt: number,
): CrmSearchState {
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

export function crmSearchReducer(
  state: CrmSearchState,
  action: CrmSearchAction,
): CrmSearchState {
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
        !state.items.some((item) => item.id === action.id)
      ) {
        return state;
      }
      return {
        ...state,
        excludedIds: toggleExcludedId(state.excludedIds, action.id),
        selectionVersion: state.selectionVersion + 1,
      };
    case "reset":
      return INITIAL_CRM_SEARCH_STATE;
  }
}

export type DealSearchState = CrmSearchState;
export type DealSearchAction = CrmSearchAction;
export const INITIAL_DEAL_SEARCH_STATE = INITIAL_CRM_SEARCH_STATE;
export const dealSearchReducer = crmSearchReducer;
