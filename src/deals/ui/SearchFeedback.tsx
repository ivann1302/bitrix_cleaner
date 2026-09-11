import type { DealSearchState } from "../state/searchState";
import type { AppMode } from "../../app/runtime";
import type { CrmEntity } from "../domain/types";

interface SearchFeedbackProps {
  readonly state: DealSearchState;
  readonly mode?: AppMode;
  readonly entity?: CrmEntity;
}

export function SearchFeedback({
  state,
  mode = "demo",
  entity = "deal",
}: SearchFeedbackProps) {
  const plural = entity === "deal" ? "сделки" : "лиды";
  const many = entity === "deal" ? "сделок" : "лидов";
  switch (state.kind) {
    case "initial":
      return <p className="status-panel">Задайте условия и запустите поиск.</p>;
    case "loading":
      return (
        <p className="status-panel" role="status">
          {mode === "demo"
            ? `Ищем ${plural} в демо-данных. Ничего не удаляется.`
            : `Ищем ${plural} в Bitrix24. Ничего не удаляется.`}
        </p>
      );
    case "ready":
      return (
        <p className="status-panel" role="status">
          Найдено: {state.items.length}
        </p>
      );
    case "empty":
      return (
        <p className="status-panel" role="status">
          По этим условиям {many} нет
        </p>
      );
    case "over-limit":
      return (
        <p className="status-panel warning" role="status">
          Найдено больше 3 000 {many}. Сузьте условия.
        </p>
      );
    case "failure":
      return (
        <p className="status-panel error" role="alert">
          {state.code === "mock-unavailable"
            ? "Демо-данные временно недоступны. Повторите поиск."
            : `Не удалось получить ${plural}. Повторите поиск.`}
        </p>
      );
  }
}
