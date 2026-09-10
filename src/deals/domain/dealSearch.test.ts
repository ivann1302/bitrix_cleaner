import { describe, expect, it } from "vitest";
import {
  DEAL_SEARCH_LIMIT,
  criteriaSignature,
  deduplicateDeals,
  isDealSearchOverLimit,
  validateDealSearchDraft,
} from "./dealSearch";
import { createDeal } from "../../test/dealFixtures";

describe("validateDealSearchDraft", () => {
  it("отклоняет фильтр без содержательного ограничения", () => {
    const result = validateDealSearchDraft({
      dateField: "createdAt",
      beforeDate: "",
      pipelineId: "",
      stageId: "",
      assignedById: "",
    });

    expect(result).toEqual({
      ok: false,
      fieldErrors: {},
      formError: "Добавьте хотя бы одно условие поиска.",
    });
  });

  it("отклоняет невозможную календарную дату", () => {
    const result = validateDealSearchDraft({
      dateField: "updatedAt",
      beforeDate: "2026-02-30",
      pipelineId: "",
      stageId: "",
      assignedById: "",
    });

    expect(result).toEqual({
      ok: false,
      fieldErrors: { beforeDate: "Укажите корректную календарную дату." },
    });
  });

  it("нормализует пустые строки в null", () => {
    const result = validateDealSearchDraft({
      dateField: "updatedAt",
      beforeDate: "2026-08-31",
      pipelineId: " ",
      stageId: "",
      assignedById: "",
    });

    expect(result).toEqual({
      ok: true,
      criteria: {
        dateField: "updatedAt",
        beforeDate: "2026-08-31",
        pipelineId: null,
        stageId: null,
        assignedById: null,
      },
    });
  });
});

describe("deal search invariants", () => {
  it("допускает ровно 3 000 и блокирует 3 001", () => {
    expect(DEAL_SEARCH_LIMIT).toBe(3000);
    expect(isDealSearchOverLimit(3000)).toBe(false);
    expect(isDealSearchOverLimit(3001)).toBe(true);
  });

  it("оставляет первую сделку каждого ID", () => {
    const first = createDeal({ id: "7", title: "Первая" });
    const duplicate = createDeal({ id: "7", title: "Дубликат" });
    const second = createDeal({ id: "8", title: "Вторая" });

    expect(deduplicateDeals([first, duplicate, second])).toEqual([
      first,
      second,
    ]);
  });

  it("создаёт подпись критериев без коллизий от разделителя", () => {
    expect(
      criteriaSignature({
        dateField: "createdAt",
        beforeDate: "2026-08-31",
        pipelineId: "main|archive",
        stageId: null,
        assignedById: null,
      }),
    ).toBe('["createdAt","2026-08-31","main|archive",null,null]');
  });
});
