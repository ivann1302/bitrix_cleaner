import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createDeal, TEST_FILTER_OPTIONS } from "../../test/dealFixtures";
import type { BitrixAdapter } from "../data/BitrixAdapter";
import type { DealSearchCriteria, DealSearchResult } from "../domain/types";
import { useDealSearch } from "./useDealSearch";

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
  dateField: "createdAt",
  beforeDate: "2026-01-31",
  pipelineId: null,
  stageId: null,
  assignedById: null,
};

function adapterWith(searchDeals: BitrixAdapter["searchDeals"]): BitrixAdapter {
  return {
    getDealFilterOptions: () => Promise.resolve(TEST_FILTER_OPTIONS),
    searchDeals,
  };
}

describe("useDealSearch", () => {
  it("не запускает поиск при начальном рендере", () => {
    const searchDeals = vi.fn<BitrixAdapter["searchDeals"]>();
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
