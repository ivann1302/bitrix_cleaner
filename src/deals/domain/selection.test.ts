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

  it("выбирает и считает лиды по исключённым ID", () => {
    const leads = [
      {
        entity: "lead" as const,
        id: "lead-1",
        title: "Неактуальный лид",
        statusId: "JUNK",
        statusName: "Некачественный",
        assignedById: "10",
        assignedByName: "Анна Смирнова",
        createdAt: "2026-01-10T09:00:00.000Z",
        updatedAt: "2026-01-20T09:00:00.000Z",
      },
      {
        entity: "lead" as const,
        id: "lead-2",
        title: "Закрытый лид",
        statusId: "JUNK",
        statusName: "Некачественный",
        assignedById: "20",
        assignedByName: "Михаил Волков",
        createdAt: "2026-01-11T09:00:00.000Z",
        updatedAt: "2026-01-21T09:00:00.000Z",
      },
    ];
    const excludedIds = toggleExcludedId(new Set<string>(), "lead-2");

    expect(getSelectedDealIds(leads, excludedIds)).toEqual(["lead-1"]);
    expect(getSelectionCounts(leads, excludedIds)).toEqual({
      found: 2,
      selected: 1,
      excluded: 1,
    });
  });
});
