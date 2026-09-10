import { useMemo, useState } from "react";
import { getSelectionCounts } from "../domain/selection";
import type {
  AppContext,
  Deal,
  DealFilterOptions,
  DealSearchCriteria,
} from "../domain/types";
import type { DealSearchState } from "../state/searchState";
import type { AppMode } from "../../app/runtime";
import { CriteriaSummary } from "./CriteriaSummary";
import { DealCsvExport } from "./DealCsvExport";
import { getPreviewPageCount, getPreviewPageItems } from "./pagination";

type ReadyState = Extract<DealSearchState, { kind: "ready" }>;

interface DealPreviewProps {
  readonly state: ReadyState;
  readonly options: DealFilterOptions;
  readonly context: AppContext;
  readonly mode: AppMode;
  readonly onToggleExcluded: (id: string) => void;
}

function dealCardUrl(
  mode: AppMode,
  context: AppContext,
  id: string,
): string | null {
  if (mode !== "bitrix-readonly") return null;
  try {
    const portal = new URL(context.portal);
    if (portal.protocol !== "https:" || portal.origin !== context.portal) {
      return null;
    }
    return new URL(`/crm/deal/details/${id}/`, portal).toString();
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
  const pageCount = getPreviewPageCount(state.items.length);
  const currentPage = Math.min(page, pageCount);
  const deals = state.items.filter((item): item is Deal => item.entity === "deal");
  const rows = getPreviewPageItems(deals, currentPage);
  const counts = getSelectionCounts(state.items, state.excludedIds);
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
  const formatDate = (deal: Deal, field: "createdAt" | "updatedAt") => {
    const value = new Date(deal[field]);
    const displayValue =
      context.timeZone === null
        ? new Date(value.getTime() + context.timeZoneOffsetSeconds * 1000)
        : value;
    return dateFormatter.format(displayValue);
  };

  return (
    <section className="preview-layout" aria-labelledby="preview-title">
      <div className="table-panel">
        <div className="preview-heading">
          <div>
            <p className="eyebrow">Результат поиска</p>
            <h2 id="preview-title">Проверьте список</h2>
          </div>
          <p>Исключите сделки, которые хотите сохранить.</p>
        </div>
        <div className="table-scroll">
          <table className="deal-table">
            <thead>
              <tr>
                <th scope="col">В списке</th>
                <th scope="col">Сделка</th>
                <th scope="col">Ответственный</th>
                <th scope="col">Даты</th>
                <th scope="col">Стадия</th>
                <th scope="col">Действие</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((deal) => {
                const excluded = state.excludedIds.has(deal.id);
                const cardUrl = dealCardUrl(mode, context, deal.id);
                return (
                  <tr
                    key={deal.id}
                    className={excluded ? "row-excluded" : undefined}
                  >
                    <td>
                      <label className="checkbox-hit-target">
                        <input
                          type="checkbox"
                          checked={!excluded}
                          aria-label={`Включить ${deal.title}`}
                          onChange={() => onToggleExcluded(deal.id)}
                        />
                      </label>
                    </td>
                    <td>
                      {cardUrl === null ? (
                        <strong>{deal.title}</strong>
                      ) : (
                        <a
                          className="deal-link"
                          href={cardUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <strong>{deal.title}</strong>
                        </a>
                      )}
                      <span className="deal-id">
                        ID {deal.id} · {deal.pipelineName}
                      </span>
                    </td>
                    <td>{deal.assignedByName}</td>
                    <td>
                      <span>Создана: {formatDate(deal, "createdAt")}</span>
                      <span>Изменена: {formatDate(deal, "updatedAt")}</span>
                    </td>
                    <td>{deal.stageName}</td>
                    <td>
                      <button
                        className="row-action"
                        type="button"
                        aria-label={`${excluded ? "Вернуть" : "Исключить"} ${deal.title}`}
                        onClick={() => onToggleExcluded(deal.id)}
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
        <span>сделок выбрано</span>
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
          draft={state.criteria as DealSearchCriteria}
          options={options}
          title="Условия сохранённого поиска"
        />
        <DealCsvExport items={deals} excludedIds={state.excludedIds} />
        <p className="demo-note">
          {mode === "demo"
            ? "Это локальный preview искусственных данных. Запросов к Bitrix24 нет."
            : "Preview получен из Bitrix24 в режиме только для чтения. Никакие данные не изменяются."}
        </p>
      </aside>
    </section>
  );
}
