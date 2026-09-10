import type { FormEvent } from "react";
import type {
  DealFilterOptions,
  DealSearchDraft,
  DealSearchValidationErrors,
} from "../domain/types";
import { CriteriaSummary } from "./CriteriaSummary";

interface DealFiltersProps {
  readonly draft: DealSearchDraft;
  readonly options: DealFilterOptions;
  readonly errors: DealSearchValidationErrors;
  readonly loading: boolean;
  readonly onDraftChange: (draft: DealSearchDraft) => void;
  readonly onSubmit: () => void;
}

export function DealFilters({
  draft,
  options,
  errors,
  loading,
  onDraftChange,
  onSubmit,
}: DealFiltersProps) {
  const stages = options.stages.filter(
    (stage) => draft.pipelineId === "" || stage.pipelineId === draft.pipelineId,
  );

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit();
  }

  return (
    <div className="filters-layout">
      <form className="filter-panel" onSubmit={submit} noValidate>
        <div className="filter-heading">
          <div>
            <p className="eyebrow">Условия</p>
            <h2>Какие сделки проверить</h2>
          </div>
          <span className="timezone">
            Часовой пояс: {options.timeZoneLabel}
          </span>
        </div>
        <div className="filter-grid">
          <label className="field">
            <span>Поле даты</span>
            <select
              aria-label="Поле даты"
              value={draft.dateField}
              onChange={(event) =>
                onDraftChange({
                  ...draft,
                  dateField:
                    event.target.value === "updatedAt"
                      ? "updatedAt"
                      : "createdAt",
                })
              }
            >
              <option value="createdAt">Дата создания</option>
              <option value="updatedAt">Дата изменения</option>
            </select>
          </label>
          <label className="field">
            <span>Дата до</span>
            <input
              aria-label="Дата до"
              type="date"
              value={draft.beforeDate}
              aria-invalid={errors.beforeDate !== undefined}
              aria-describedby={
                errors.beforeDate === undefined
                  ? "before-date-help"
                  : "before-date-error"
              }
              onChange={(event) =>
                onDraftChange({ ...draft, beforeDate: event.target.value })
              }
            />
            <span id="before-date-help">
              Включительно, до конца дня. Часовой пояс: {options.timeZoneLabel}.
            </span>
            {errors.beforeDate !== undefined && (
              <span className="field-error" id="before-date-error">
                {errors.beforeDate}
              </span>
            )}
          </label>
          <label className="field">
            <span>Воронка</span>
            <select
              aria-label="Воронка"
              value={draft.pipelineId}
              onChange={(event) =>
                onDraftChange({
                  ...draft,
                  pipelineId: event.target.value,
                  stageId: "",
                })
              }
            >
              <option value="">Все воронки</option>
              {options.pipelines.map((pipeline) => (
                <option key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Проигранная стадия</span>
            <select
              aria-label="Проигранная стадия"
              value={draft.stageId}
              onChange={(event) =>
                onDraftChange({ ...draft, stageId: event.target.value })
              }
            >
              <option value="">Все проигранные стадии</option>
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Ответственный</span>
            <select
              aria-label="Ответственный"
              value={draft.assignedById}
              onChange={(event) =>
                onDraftChange({ ...draft, assignedById: event.target.value })
              }
            >
              <option value="">Все ответственные</option>
              {options.assignees.map((assignee) => (
                <option key={assignee.id} value={assignee.id}>
                  {assignee.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {errors.form !== undefined && (
          <p className="form-error" role="alert">
            {errors.form}
          </p>
        )}
        <button className="primary-button" type="submit" disabled={loading}>
          {loading ? "Ищем сделки…" : "Найти сделки"}
        </button>
      </form>
      <CriteriaSummary draft={draft} options={options} />
    </div>
  );
}
