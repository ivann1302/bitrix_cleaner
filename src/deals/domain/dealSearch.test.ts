import { describe, expect, it } from "vitest";
import {
  createInitialDraft,
  DEAL_SEARCH_LIMIT,
  criteriaSignature,
  deduplicateDeals,
  isDealSearchOverLimit,
  validateCrmSearchDraft,
  validateDealSearchDraft,
} from "./dealSearch";
import { createDeal } from "../../test/dealFixtures";
import type { LeadSearchDraft } from "./types";

describe("validateDealSearchDraft", () => {
  it("отклоняет фильтр без содержательного ограничения", () => {
    const result = validateDealSearchDraft({
      entity: "deal",
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
      entity: "deal",
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
      entity: "deal",
      dateField: "updatedAt",
      beforeDate: "2026-08-31",
      pipelineId: " ",
      stageId: "",
      assignedById: "",
    });

    expect(result).toEqual({
      ok: true,
      criteria: {
        entity: "deal",
        dateField: "updatedAt",
        beforeDate: "2026-08-31",
        pipelineId: null,
        stageId: null,
        assignedById: null,
      },
    });
  });
});

describe("validateCrmSearchDraft", () => {
  it("принимает лид без воронки", () => {
    const leadDraft: LeadSearchDraft = {
      entity: "lead",
      dateField: "createdAt",
      beforeDate: "2026-09-01",
      statusId: "JUNK",
      assignedById: "",
    };

    expect(validateCrmSearchDraft(leadDraft)).toEqual({
      ok: true,
      criteria: {
        entity: "lead",
        dateField: "createdAt",
        beforeDate: "2026-09-01",
        statusId: "JUNK",
        assignedById: null,
      },
    });
  });

  it("отклоняет пустой поиск лидов", () => {
    expect(validateCrmSearchDraft(createInitialDraft("lead"))).toMatchObject({
      ok: false,
      formError: "Добавьте хотя бы одно условие поиска.",
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
        entity: "deal",
        dateField: "createdAt",
        beforeDate: "2026-08-31",
        pipelineId: "main|archive",
        stageId: null,
        assignedById: null,
      }),
    ).toBe('["deal","createdAt","2026-08-31","main|archive",null,null]');
  });

  it("различает одинаковые условия сделок и лидов", () => {
    expect(
      criteriaSignature({
        entity: "deal",
        dateField: "createdAt",
        beforeDate: "2026-08-31",
        pipelineId: "main",
        stageId: "LOSE",
        assignedById: "10",
      }),
    ).not.toBe(
      criteriaSignature({
        entity: "lead",
        dateField: "createdAt",
        beforeDate: "2026-08-31",
        statusId: "LOSE",
        assignedById: "10",
      }),
    );
  });
});
