import { afterEach, describe, expect, it, vi } from "vitest";
import { createDeal } from "../../test/dealFixtures";
import type { Deal, DealSearchCriteria } from "../domain/types";
import { MockBitrixAdapter } from "./MockBitrixAdapter";
import { MOCK_FILTER_OPTIONS } from "./mockDeals";

const baseCriteria: DealSearchCriteria = {
  dateField: "createdAt",
  beforeDate: "2026-01-31",
  pipelineId: null,
  stageId: null,
  assignedById: null,
};

function createDeals(count: number): readonly Deal[] {
  return Array.from({ length: count }, (_, index) =>
    createDeal({ id: String(index + 1) }),
  );
}

describe("MockBitrixAdapter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns only lost stages in filter options", async () => {
    const adapter = new MockBitrixAdapter();

    await expect(adapter.getDealFilterOptions()).resolves.toEqual({
      ...MOCK_FILTER_OPTIONS,
      stages: MOCK_FILTER_OPTIONS.stages.filter((stage) => stage.isLost),
    });
  });

  it("uses the inclusive UTC+3 end-of-day boundary", async () => {
    const adapter = new MockBitrixAdapter({
      deals: [
        createDeal({ id: "before", createdAt: "2026-01-31T20:59:59.999Z" }),
        createDeal({ id: "after", createdAt: "2026-01-31T21:00:00.000Z" }),
      ],
    });

    await expect(adapter.searchDeals(baseCriteria)).resolves.toEqual({
      kind: "success",
      items: [expect.objectContaining({ id: "before" })],
    });
  });

  it("uses the selected date field, instead of the other date", async () => {
    const adapter = new MockBitrixAdapter({
      deals: [
        createDeal({
          id: "created-match",
          createdAt: "2026-01-10T09:00:00.000Z",
          updatedAt: "2026-02-10T09:00:00.000Z",
        }),
        createDeal({
          id: "updated-match",
          createdAt: "2026-02-10T09:00:00.000Z",
          updatedAt: "2026-01-10T09:00:00.000Z",
        }),
      ],
    });

    await expect(
      adapter.searchDeals({ ...baseCriteria, dateField: "updatedAt" }),
    ).resolves.toEqual({
      kind: "success",
      items: [expect.objectContaining({ id: "updated-match" })],
    });
  });

  it("applies pipeline, stage, assignee, and lost-stage filtering", async () => {
    const adapter = new MockBitrixAdapter({
      deals: [
        createDeal({ id: "match" }),
        createDeal({ id: "assignee", assignedById: "20" }),
        createDeal({ id: "stage", stageId: "main-active" }),
        createDeal({
          id: "pipeline",
          pipelineId: "repeat",
          stageId: "repeat-lost",
        }),
      ],
    });

    await expect(
      adapter.searchDeals({
        ...baseCriteria,
        pipelineId: "main",
        stageId: "main-lost",
        assignedById: "10",
      }),
    ).resolves.toEqual({
      kind: "success",
      items: [expect.objectContaining({ id: "match" })],
    });
  });

  it("deduplicates before evaluating the limit", async () => {
    const uniqueDeals = createDeals(3000);
    const firstDuplicate = createDeal({ id: "1", title: "duplicate" });
    const adapter = new MockBitrixAdapter({
      deals: [firstDuplicate, ...uniqueDeals],
    });

    await expect(adapter.searchDeals(baseCriteria)).resolves.toEqual({
      kind: "success",
      items: [firstDuplicate, ...uniqueDeals.slice(1)],
    });
  });

  it.each([
    [0, { kind: "empty" }],
    [1, { kind: "success", items: createDeals(1) }],
    [3000, { kind: "success", items: createDeals(3000) }],
    [3001, { kind: "over-limit", matchedAtLeast: 3001 }],
  ] as const)(
    "returns the correct result for %i matching deals",
    async (count, expected) => {
      const adapter = new MockBitrixAdapter({ deals: createDeals(count) });

      await expect(adapter.searchDeals(baseCriteria)).resolves.toEqual(
        expected,
      );
    },
  );

  it("returns a configured failure after a controllable delay", async () => {
    vi.useFakeTimers();
    const delayMs = vi.fn(() => 25);
    const adapter = new MockBitrixAdapter({
      behavior: { delayMs, failureCode: "mock-unavailable" },
    });

    const search = adapter.searchDeals(baseCriteria);
    await vi.advanceTimersByTimeAsync(24);
    await expect(
      Promise.race([search, Promise.resolve("pending")]),
    ).resolves.toBe("pending");
    await vi.advanceTimersByTimeAsync(1);
    await expect(search).resolves.toEqual({
      kind: "failure",
      code: "mock-unavailable",
    });
    expect(delayMs).toHaveBeenCalledWith(baseCriteria);
  });
});
