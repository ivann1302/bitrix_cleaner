import { useEffect, useRef, useState } from "react";
import {
  isSelectionCurrent,
  type SelectionSnapshot,
} from "../domain/confirmation";
import { entityNoun } from "../domain/entityCopy";
import type { CrmFilterOptions } from "../domain/types";
import { CriteriaSummary } from "./CriteriaSummary";

interface Props {
  readonly snapshot: SelectionSnapshot | null;
  readonly options: CrmFilterOptions;
  readonly onConfirm: (snapshot: SelectionSnapshot) => void;
}

export function DealConfirmation({ snapshot, options, onConfirm }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const submitted = useRef(false);
  const [opened, setOpened] = useState<SelectionSnapshot | null>(null);
  const [now, setNow] = useState(Date.now);
  const [error, setError] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (opened !== null) {
      dialog.current?.showModal();
      cancel.current?.focus();
    }
  }, [opened]);

  const valid =
    snapshot !== null && isSelectionCurrent(snapshot, snapshot, now);
  const current =
    opened !== null &&
    snapshot !== null &&
    isSelectionCurrent(opened, snapshot, now);

  function close(): void {
    dialog.current?.close();
    setOpened(null);
    if (trigger.current?.disabled) panel.current?.focus();
    else trigger.current?.focus();
  }

  function confirm(): void {
    if (submitted.current) return;
    if (
      opened === null ||
      snapshot === null ||
      !isSelectionCurrent(opened, snapshot, Date.now())
    ) {
      setError(true);
      return;
    }
    submitted.current = true;
    close();
    onConfirm(opened);
  }

  return (
    <section
      ref={panel}
      tabIndex={-1}
      className="confirmation-panel"
      aria-label="Подготовка демо-удаления"
    >
      <p>Список действует 10 минут. Демо-операция не обращается к Bitrix24.</p>
      <button
        ref={trigger}
        type="button"
        className="primary-button"
        disabled={!valid}
        onClick={() => {
          if (
            snapshot === null ||
            !isSelectionCurrent(snapshot, snapshot, Date.now())
          ) {
            setError(true);
            return;
          }
          submitted.current = false;
          setError(false);
          setOpened(snapshot);
        }}
      >
        К подтверждению
      </button>
      {!valid && (
        <p role="status">
          Для подтверждения выберите записи и выполните новый поиск.
        </p>
      )}
      {error && (
        <p role="alert">
          Подтверждение недействительно. Выполните новый поиск.
        </p>
      )}
      <dialog
        ref={dialog}
        aria-labelledby="confirmation-title"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        {opened !== null && (
          <>
            <h2 id="confirmation-title">Подтверждение демо-удаления</h2>
            <p>Портал: {opened.context.portal}</p>
            <p>
              Пользователь: {opened.context.userId} ·{" "}
              {opened.context.entity === "deal" ? "Сделки" : "Лиды"}:{" "}
              {opened.ids.length}
            </p>
            <CriteriaSummary
              draft={opened.criteria}
              options={options}
              title="Подтверждаемые условия"
            />
            <p>
              Будут обработаны только выбранные ID. В реальной CRM удаление
              может быть необратимым; CSV не является полной резервной копией.
            </p>
            {!current && (
              <p role="alert">
                Список изменён или устарел. Закройте окно и выполните новый
                поиск.
              </p>
            )}
            <div className="dialog-actions">
              <button
                ref={cancel}
                type="button"
                className="secondary-button"
                onClick={close}
              >
                Отмена
              </button>
              <button
                type="button"
                className="danger-button"
                disabled={!current}
                onClick={confirm}
              >
                Удалить {opened.ids.length} демо-
                {entityNoun(opened.context.entity, opened.ids.length)}
              </button>
            </div>
          </>
        )}
      </dialog>
    </section>
  );
}
