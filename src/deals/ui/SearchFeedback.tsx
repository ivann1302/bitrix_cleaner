import type { DealSearchState } from "../state/searchState";

interface SearchFeedbackProps {
  readonly state: DealSearchState;
}

export function SearchFeedback({ state }: SearchFeedbackProps) {
  switch (state.kind) {
    case "initial":
      return <p className="status-panel">Задайте условия и запустите поиск.</p>;
    case "loading":
      return (
        <p className="status-panel" role="status">
          Ищем сделки в демо-данных. Ничего не удаляется.
        </p>
      );
    case "ready":
      return (
        <p className="status-panel" role="status">
          Найдено: {state.items.length}
        </p>
      );
    case "empty":
      return <p className="status-panel">По этим условиям сделок нет</p>;
    case "over-limit":
      return (
        <p className="status-panel warning">
          Найдено больше 3 000 сделок. Сузьте условия.
        </p>
      );
    case "failure":
      return (
        <p className="status-panel error" role="alert">
          {state.code === "mock-unavailable"
            ? "Демо-данные временно недоступны. Повторите поиск."
            : "Не удалось получить сделки. Повторите поиск."}
        </p>
      );
  }
}
