import type { CrmEntity, CrmItem, Deal } from "./types";

function quoteCell(value: string): string {
  // Spreadsheet importers may ignore leading whitespace and control characters.
  const prefix = value.replace(/^[\s\p{Cc}\p{Cf}]+/u, "");
  const safeValue = /^[=+@-]/.test(prefix) ? `'${value}` : value;
  return `"${safeValue.replaceAll('"', '""')}"`;
}

export function createCrmCsv(
  entity: CrmEntity,
  items: readonly CrmItem[],
  excludedIds: ReadonlySet<string>,
): string {
  if (items.some((item) => item.entity !== entity)) {
    throw new Error("entity-mismatch");
  }
  const selected = items.filter((item) => !excludedIds.has(item.id));
  const rows =
    entity === "deal"
      ? [
          [
            "ID",
            "Сделка",
            "Воронка",
            "Ответственный",
            "Создана (ISO 8601)",
            "Изменена (ISO 8601)",
            "Стадия",
          ],
          ...selected.map((item) => {
            if (item.entity !== "deal") throw new Error("entity-mismatch");
            return [
              item.id,
              item.title,
              item.pipelineName,
              item.assignedByName,
              item.createdAt,
              item.updatedAt,
              item.statusName,
            ];
          }),
        ]
      : [
          [
            "ID",
            "Название",
            "Статус",
            "Ответственный",
            "Дата создания",
            "Дата изменения",
          ],
          ...selected.map((item) => [
            item.id,
            item.title,
            item.statusName,
            item.assignedByName,
            item.createdAt,
            item.updatedAt,
          ]),
        ];
  return `\uFEFF${rows.map((row) => row.map(quoteCell).join(",")).join("\r\n")}\r\n`;
}

export function createDealCsv(
  items: readonly Deal[],
  excludedIds: ReadonlySet<string>,
): string {
  return createCrmCsv("deal", items, excludedIds);
}
