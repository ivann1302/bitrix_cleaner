import type {
  CrmFilterOptions,
  CrmSearchCriteria,
  CrmSearchDraft,
  NamedOption,
} from "../domain/types";

interface CriteriaSummaryProps {
  readonly draft: CrmSearchDraft | CrmSearchCriteria;
  readonly options: CrmFilterOptions;
  readonly title?: string;
}

function optionName(
  options: readonly NamedOption[],
  id: string | null,
  fallback: string,
): string {
  return options.find((option) => option.id === id)?.name ?? fallback;
}

export function CriteriaSummary({
  draft,
  options,
  title = "Текущие условия",
}: CriteriaSummaryProps) {
  const dateField =
    draft.dateField === "createdAt" ? "Дата создания" : "Дата изменения";
  if (draft.entity !== options.entity) return null;
  const criteria =
    draft.entity === "deal" && options.entity === "deal"
      ? [
          `${dateField}: ${draft.beforeDate === "" || draft.beforeDate === null ? "не задана" : `до ${draft.beforeDate}`}`,
          `Воронка: ${optionName(options.pipelines, draft.pipelineId, "все воронки")}`,
          `Стадия: ${optionName(options.stages, draft.stageId, "все проигранные стадии")}`,
          `Ответственный: ${optionName(options.assignees, draft.assignedById, "все ответственные")}`,
        ]
      : draft.entity === "lead" && options.entity === "lead"
        ? [
            `${dateField}: ${draft.beforeDate === "" || draft.beforeDate === null ? "не задана" : `до ${draft.beforeDate}`}`,
            `Статус: ${optionName(options.statuses, draft.statusId, "все неуспешные статусы")}`,
            `Ответственный: ${optionName(options.assignees, draft.assignedById, "все ответственные")}`,
          ]
        : [];

  return (
    <aside className="criteria-summary" aria-label={title}>
      <h3 className="eyebrow">{title}</h3>
      <ul>
        {criteria.map((criterion) => (
          <li key={criterion}>{criterion}</li>
        ))}
      </ul>
    </aside>
  );
}
