import type { OperationRecord } from "../operation/types";

const labels = {
  running: "Выполняется демо-удаление",
  paused: "Операция на паузе",
  stopped: "Новые запросы остановлены",
  completed: "Операция завершена",
  interrupted: "Операция прервана",
};
const itemLabels = {
  pending: "Ожидает",
  sent: "Отправлен",
  deleted: "Удалено",
  error: "Ошибка",
  unknown: "Неизвестно — требуется сверка",
};

interface Props {
  readonly record: OperationRecord;
  readonly busy: boolean;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onStop: () => void;
}

export function OperationProgress({
  record,
  busy,
  onPause,
  onResume,
  onStop,
}: Props) {
  const count = (status: string) =>
    record.items.filter((item) => item.status === status).length;
  const deleted = count("deleted");
  const errors = count("error");
  const unknown = count("unknown");
  const processed = deleted + errors + unknown;
  return (
    <section className="operation-panel" aria-labelledby="operation-title">
      <h2 id="operation-title">{labels[record.status]}</h2>
      <p>
        Портал: {record.context.portal} · Пользователь: {record.context.userId}{" "}
        · Сделки
      </p>
      <div role="status">
        <p>
          Обработано {processed} из {record.items.length}
        </p>
        <p>
          Удалено: {deleted} · Ошибок: {errors}
        </p>
        <p>Неизвестно: {unknown}</p>
      </div>
      <progress
        aria-label="Обработано записей"
        value={processed}
        max={record.items.length}
      />
      {busy && (
        <div className="dialog-actions">
          {record.status === "paused" ? (
            <button
              type="button"
              className="secondary-button"
              onClick={onResume}
            >
              Продолжить
            </button>
          ) : (
            <button
              type="button"
              className="secondary-button"
              onClick={onPause}
            >
              Пауза
            </button>
          )}
          <button type="button" className="secondary-button" onClick={onStop}>
            Остановить новые запросы
          </button>
        </div>
      )}
      <p className="demo-note">
        Закрытие вкладки прекращает новые запросы, но не отзывает отправленные.
        Автоматического продолжения нет. Перед новой операцией проверьте
        неизвестные исходы и выполните новый поиск. Демо-данные сбрасываются при
        перезагрузке; сохранённый отчёт не означает изменение Bitrix24.
      </p>
      <details>
        <summary>Результаты по ID</summary>
        <div className="operation-items">
          {record.items.map((item) => (
            <p key={item.id}>
              ID {item.id}: {itemLabels[item.status]} · попыток: {item.attempts}
            </p>
          ))}
        </div>
      </details>
    </section>
  );
}
