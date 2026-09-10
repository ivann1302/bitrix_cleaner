import { describe, expect, it } from "vitest";
import { createDeal } from "../../test/dealFixtures";
import {
  getSelectedDealIds,
  getSelectionCounts,
  toggleExcludedId,
} from "./selection";

describe("preview selection", () => {
  const deals = [createDeal({ id: "1" }), createDeal({ id: "2" })];

  it("исключает ID из выбранного набора и считает весь результат", () => {
    const excludedIds = toggleExcludedId(new Set<string>(), "2");

    expect(getSelectedDealIds(deals, excludedIds)).toEqual(["1"]);
    expect(getSelectionCounts(deals, excludedIds)).toEqual({
      found: 2,
      selected: 1,
      excluded: 1,
    });
  });

  it("повторное действие возвращает ID", () => {
    const excluded = toggleExcludedId(new Set<string>(), "2");
    const restored = toggleExcludedId(excluded, "2");

    expect([...restored]).toEqual([]);
  });
});
