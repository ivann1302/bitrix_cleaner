import { describe, expect, it } from "vitest";
import { createDeal } from "../../test/dealFixtures";
import { MockBitrixAdapter } from "./MockBitrixAdapter";
import { MOCK_CONTEXT } from "./mockContext";

const criteria = {
  entity: "deal" as const,
  dateField: "createdAt" as const,
  beforeDate: "2026-01-31",
  pipelineId: null,
  stageId: null,
  assignedById: null,
};

describe("mock deletion", () => {
  it("isolates identical lead and deal IDs and rejects IDs belonging only to the other entity", async () => {
    const leadContext = { ...MOCK_CONTEXT, entity: "lead" as const };
    const leadCriteria = {
      entity: "lead" as const,
      dateField: "createdAt" as const,
      beforeDate: "2026-01-31",
      statusId: null,
      assignedById: null,
    };
    const lead = {
      ...createDeal(),
      entity: "lead" as const,
      statusId: "JUNK",
      statusName: "Некачественный лид",
    };
    const adapter = new MockBitrixAdapter({
      deals: [createDeal()],
      leads: [lead, { ...lead, id: "41" }],
    });
    expect(await adapter.deleteItem("41", MOCK_CONTEXT)).toEqual({
      kind: "error",
      code: "not-found",
      temporary: false,
    });
    expect(await adapter.deleteItem("1", leadContext)).toEqual({
      kind: "deleted",
    });
    expect(await adapter.search(leadCriteria)).toMatchObject({
      kind: "success",
      items: [{ id: "41", entity: "lead" }],
    });
    expect(await adapter.searchDeals(criteria)).toMatchObject({
      kind: "success",
      items: [{ id: "1", entity: "deal" }],
    });
    expect(await adapter.deleteItem("1", MOCK_CONTEXT)).toEqual({
      kind: "deleted",
    });
    expect(await adapter.deleteItem("1", leadContext)).toEqual({
      kind: "error",
      code: "not-found",
      temporary: false,
    });
  });

  it("removes only the specified existing ID and never reports absent IDs as deleted", async () => {
    const adapter = new MockBitrixAdapter({
      deals: [createDeal(), createDeal({ id: "2" })],
    });
    expect(await adapter.deleteItem("1", MOCK_CONTEXT)).toEqual({
      kind: "deleted",
    });
    expect(await adapter.deleteItem("1", MOCK_CONTEXT)).toMatchObject({
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
      await adapter.deleteItem("1", { ...MOCK_CONTEXT, portal: "other.local" }),
    ).toMatchObject({ kind: "error" });
    expect(
      await adapter.deleteItem("1", { ...MOCK_CONTEXT, isAdmin: false }),
    ).toMatchObject({ kind: "error" });
    expect(await adapter.searchDeals(criteria)).toMatchObject({
      kind: "success",
      items: [{ id: "1" }],
    });
  });
});
