import { describe, expect, it } from "vitest";
import { createDeal } from "../../test/dealFixtures";
import type { DealSearchCriteria } from "../domain/types";
import { INITIAL_DEAL_SEARCH_STATE, dealSearchReducer } from "./searchState";

const criteria: DealSearchCriteria = {
  dateField: "createdAt",
  beforeDate: "2026-01-31",
  pipelineId: null,
  stageId: null,
  assignedById: null,
};

function readyState() {
  return dealSearchReducer(
    dealSearchReducer(INITIAL_DEAL_SEARCH_STATE, {
      type: "started",
      revision: 1,
      criteria,
    }),
    {
      type: "resolved",
      collectedAt: 1000,
      revision: 1,
      result: { kind: "success", items: [createDeal({ id: "5" })] },
    },
  );
}

describe("dealSearchReducer", () => {
  it("переходит initial → loading → ready", () => {
    const loading = dealSearchReducer(INITIAL_DEAL_SEARCH_STATE, {
      type: "started",
      revision: 1,
      criteria,
    });
    const ready = dealSearchReducer(loading, {
      type: "resolved",
      collectedAt: 1000,
      revision: 1,
      result: { kind: "success", items: [createDeal()] },
    });

    expect(loading).toMatchObject({ kind: "loading", revision: 1 });
    expect(ready).toMatchObject({ kind: "ready", revision: 1 });
    expect(ready).toMatchObject({ collectedAt: 1000, selectionVersion: 0 });
  });

  it("игнорирует результат старой ревизии", () => {
    const first = dealSearchReducer(INITIAL_DEAL_SEARCH_STATE, {
      type: "started",
      revision: 1,
      criteria,
    });
    const second = dealSearchReducer(first, {
      type: "started",
      revision: 2,
      criteria: { ...criteria, beforeDate: "2026-02-28" },
    });
    const staleResolution = dealSearchReducer(second, {
      type: "resolved",
      collectedAt: 1000,
      revision: 1,
      result: { kind: "success", items: [createDeal({ id: "old" })] },
    });

    expect(staleResolution).toBe(second);
  });

  it("исключает и возвращает существующую строку неизменяемо", () => {
    const ready = readyState();
    const excluded = dealSearchReducer(ready, {
      type: "toggle-excluded",
      id: "5",
    });
    const restored = dealSearchReducer(excluded, {
      type: "toggle-excluded",
      id: "5",
    });

    expect(ready.kind === "ready" && ready.excludedIds.has("5")).toBe(false);
    expect(excluded).not.toBe(ready);
    expect(excluded.kind === "ready" && excluded.excludedIds.has("5")).toBe(
      true,
    );
    expect(restored.kind === "ready" && restored.excludedIds.has("5")).toBe(
      false,
    );
    expect(restored).toMatchObject({ collectedAt: 1000, selectionVersion: 2 });
  });

  it("игнорирует исключение ID вне текущего результата", () => {
    const ready = readyState();

    expect(
      dealSearchReducer(ready, { type: "toggle-excluded", id: "unknown" }),
    ).toBe(ready);
  });
});
