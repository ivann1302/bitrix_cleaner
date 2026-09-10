import { describe, expect, it } from "vitest";
import { createDeal } from "../../test/dealFixtures";
import { MockBitrixAdapter } from "./MockBitrixAdapter";
import { MOCK_CONTEXT } from "./mockContext";

const criteria = {
  dateField: "createdAt" as const,
  beforeDate: "2026-01-31",
  pipelineId: null,
  stageId: null,
  assignedById: null,
};

describe("mock deletion", () => {
  it("removes only the specified existing ID and never reports absent IDs as deleted", async () => {
    const adapter = new MockBitrixAdapter({
      deals: [createDeal(), createDeal({ id: "2" })],
    });
    expect(await adapter.deleteDeal("1", MOCK_CONTEXT)).toEqual({
      kind: "deleted",
    });
    expect(await adapter.deleteDeal("1", MOCK_CONTEXT)).toMatchObject({
      kind: "error",
      temporary: false,
    });
    expect(await adapter.searchDeals(criteria)).toMatchObject({
      kind: "success",
      items: [{ id: "2" }],
    });
  });

  it("rejects non-demo contexts and non-admin callers without changing records", async () => {
    const adapter = new MockBitrixAdapter({ deals: [createDeal()] });
    expect(
      await adapter.deleteDeal("1", { ...MOCK_CONTEXT, portal: "other.local" }),
    ).toMatchObject({ kind: "error" });
    expect(
      await adapter.deleteDeal("1", { ...MOCK_CONTEXT, isAdmin: false }),
    ).toMatchObject({ kind: "error" });
    expect(await adapter.searchDeals(criteria)).toMatchObject({
      kind: "success",
      items: [{ id: "1" }],
    });
  });
});
