import { describe, expect, it } from "vitest";
import { createDeal } from "../../test/dealFixtures";
import { createDealCsv } from "./dealCsv";

describe("createDealCsv", () => {
  it("exports selected preview fields with BOM, quotes and CRLF", () => {
    expect(createDealCsv([createDeal()], new Set())).toBe(
      '\uFEFF"ID","Сделка","Воронка","Ответственный","Создана (ISO 8601)","Изменена (ISO 8601)","Стадия"\r\n' +
        '"1","Тестовая сделка","Основная","Анна Смирнова","2026-01-10T09:00:00.000Z","2026-01-20T09:00:00.000Z","Проиграна"\r\n',
    );
  });

  it("exports all pages and excludes only matching IDs without mutating input", () => {
    const items = Array.from({ length: 51 }, (_, i) =>
      createDeal({ id: String(i + 1) }),
    );
    const csv = createDealCsv(items, new Set(["1", "26", "absent"]));
    expect(csv.split("\r\n")).toHaveLength(51);
    expect(csv).not.toContain('\r\n"1",');
    expect(csv).not.toContain('\r\n"26",');
    expect(csv).toContain('\r\n"51",');
    expect(items).toHaveLength(51);
  });

  it("escapes quotes, delimiters and multiline Cyrillic text", () => {
    const csv = createDealCsv(
      [createDeal({ title: 'Привет, "мир"\r\nНовая строка' })],
      new Set(),
    );
    expect(csv).toContain('"Привет, ""мир""\r\nНовая строка"');
  });

  it.each([
    "=1+1",
    "+cmd",
    "-1+1",
    "@SUM(A1)",
    "  =1",
    "\t+1",
    "\r\n@1",
    "\u0000=1",
    "\uFEFF=1",
  ])("neutralizes formula prefix %j", (value) => {
    const csv = createDealCsv(
      [
        createDeal({
          id: value,
          title: value,
          pipelineName: value,
          assignedByName: value,
          createdAt: value,
          updatedAt: value,
          stageName: value,
        }),
      ],
      new Set(),
    );
    expect(csv).toContain(
      Array.from({ length: 7 }, () => `"'${value}"`).join(","),
    );
  });

  it("returns only headers for an empty selection", () => {
    expect(
      createDealCsv([createDeal()], new Set(["1"])).split("\r\n"),
    ).toHaveLength(2);
  });
});
