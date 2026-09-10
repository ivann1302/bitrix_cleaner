import type { Deal } from "./types";

function quoteCell(value: string): string {
  // Spreadsheet importers may ignore leading whitespace and control characters.
  const prefix = value.replace(/^[\s\p{Cc}\p{Cf}]+/u, "");
  const safeValue = /^[=+@-]/.test(prefix) ? `'${value}` : value;
  return `"${safeValue.replaceAll('"', '""')}"`;
}

export function createDealCsv(
  items: readonly Deal[],
  excludedIds: ReadonlySet<string>,
): string {
  const rows = [
    [
      "ID",
      "Сделка",
      "Воронка",
      "Ответственный",
      "Создана (ISO 8601)",
      "Изменена (ISO 8601)",
      "Стадия",
    ],
    ...items
      .filter((deal) => !excludedIds.has(deal.id))
      .map((deal) => [
        deal.id,
        deal.title,
        deal.pipelineName,
        deal.assignedByName,
        deal.createdAt,
        deal.updatedAt,
        deal.stageName,
      ]),
  ];
  return `\uFEFF${rows.map((row) => row.map(quoteCell).join(",")).join("\r\n")}\r\n`;
}
