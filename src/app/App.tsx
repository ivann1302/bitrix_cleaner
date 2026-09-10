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
import { SearchFeedback } from "../deals/ui/SearchFeedback";

const defaultAdapter = new MockBitrixAdapter({ behavior: { delayMs: 350 } });
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
}

export function App({ adapter = defaultAdapter }: AppProps) {
  const [draft, setDraft] = useState(INITIAL_DRAFT);
  const [errors, setErrors] = useState<DealSearchValidationErrors>({});
  const [optionsState, setOptionsState] = useState<OptionsState>({
    kind: "loading",
  });
  const { state, search } = useDealSearch(adapter);

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

  const previewIsStale =
    state.kind === "ready" &&
    criteriaSignature(normalizeDealSearchDraft(draft)) !==
      criteriaSignature(state.criteria);

  return (
    <main className="app-shell">
      <header className="topbar">
        <strong>CRM Cleaner</strong>
        <span className="demo-badge">Демо-режим</span>
      </header>
      <section className="page" aria-labelledby="page-title">
        <p className="eyebrow">Сделки · только чтение</p>
        <h1 id="page-title">Старые проигранные сделки</h1>
        <p className="intro">
          Настройте условия и проверьте результат на искусственных данных.
        </p>
        {optionsState.kind === "loading" && (
          <p role="status">Загружаем фильтры…</p>
        )}
        {optionsState.kind === "failure" && (
          <p className="status-panel error" role="alert">
            Не удалось загрузить демо-фильтры.
          </p>
        )}
        {optionsState.kind === "ready" && (
          <DealFilters
            draft={draft}
            options={optionsState.value}
            errors={errors}
            loading={state.kind === "loading"}
            onDraftChange={setDraft}
            onSubmit={submit}
          />
        )}
        {previewIsStale && (
          <p className="status-panel warning">
            Условия изменены. Показан результат предыдущего поиска.
          </p>
        )}
        <SearchFeedback state={state} />
      </section>
    </main>
  );
}
