import { useEffect, useState } from "react";
import type { BitrixAdapter } from "../deals/data/BitrixAdapter";
import { MockBitrixAdapter } from "../deals/data/MockBitrixAdapter";
import {
  createInitialDraft,
  criteriaSignature,
  normalizeCrmSearchDraft,
  validateCrmSearchDraft,
} from "../deals/domain/dealSearch";
import type {
  CrmEntity,
  CrmFilterOptions,
  CrmSearchDraft,
  DealSearchValidationErrors,
} from "../deals/domain/types";
import { useCrmSearch } from "../deals/state/useDealSearch";
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
import { ENTITY_COPY } from "../deals/domain/entityCopy";

const defaultAdapter = new MockBitrixAdapter({
  behavior: { delayMs: 350, deleteDelayMs: 250 },
});
const defaultOperationServices: OperationServices = {
  store: new IndexedDbOperationStore(),
  lock: new BrowserOperationLock(),
};
type OptionsState =
  | {
      readonly kind: "loading";
      readonly adapter: BitrixAdapter;
      readonly entity: CrmEntity;
    }
  | {
      readonly kind: "ready";
      readonly adapter: BitrixAdapter;
      readonly entity: CrmEntity;
      readonly value: CrmFilterOptions;
    }
  | {
      readonly kind: "failure";
      readonly adapter: BitrixAdapter;
      readonly entity: CrmEntity;
    };

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
  const [entity, setEntity] = useState<CrmEntity>("deal");
  const [draft, setDraft] = useState<CrmSearchDraft>(() =>
    createInitialDraft("deal"),
  );
  const [errors, setErrors] = useState<DealSearchValidationErrors>({});
  const [optionsState, setOptionsState] = useState<OptionsState>(() => ({
    kind: "loading",
    adapter,
    entity: "deal",
  }));
  const currentOptionsState: OptionsState =
    optionsState.adapter === adapter && optionsState.entity === entity
      ? optionsState
      : { kind: "loading", adapter, entity };
  const { state, search, toggleExcluded, reset } = useCrmSearch(adapter);
  const [draftVersion, setDraftVersion] = useState(0);
  const previewIsStale =
    state.kind === "ready" &&
    criteriaSignature(normalizeCrmSearchDraft(draft)) !==
      criteriaSignature(state.criteria);
  const snapshot =
    state.kind === "ready" &&
    state.criteria.entity === entity &&
    !previewIsStale
      ? createSelectionSnapshot(
          {
            ...state,
            criteria: state.criteria,
            items: state.items.filter((item) => item.entity === entity),
            context: {
              portal: context.portal,
              userId: context.userId,
              entity,
              isAdmin: context.isAdmin,
            },
            selectionVersion: state.selectionVersion + draftVersion,
          },
          state.collectedAt,
        )
      : null;
  const transport =
    mode === "demo" && adapter instanceof MockBitrixAdapter ? adapter : null;
  const operationContext = {
    portal: context.portal,
    userId: context.userId,
    entity,
    isAdmin: context.isAdmin,
  } as const;
  const operation = useDemoOperation(
    snapshot,
    transport,
    operationServices,
    operationContext,
  );

  useEffect(() => {
    let active = true;
    void adapter.getFilterOptions(entity).then(
      (value) => {
        if (!active) return;
        setOptionsState(
          value.entity === entity
            ? { kind: "ready", adapter, entity, value }
            : { kind: "failure", adapter, entity },
        );
      },
      () => {
        if (active) setOptionsState({ kind: "failure", adapter, entity });
      },
    );
    return () => {
      active = false;
    };
  }, [adapter, entity]);

  function changeEntity(next: CrmEntity): void {
    if (next === entity || operation.busy) return;
    setEntity(next);
    setDraft(createInitialDraft(next));
    setErrors({});
    setDraftVersion((version) => version + 1);
    setOptionsState({ kind: "loading", adapter, entity: next });
    reset();
  }

  function submit(): void {
    if (operation.busy) return;
    const validation = validateCrmSearchDraft(draft);
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
          {entity === "deal" ? "Сделки" : "Лиды"} ·{" "}
          {mode === "demo" ? "искусственный портал" : "портал"} {context.portal}
        </p>
        <h1 id="page-title">{ENTITY_COPY[entity].title}</h1>
        <p className="intro">
          {mode === "demo"
            ? "Настройте условия и проверьте результат на искусственных данных."
            : `Настройте условия и проверьте полный список ${ENTITY_COPY[entity].many} из Bitrix24. Этот режим ничего не удаляет.`}
        </p>
        <p className="runtime-context">
          Пользователь: {context.userName} · Администратор:{" "}
          {context.isAdmin ? "да" : "нет"}
        </p>
        <fieldset className="entity-selector" disabled={operation.busy}>
          <legend>Сущность CRM</legend>
          {(["deal", "lead"] as const).map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="crm-entity"
                value={value}
                checked={entity === value}
                disabled={!adapter.supportedEntities.includes(value)}
                onChange={() => changeEntity(value)}
              />
              {value === "deal" ? "Сделки" : "Лиды"}
            </label>
          ))}
        </fieldset>
        {currentOptionsState.kind === "loading" && (
          <p role="status">Загружаем фильтры…</p>
        )}
        {currentOptionsState.kind === "failure" && (
          <p className="status-panel error" role="alert">
            {mode === "demo"
              ? "Не удалось загрузить демо-фильтры."
              : "Не удалось загрузить справочники Bitrix24."}
          </p>
        )}
        {currentOptionsState.kind === "ready" && (
          <fieldset className="operation-fieldset" disabled={operation.busy}>
            <DealFilters
              draft={draft}
              options={currentOptionsState.value}
              errors={errors}
              loading={state.kind === "loading"}
              onDraftChange={(next) => {
                if (next.entity !== entity) return;
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
        <SearchFeedback state={state} mode={mode} entity={entity} />
        {state.kind === "ready" &&
          state.criteria.entity === entity &&
          currentOptionsState.kind === "ready" &&
          currentOptionsState.value.entity === entity && (
            <>
              <fieldset
                className="operation-fieldset"
                disabled={operation.busy}
              >
                <DealPreview
                  key={state.revision}
                  state={state}
                  options={currentOptionsState.value}
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
                  options={currentOptionsState.value}
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
