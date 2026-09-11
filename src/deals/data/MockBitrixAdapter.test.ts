import { afterEach, describe, expect, it, vi } from "vitest";
import { createDeal } from "../../test/dealFixtures";
import type {
  Deal,
  DealSearchCriteria,
  Lead,
  LeadSearchCriteria,
} from "../domain/types";
import { MockBitrixAdapter } from "./MockBitrixAdapter";
import { MOCK_FILTER_OPTIONS } from "./mockDeals";

const baseCriteria: DealSearchCriteria = {
  entity: "deal",
  dateField: "createdAt",
  beforeDate: "2026-01-31",
  pipelineId: null,
  stageId: null,
  assignedById: null,
};

const leadCriteria: LeadSearchCriteria = {
  entity: "lead",
  dateField: "createdAt",
  beforeDate: "2026-01-31",
  statusId: null,
  assignedById: null,
};
function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    entity: "lead",
    id: "41",
    title: "Неуспешный лид",
    statusId: "JUNK",
    statusName: "Некачественный лид",
    assignedById: "10",
    assignedByName: "Анна Смирнова",
    createdAt: "2026-01-10T09:00:00.000Z",
    updatedAt: "2026-02-01T09:00:00.000Z",
    ...overrides,
  };
}

function createDeals(count: number): readonly Deal[] {
  return Array.from({ length: count }, (_, index) =>
    createDeal({ id: String(index + 1) }),
  );
}

describe("MockBitrixAdapter", () => {
  it("searches only failed leads with entity-specific filter options", async () => {
    const adapter = new MockBitrixAdapter({
      leads: [
        lead(),
        lead({ id: "42", statusId: "CONVERTED" }),
        lead({ id: "43", statusId: "NEW" }),
      ],
    });
    expect(adapter.supportedEntities).toEqual(["deal", "lead"]);
    expect(await adapter.getFilterOptions("lead")).toMatchObject({
      entity: "lead",
      statuses: [
        { id: "JUNK", isFailed: true },
        { id: "CANNOT_CONTACT", isFailed: true },
      ],
    });
    expect(await adapter.search(leadCriteria)).toEqual({
      kind: "success",
      items: [lead()],
    });
    expect(
      await adapter.search({ ...leadCriteria, statusId: "CONVERTED" }),
    ).toEqual({ kind: "empty" });
  });

  it("filters lead status, assignee and selected date with inclusive UTC+3 boundary", async () => {
    const matching = lead({ updatedAt: "2026-01-31T20:59:59.999Z" });
    const adapter = new MockBitrixAdapter({
      leads: [
        matching,
        lead({ id: "42", statusId: "CANNOT_CONTACT" }),
        lead({ id: "43", assignedById: "20" }),
        lead({ id: "44", updatedAt: "2026-01-31T21:00:00.000Z" }),
      ],
    });
    expect(
      await adapter.search({
        ...leadCriteria,
        dateField: "updatedAt",
        statusId: "JUNK",
        assignedById: "10",
      }),
    ).toEqual({ kind: "success", items: [matching] });
  });

  it("deduplicates leads and enforces the complete collection limit", async () => {
    const items = Array.from({ length: 3000 }, (_, i) =>
      lead({ id: String(i + 1) }),
    );
    expect(
      await new MockBitrixAdapter({
        leads: [...items, lead({ id: "1" })],
      }).search(leadCriteria),
    ).toMatchObject({ kind: "success", items });
    expect(
      await new MockBitrixAdapter({
        leads: [...items, lead({ id: "3001" })],
      }).search(leadCriteria),
    ).toEqual({ kind: "over-limit", matchedAtLeast: 3001 });
  });

  it("provides deterministic lead demo data sufficient for pagination", async () => {
    const result = await new MockBitrixAdapter().search({
      ...leadCriteria,
      beforeDate: "2026-12-31",
    });
    expect(result.kind).toBe("success");
    if (result.kind !== "success") throw new Error("Expected demo leads");
    expect(result.items.length).toBeGreaterThan(25);
    expect(result.items.every((item) => item.entity === "lead")).toBe(true);
  });

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
        createDeal({ id: "stage", statusId: "main-active" }),
        createDeal({
          id: "pipeline",
          pipelineId: "repeat",
          statusId: "repeat-lost",
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
