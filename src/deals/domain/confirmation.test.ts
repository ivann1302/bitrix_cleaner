import { describe, expect, it } from "vitest";
import { createDeal } from "../../test/dealFixtures";
import {
  createSelectionSnapshot,
  isSelectionCurrent,
  type SelectionSnapshot,
} from "./confirmation";
import type { DealSearchCriteria } from "./types";

const now = 1_000_000;
const criteria: DealSearchCriteria = {
  dateField: "createdAt",
  beforeDate: "2026-01-01",
  pipelineId: null,
  stageId: null,
  assignedById: null,
};
function input() {
  return {
    context: {
      portal: "mock.example",
      userId: "1",
      entity: "deal" as const,
      isAdmin: true,
    },
    revision: 1,
    selectionVersion: 0,
    criteria: { ...criteria },
    items: [createDeal(), createDeal({ id: "2" })],
    excludedIds: new Set<string>(),
    collectedAt: now,
  };
}
function snapshot(): SelectionSnapshot {
  const result = createSelectionSnapshot(input(), now);
  if (!result) throw new Error("Expected valid fixture");
  return result;
}

describe("createSelectionSnapshot", () => {
  it("fixes exactly the selected IDs after exclusions", () => {
    expect(
      createSelectionSnapshot(
        { ...input(), excludedIds: new Set(["2", "999"]) },
        now,
      )?.ids,
    ).toEqual(["1"]);
  });
  it("copies and freezes every mutable selection component", () => {
    const source = input();
    const result = createSelectionSnapshot(source, now);
    source.context.portal = "other.example";
    source.criteria.beforeDate = "2025-01-01";
    source.items.push(createDeal({ id: "3" }));
    source.excludedIds.add("1");
    expect(result?.context.portal).toBe("mock.example");
    expect(result?.criteria.beforeDate).toBe("2026-01-01");
    expect(result?.ids).toEqual(["1", "2"]);
    for (const value of [
      result,
      result?.context,
      result?.criteria,
      result?.ids,
    ])
      expect(Object.isFrozen(value)).toBe(true);
  });
  it.each([0, -1, 1.5, NaN, Infinity])(
    "rejects invalid revision %s",
    (revision) => {
      expect(createSelectionSnapshot({ ...input(), revision }, now)).toBeNull();
    },
  );
  it.each([-1, 0.5, NaN, Infinity])(
    "rejects invalid selection version %s",
    (selectionVersion) => {
      expect(
        createSelectionSnapshot({ ...input(), selectionVersion }, now),
      ).toBeNull();
    },
  );
  it.each([{ isAdmin: false }, { portal: " " }, { userId: "" }])(
    "requires administrator and complete context %o",
    (context) => {
      const source = input();
      expect(
        createSelectionSnapshot(
          { ...source, context: { ...source.context, ...context } },
          now,
        ),
      ).toBeNull();
    },
  );
  it("rejects empty and malformed filters", () => {
    for (const beforeDate of [null, "2026-02-30"])
      expect(
        createSelectionSnapshot(
          { ...input(), criteria: { ...criteria, beforeDate } },
          now,
        ),
      ).toBeNull();
  });
  it("rejects empty collection and fully excluded collection", () => {
    expect(createSelectionSnapshot({ ...input(), items: [] }, now)).toBeNull();
    expect(
      createSelectionSnapshot(
        { ...input(), excludedIds: new Set(["1", "2"]) },
        now,
      ),
    ).toBeNull();
  });
  it("allows 3000 but rejects 3001 even after exclusions", () => {
    const items = Array.from({ length: 3000 }, (_, index) =>
      createDeal({ id: String(index + 1) }),
    );
    expect(
      createSelectionSnapshot({ ...input(), items }, now)?.ids,
    ).toHaveLength(3000);
    items.push(createDeal({ id: "3001" }));
    expect(
      createSelectionSnapshot(
        { ...input(), items, excludedIds: new Set(["3001"]) },
        now,
      ),
    ).toBeNull();
  });
  it.each(["1", "", " ", "0", "01", "-1", "1.5", "abc"])(
    "rejects duplicate or invalid ID %s even if excluded",
    (id) => {
      expect(
        createSelectionSnapshot(
          {
            ...input(),
            items: [createDeal(), createDeal({ id })],
            excludedIds: new Set([id]),
          },
          now,
        ),
      ).toBeNull();
    },
  );
  it.each([now + 1, now - 600_000, NaN, Infinity])(
    "rejects invalid or expired collection time %s",
    (collectedAt) => {
      expect(
        createSelectionSnapshot({ ...input(), collectedAt }, now),
      ).toBeNull();
    },
  );
  it("accepts preview immediately before expiration", () => {
    expect(
      createSelectionSnapshot({ ...input(), collectedAt: now - 599_999 }, now),
    ).not.toBeNull();
  });
  it.each([NaN, Infinity])("rejects invalid current clock %s", (clock) => {
    expect(createSelectionSnapshot(input(), clock)).toBeNull();
  });
});

describe("isSelectionCurrent", () => {
  it("accepts identical selection with reordered IDs", () => {
    const original = snapshot();
    expect(
      isSelectionCurrent(original, { ...original, ids: ["2", "1"] }, now),
    ).toBe(true);
  });
  it.each([
    { revision: 2 },
    { selectionVersion: 2 },
    { collectedAt: now - 1 },
    { ids: ["1"] },
    { ids: ["1", "3"] },
    { ids: ["1", "1"] },
  ])("invalidates changed selection %o", (change) => {
    const original = snapshot();
    expect(isSelectionCurrent(original, { ...original, ...change }, now)).toBe(
      false,
    );
  });
  it("invalidates a filter or exclusion changed and reverted using its version", () => {
    const original = snapshot();
    expect(
      isSelectionCurrent(original, { ...original, selectionVersion: 2 }, now),
    ).toBe(false);
  });
  it.each([{ portal: "other.example" }, { userId: "2" }, { isAdmin: false }])(
    "invalidates context change %o",
    (change) => {
      const original = snapshot();
      expect(
        isSelectionCurrent(
          original,
          { ...original, context: { ...original.context, ...change } },
          now,
        ),
      ).toBe(false);
    },
  );
  it("invalidates changed criteria", () => {
    const original = snapshot();
    expect(
      isSelectionCurrent(
        original,
        { ...original, criteria: { ...criteria, dateField: "updatedAt" } },
        now,
      ),
    ).toBe(false);
  });
  it.each([now - 1, now + 600_000, NaN, Infinity])(
    "rejects expiry and invalid current clocks %s",
    (clock) => {
      const original = snapshot();
      expect(isSelectionCurrent(original, original, clock)).toBe(false);
    },
  );
});
