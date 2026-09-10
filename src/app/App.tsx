import { useEffect, useState } from "react";
import type { BitrixAdapter } from "../deals/data/BitrixAdapter";
import { MockBitrixAdapter } from "../deals/data/MockBitrixAdapter";
import {
  criteriaSignature,
  normalizeDealSearchDraft,
  validateDealSearchDraft,
} from "../deals/domain/dealSearch";
import type {
  DealFilterOptions,
  DealSearchDraft,
  DealSearchValidationErrors,
} from "../deals/domain/types";
import { useDealSearch } from "../deals/state/useDealSearch";
import { DealFilters } from "../deals/ui/DealFilters";
import { DealPreview } from "../deals/ui/DealPreview";
import { SearchFeedback } from "../deals/ui/SearchFeedback";
import { createSelectionSnapshot } from "../deals/domain/confirmation";
import { IndexedDbOperationStore } from "../deals/operation/IndexedDbOperationStore";
import { BrowserOperationLock } from "../deals/operation/BrowserOperationLock";
import {
  useDemoOperation,
  type OperationServices,
} from "../deals/state/useDemoOperation";
import { DealConfirmation } from "../deals/ui/DealConfirmation";
import { OperationProgress } from "../deals/ui/OperationProgress";
import type { AppContext } from "../deals/domain/types";
import type { AppMode } from "./runtime";
import { MOCK_APP_CONTEXT } from "../deals/data/mockContext";

const defaultAdapter = new MockBitrixAdapter({
  behavior: { delayMs: 350, deleteDelayMs: 250 },
});
const defaultOperationServices: OperationServices = {
  store: new IndexedDbOperationStore(),
  lock: new BrowserOperationLock(),
};
const INITIAL_DRAFT: DealSearchDraft = {
  dateField: "createdAt",
  beforeDate: "",
  pipelineId: "",
  stageId: "",
  assignedById: "",
};

type OptionsState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly value: DealFilterOptions }
  | { readonly kind: "failure" };

interface AppProps {
  readonly adapter?: BitrixAdapter;
  readonly operationServices?: OperationServices;
  readonly context?: AppContext;
  readonly mode?: AppMode;
}

export function App({
  adapter = defaultAdapter,
  operationServices = defaultOperationServices,
  context = MOCK_APP_CONTEXT,
  mode = "demo",
}: AppProps) {
  const [draft, setDraft] = useState(INITIAL_DRAFT);
  const [errors, setErrors] = useState<DealSearchValidationErrors>({});
  const [optionsState, setOptionsState] = useState<OptionsState>({
    kind: "loading",
  });
  const { state, search, toggleExcluded } = useDealSearch(adapter);
  const [draftVersion, setDraftVersion] = useState(0);
  const previewIsStale =
    state.kind === "ready" &&
    criteriaSignature(normalizeDealSearchDraft(draft)) !==
      criteriaSignature(state.criteria);
  const snapshot =
    state.kind === "ready" && !previewIsStale
      ? createSelectionSnapshot(
          {
            ...state,
            context: {
              portal: context.portal,
              userId: context.userId,
              entity: "deal",
              isAdmin: context.isAdmin,
            },
            selectionVersion: state.selectionVersion + draftVersion,
          },
          state.collectedAt,
        )
      : null;
  const transport =
    mode === "demo" && adapter instanceof MockBitrixAdapter ? adapter : null;
  const operation = useDemoOperation(snapshot, transport, operationServices);

  useEffect(() => {
    let active = true;
    void adapter.getDealFilterOptions().then(
      (value) => {
        if (active) setOptionsState({ kind: "ready", value });
      },
      () => {
        if (active) setOptionsState({ kind: "failure" });
      },
    );
    return () => {
      active = false;
    };
  }, [adapter]);

  function submit(): void {
    if (operation.busy) return;
    const validation = validateDealSearchDraft(draft);
    if (!validation.ok) {
      setErrors({
        ...validation.fieldErrors,
        ...(validation.formError === undefined
          ? {}
          : { form: validation.formError }),
      });
      return;
    }
    setErrors({});
    void search(validation.criteria);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <strong>CRM Cleaner</strong>
        <span className="demo-badge">
          {mode === "demo" ? "Демо-режим" : "Bitrix24 · только чтение"}
        </span>
      </header>
      <section className="page" aria-labelledby="page-title">
        <p className="eyebrow">
          Сделки · {mode === "demo" ? "искусственный портал" : "портал"}{" "}
          {context.portal}
        </p>
        <h1 id="page-title">Старые проигранные сделки</h1>
        <p className="intro">
          {mode === "demo"
            ? "Настройте условия и проверьте результат на искусственных данных."
            : "Настройте условия и проверьте полный список сделок из Bitrix24. Этот режим ничего не удаляет."}
        </p>
        <p className="runtime-context">
          Пользователь: {context.userName} · Администратор:{" "}
          {context.isAdmin ? "да" : "нет"}
        </p>
        {optionsState.kind === "loading" && (
          <p role="status">Загружаем фильтры…</p>
        )}
        {optionsState.kind === "failure" && (
          <p className="status-panel error" role="alert">
            {mode === "demo"
              ? "Не удалось загрузить демо-фильтры."
              : "Не удалось загрузить справочники Bitrix24."}
          </p>
        )}
        {optionsState.kind === "ready" && (
          <fieldset className="operation-fieldset" disabled={operation.busy}>
            <DealFilters
              draft={draft}
              options={optionsState.value}
              errors={errors}
              loading={state.kind === "loading"}
              onDraftChange={(next) => {
                setDraft(next);
                setDraftVersion((version) => version + 1);
              }}
              onSubmit={submit}
            />
          </fieldset>
        )}
        {previewIsStale && (
          <p className="status-panel warning">
            Условия изменены. Показан результат предыдущего поиска.
          </p>
        )}
        <SearchFeedback state={state} mode={mode} />
        {state.kind === "ready" && optionsState.kind === "ready" && (
          <>
            <fieldset className="operation-fieldset" disabled={operation.busy}>
              <DealPreview
                key={state.revision}
                state={state}
                options={optionsState.value}
                context={context}
                mode={mode}
                onToggleExcluded={(id) => {
                  if (!operation.busy) toggleExcluded(id);
                }}
              />
            </fieldset>
            {transport !== null && (
              <DealConfirmation
                key={`${state.revision}:${draftVersion}:${state.selectionVersion}`}
                snapshot={
                  operation.storage === "ready" &&
                  !operation.busy &&
                  operation.usedRevision !== state.revision
                    ? snapshot
                    : null
                }
                options={optionsState.value}
                onConfirm={operation.start}
              />
            )}
          </>
        )}
        {transport !== null && operation.storage === "failure" && (
          <p className="status-panel error" role="alert">
            Локальное хранилище недоступно. Запуск заблокирован; проверьте
            настройки браузера и перезагрузите страницу.
          </p>
        )}
        {operation.error && (
          <p className="status-panel error" role="alert">
            Операция остановлена: не удалось проверить список, сохранить
            состояние или получить блокировку вкладки. Проверьте отчёт и
            выполните новый поиск. Отправленные запросы могли завершиться.
          </p>
        )}
        {operation.record !== null && (
          <OperationProgress
            record={operation.record}
            busy={operation.busy}
            onPause={operation.pause}
            onResume={operation.resume}
            onStop={operation.stop}
          />
        )}
      </section>
    </main>
  );
}
