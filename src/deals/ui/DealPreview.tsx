import { useMemo, useState } from "react";
import { getSelectionCounts } from "../domain/selection";
import type { AppContext, CrmFilterOptions, CrmItem } from "../domain/types";
import { ENTITY_COPY } from "../domain/entityCopy";
import type { CrmSearchState } from "../state/searchState";
import type { AppMode } from "../../app/runtime";
import { CriteriaSummary } from "./CriteriaSummary";
import { DealCsvExport } from "./DealCsvExport";
import { getPreviewPageCount, getPreviewPageItems } from "./pagination";

type ReadyState = Extract<CrmSearchState, { kind: "ready" }>;

interface DealPreviewProps {
  readonly state: ReadyState;
  readonly options: CrmFilterOptions;
  readonly context: AppContext;
  readonly mode: AppMode;
  readonly onToggleExcluded: (id: string) => void;
}

function crmCardUrl(
  mode: AppMode,
  context: AppContext,
  item: CrmItem,
): string | null {
  if (mode !== "bitrix-readonly") return null;
  try {
    const portal = new URL(context.portal);
    if (portal.protocol !== "https:" || portal.origin !== context.portal) {
      return null;
    }
    const segment = item.entity === "deal" ? "deal" : "lead";
    return new URL(`/crm/${segment}/details/${item.id}/`, portal).toString();
  } catch {
    return null;
  }
}

export function DealPreview({
  state,
  options,
  context,
  mode,
  onToggleExcluded,
}: DealPreviewProps) {
  const [page, setPage] = useState(1);
  const entity = state.criteria.entity;
  const items = state.items.filter((item) => item.entity === entity);
  const pageCount = getPreviewPageCount(items.length);
  const currentPage = Math.min(page, pageCount);
  const rows = getPreviewPageItems(items, currentPage);
  const counts = getSelectionCounts(items, state.excludedIds);
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: context.timeZone ?? "UTC",
      }),
    [context.timeZone],
  );
  const formatDate = (item: CrmItem, field: "createdAt" | "updatedAt") => {
    const value = new Date(item[field]);
    const displayValue =
      context.timeZone === null
        ? new Date(value.getTime() + context.timeZoneOffsetSeconds * 1000)
        : value;
    return dateFormatter.format(displayValue);
  };
  if (options.entity !== entity) return null;

  return (
    <section className="preview-layout" aria-labelledby="preview-title">
      <div className="table-panel">
        <div className="preview-heading">
          <div>
            <p className="eyebrow">Результат поиска</p>
            <h2 id="preview-title">Проверьте список</h2>
          </div>
          <p>
            Исключите {entity === "deal" ? "сделки" : "лиды"}, которые хотите
            сохранить.
          </p>
        </div>
        <div className="table-scroll">
          <table className="deal-table">
            <thead>
              <tr>
                <th scope="col">В списке</th>
                <th scope="col">{entity === "deal" ? "Сделка" : "Лид"}</th>
                <th scope="col">Ответственный</th>
                <th scope="col">Даты</th>
                <th scope="col">{entity === "deal" ? "Стадия" : "Статус"}</th>
                <th scope="col">Действие</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                const excluded = state.excludedIds.has(item.id);
                const cardUrl = crmCardUrl(mode, context, item);
                return (
                  <tr
                    key={item.id}
                    className={excluded ? "row-excluded" : undefined}
                  >
                    <td>
                      <label className="checkbox-hit-target">
                        <input
                          type="checkbox"
                          checked={!excluded}
                          aria-label={`Включить ${item.title}`}
                          onChange={() => onToggleExcluded(item.id)}
                        />
                      </label>
                    </td>
                    <td>
                      {cardUrl === null ? (
                        <strong>{item.title}</strong>
                      ) : (
                        <a
                          className="deal-link"
                          href={cardUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <strong>{item.title}</strong>
                        </a>
                      )}
                      <span className="deal-id">
                        ID {item.id}
                        {item.entity === "deal"
                          ? ` · ${item.pipelineName}`
                          : ""}
                      </span>
                    </td>
                    <td>{item.assignedByName}</td>
                    <td>
                      <span>
                        {entity === "deal" ? "Создана" : "Создан"}:{" "}
                        {formatDate(item, "createdAt")}
                      </span>
                      <span>
                        {entity === "deal" ? "Изменена" : "Изменен"}:{" "}
                        {formatDate(item, "updatedAt")}
                      </span>
                    </td>
                    <td>{item.statusName}</td>
                    <td>
                      <button
                        className="row-action"
                        type="button"
                        aria-label={`${excluded ? "Вернуть" : "Исключить"} ${item.title}`}
                        onClick={() => onToggleExcluded(item.id)}
                      >
                        {excluded ? "Вернуть" : "Исключить"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <nav className="pagination" aria-label="Страницы результата">
          <button
            type="button"
            className="secondary-button"
            aria-label="Предыдущая страница"
            disabled={currentPage === 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            Предыдущая
          </button>
          <span>
            Страница {currentPage} из {pageCount}
          </span>
          <button
            type="button"
            className="secondary-button"
            aria-label="Следующая страница"
            disabled={currentPage === pageCount}
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
          >
            Следующая
          </button>
        </nav>
      </div>
      <aside className="summary-panel" aria-label="Сводка результата">
        <p className="eyebrow">К проверке</p>
        <strong className="summary-number">{counts.selected}</strong>
        <span>{ENTITY_COPY[entity].many} выбрано</span>
        <dl className="metrics">
          <div role="group" aria-label={`Найдено ${counts.found}`}>
            <dt>Найдено</dt>
            <dd>{counts.found}</dd>
          </div>
          <div role="group" aria-label={`Выбрано ${counts.selected}`}>
            <dt>Выбрано</dt>
            <dd>{counts.selected}</dd>
          </div>
          <div role="group" aria-label={`Исключено ${counts.excluded}`}>
            <dt>Исключено</dt>
            <dd>{counts.excluded}</dd>
          </div>
        </dl>
        <CriteriaSummary
          draft={state.criteria}
          options={options}
          title="Условия сохранённого поиска"
        />
        <DealCsvExport
          entity={entity}
          items={items}
          excludedIds={state.excludedIds}
        />
        <p className="demo-note">
          {mode === "demo"
            ? "Это локальный preview искусственных данных. Запросов к Bitrix24 нет."
            : "Preview получен из Bitrix24 в режиме только для чтения. Никакие данные не изменяются."}
        </p>
      </aside>
    </section>
  );
}
