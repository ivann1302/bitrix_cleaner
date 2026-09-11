import { useEffect, useReducer, useRef } from "react";
import type { BitrixAdapter } from "../data/BitrixAdapter";
import type { CrmSearchCriteria, CrmSearchResult } from "../domain/types";
import { INITIAL_CRM_SEARCH_STATE, crmSearchReducer } from "./searchState";

export function useCrmSearch(adapter: BitrixAdapter) {
  const [state, dispatch] = useReducer(
    crmSearchReducer,
    INITIAL_CRM_SEARCH_STATE,
  );
  const nextRevision = useRef(0);
  const lifecycleRevision = useRef(0);

  useEffect(() => {
    lifecycleRevision.current += 1;
    return () => {
      lifecycleRevision.current += 1;
    };
  }, []);

  async function search(criteria: CrmSearchCriteria): Promise<void> {
    nextRevision.current += 1;
    const revision = nextRevision.current;
    const requestLifecycle = lifecycleRevision.current;
    dispatch({ type: "started", revision, criteria });
    let result: CrmSearchResult;
    try {
      result = await adapter.search(criteria);
      if (
        result.kind === "success" &&
        result.items.some((item) => item.entity !== criteria.entity)
      ) {
        result = { kind: "failure", code: "invalid-adapter-response" };
      }
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

  function reset(): void {
    dispatch({ type: "reset" });
  }

  return { state, search, toggleExcluded, reset } as const;
}

export const useDealSearch = useCrmSearch;
