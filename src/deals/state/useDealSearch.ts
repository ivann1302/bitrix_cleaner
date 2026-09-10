import { useEffect, useReducer, useRef } from "react";
import type { BitrixAdapter } from "../data/BitrixAdapter";
import type { DealSearchCriteria, DealSearchResult } from "../domain/types";
import { INITIAL_DEAL_SEARCH_STATE, dealSearchReducer } from "./searchState";

export function useDealSearch(adapter: BitrixAdapter) {
  const [state, dispatch] = useReducer(
    dealSearchReducer,
    INITIAL_DEAL_SEARCH_STATE,
  );
  const nextRevision = useRef(0);
  const lifecycleRevision = useRef(0);

  useEffect(() => {
    lifecycleRevision.current += 1;
    return () => {
      lifecycleRevision.current += 1;
    };
  }, []);

  async function search(criteria: DealSearchCriteria): Promise<void> {
    nextRevision.current += 1;
    const revision = nextRevision.current;
    const requestLifecycle = lifecycleRevision.current;
    dispatch({ type: "started", revision, criteria });

    let result: DealSearchResult;
    try {
      result = await adapter.searchDeals(criteria);
    } catch {
      result = { kind: "failure", code: "unexpected" };
    }

    if (requestLifecycle === lifecycleRevision.current) {
      dispatch({ type: "resolved", revision, result, collectedAt: Date.now() });
    }
  }

  function toggleExcluded(id: string): void {
    dispatch({ type: "toggle-excluded", id });
  }

  return { state, search, toggleExcluded } as const;
}
