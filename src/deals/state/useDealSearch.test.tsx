import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  createDeal,
  createLead,
  TEST_FILTER_OPTIONS,
} from "../../test/dealFixtures";
import type { BitrixAdapter } from "../data/BitrixAdapter";
import type {
  CrmSearchResult,
  DealSearchCriteria,
  DealSearchResult,
} from "../domain/types";
import { useCrmSearch, useDealSearch } from "./useDealSearch";

function deferred<T>() {
  let settle: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      if (settle === undefined)
        throw new Error("Deferred promise is not initialized");
      settle(value);
    },
  };
}

const firstCriteria: DealSearchCriteria = {
  entity: "deal",
  dateField: "createdAt",
  beforeDate: "2026-01-31",
  pipelineId: null,
  stageId: null,
  assignedById: null,
};

function adapterWith(search: BitrixAdapter["search"]): BitrixAdapter {
  return {
    supportedEntities: ["deal"],
    getFilterOptions: () => Promise.resolve(TEST_FILTER_OPTIONS),
    search,
  };
}

describe("useDealSearch", () => {
  it("rejects items returned for another CRM entity", async () => {
    const { result } = renderHook(() =>
      useCrmSearch(
        adapterWith(() =>
          Promise.resolve({ kind: "success", items: [createLead()] }),
        ),
      ),
    );

    await act(async () => {
      await result.current.search(firstCriteria);
    });

    expect(result.current.state).toMatchObject({
      kind: "failure",
      code: "invalid-adapter-response",
    });
  });

  it("не принимает старый ответ лида после нового поиска сделок", async () => {
    const lead = deferred<CrmSearchResult>();
    const deal = deferred<CrmSearchResult>();
    let call = 0;
    const adapter: BitrixAdapter = {
      supportedEntities: ["deal"],
      getFilterOptions: () => Promise.resolve(TEST_FILTER_OPTIONS),
      search: () => {
        call += 1;
        return call === 1 ? lead.promise : deal.promise;
      },
    };
    const { result } = renderHook(() => useCrmSearch(adapter));
    const leadRun = result.current.search({
      entity: "lead",
      dateField: "createdAt",
      beforeDate: "2026-01-31",
      statusId: "JUNK",
      assignedById: null,
    });
    const dealRun = result.current.search({ ...firstCriteria, entity: "deal" });

    await act(async () => {
      deal.resolve({ kind: "success", items: [createDeal({ id: "new" })] });
      await dealRun;
    });
    await act(async () => {
      lead.resolve({ kind: "empty" });
      await leadRun;
    });

    expect(result.current.state).toMatchObject({
      kind: "ready",
      revision: 2,
      criteria: { entity: "deal" },
      items: [expect.objectContaining({ id: "new" })],
    });
  });

  it("не запускает поиск при начальном рендере", () => {
    const searchDeals = vi.fn<BitrixAdapter["search"]>();
    const { result } = renderHook(() =>
      useDealSearch(adapterWith(searchDeals)),
    );

    expect(searchDeals).not.toHaveBeenCalled();
    expect(result.current.state).toEqual({ kind: "initial", revision: 0 });
  });

  it("не позволяет первому ответу заменить второй", async () => {
    const first = deferred<DealSearchResult>();
    const second = deferred<DealSearchResult>();
    let call = 0;
    const adapter = adapterWith(() => {
      call += 1;
      return call === 1 ? first.promise : second.promise;
    });
    const { result } = renderHook(() => useDealSearch(adapter));

    const firstRun = result.current.search(firstCriteria);
    const secondRun = result.current.search({
      ...firstCriteria,
      beforeDate: "2026-02-28",
    });

    await act(async () => {
      second.resolve({ kind: "success", items: [createDeal({ id: "new" })] });
      await secondRun;
    });
    await act(async () => {
      first.resolve({ kind: "success", items: [createDeal({ id: "old" })] });
      await firstRun;
    });

    expect(result.current.state).toMatchObject({
      kind: "ready",
      revision: 2,
      items: [expect.objectContaining({ id: "new" })],
    });
  });

  it("превращает отклонение адаптера в unexpected failure", async () => {
    const adapter = adapterWith(() => Promise.reject(new Error("offline")));
    const { result } = renderHook(() => useDealSearch(adapter));

    await act(async () => {
      await result.current.search(firstCriteria);
    });

    expect(result.current.state).toMatchObject({
      kind: "failure",
      revision: 1,
      code: "unexpected",
    });
  });

  it("не принимает результат после размонтирования", async () => {
    const pending = deferred<DealSearchResult>();
    const { result, unmount } = renderHook(() =>
      useDealSearch(adapterWith(() => pending.promise)),
    );
    let search: Promise<void> | undefined;
    act(() => {
      search = result.current.search(firstCriteria);
    });
    if (search === undefined) throw new Error("Search did not start");
    unmount();

    await act(async () => {
      pending.resolve({ kind: "success", items: [createDeal()] });
      await search;
    });

    expect(result.current.state).toMatchObject({
      kind: "loading",
      revision: 1,
    });
  });
});
