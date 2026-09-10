import type {
  DealFilterOptions,
  DealSearchDraft,
  NamedOption,
} from "../domain/types";

interface CriteriaSummaryProps {
  readonly draft: DealSearchDraft;
  readonly options: DealFilterOptions;
}

function optionName(
  options: readonly NamedOption[],
  id: string,
  fallback: string,
): string {
  return options.find((option) => option.id === id)?.name ?? fallback;
}

export function CriteriaSummary({ draft, options }: CriteriaSummaryProps) {
  const dateField =
    draft.dateField === "createdAt" ? "Дата создания" : "Дата изменения";
  const criteria = [
    `${dateField}: ${draft.beforeDate === "" ? "не задана" : `до ${draft.beforeDate}`}`,
    `Воронка: ${optionName(options.pipelines, draft.pipelineId, "все воронки")}`,
    `Стадия: ${optionName(options.stages, draft.stageId, "все проигранные стадии")}`,
    `Ответственный: ${optionName(options.assignees, draft.assignedById, "все ответственные")}`,
  ];

  return (
    <aside className="criteria-summary" aria-label="Текущие условия">
      <p className="eyebrow">Текущие условия</p>
      <ul>
        {criteria.map((criterion) => (
          <li key={criterion}>{criterion}</li>
        ))}
      </ul>
    </aside>
  );
}
