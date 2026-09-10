import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createDeal, TEST_FILTER_OPTIONS } from "../../test/dealFixtures";
import type { Deal } from "../domain/types";
import type { DealSearchState } from "../state/searchState";
import { DealPreview } from "./DealPreview";
import { MOCK_APP_CONTEXT } from "../data/mockContext";
import type { AppContext } from "../domain/types";

const criteria = {
  entity: "deal" as const,
  dateField: "createdAt" as const,
  beforeDate: "2026-01-31",
  pipelineId: null,
  stageId: null,
  assignedById: null,
};

function PreviewHarness({
  items,
  context = MOCK_APP_CONTEXT,
  mode = "demo",
}: {
  readonly items: readonly Deal[];
  readonly context?: AppContext;
  readonly mode?: "demo" | "bitrix-readonly";
}) {
  const [excludedIds, setExcludedIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const state: Extract<DealSearchState, { kind: "ready" }> = {
    kind: "ready",
    revision: 1,
    criteria,
    items,
    excludedIds,
    collectedAt: 1000,
    selectionVersion: 0,
  };

  return (
    <DealPreview
      state={state}
      options={TEST_FILTER_OPTIONS}
      context={context}
      mode={mode}
      onToggleExcluded={(id) => {
        setExcludedIds((current) => {
          const next = new Set(current);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      }}
    />
  );
}

describe("DealPreview", () => {
  it("excludes and restores a deal with exact result-wide counters", async () => {
    const user = userEvent.setup();
    render(
      <PreviewHarness
        items={[
          createDeal({ id: "1" }),
          createDeal({ id: "2", title: "Вторая" }),
        ]}
      />,
    );

    expect(
      screen.getByRole("group", { name: "Найдено 2" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Выбрано 2" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Исключить Вторая" }));
    expect(
      screen.getByRole("group", { name: "Выбрано 1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Исключено 1" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Вернуть Вторая" }));
    expect(
      screen.getByRole("group", { name: "Выбрано 2" }),
    ).toBeInTheDocument();
  });

  it("changes among three pages while preserving whole-result counters", async () => {
    const user = userEvent.setup();
    const items = Array.from({ length: 51 }, (_, index) =>
      createDeal({ id: String(index + 1), title: `Сделка ${index + 1}` }),
    );
    render(<PreviewHarness items={items} />);

    await user.click(
      screen.getByRole("button", { name: "Следующая страница" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Следующая страница" }),
    );
    expect(screen.getByText("Страница 3 из 3")).toBeInTheDocument();
    expect(screen.getByText("Сделка 51")).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Найдено 51" }),
    ).toBeInTheDocument();
  });

  it("renders CRM names as text rather than HTML", () => {
    render(
      <PreviewHarness
        items={[createDeal({ title: '<img src=x onerror="alert(1">' })]}
      />,
    );

    expect(
      screen.getByText('<img src=x onerror="alert(1">'),
    ).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("shows clearly labelled created and updated dates", () => {
    render(<PreviewHarness items={[createDeal()]} />);

    expect(screen.getByText(/Создана:/)).toBeInTheDocument();
    expect(screen.getByText(/Изменена:/)).toBeInTheDocument();
  });

  it("formats dates in the portal time zone instead of a fixed Moscow zone", () => {
    render(
      <PreviewHarness
        items={[createDeal({ createdAt: "2026-01-01T00:30:00.000Z" })]}
        context={{
          portal: "https://team.bitrix24.ru",
          userId: "42",
          userName: "Иван Иванов",
          isAdmin: true,
          timeZone: "America/Los_Angeles",
          timeZoneLabel: "America/Los_Angeles (UTC-08:00)",
          timeZoneOffsetSeconds: -28800,
        }}
        mode="bitrix-readonly"
      />,
    );

    expect(screen.getByText("Создана: 31.12.2025")).toBeInTheDocument();
  });

  it("links real preview rows to their Bitrix24 cards and labels read-only mode", () => {
    render(
      <PreviewHarness
        items={[createDeal()]}
        context={{
          portal: "https://team.bitrix24.ru",
          userId: "42",
          userName: "Иван Иванов",
          isAdmin: true,
          timeZone: "Europe/Moscow",
          timeZoneLabel: "Europe/Moscow (UTC+03:00)",
          timeZoneOffsetSeconds: 10800,
        }}
        mode="bitrix-readonly"
      />,
    );

    expect(
      screen.getByRole("link", { name: "Тестовая сделка" }),
    ).toHaveAttribute("href", "https://team.bitrix24.ru/crm/deal/details/1/");
    expect(screen.getByText(/только для чтения/i)).toBeInTheDocument();
    expect(screen.queryByText(/искусственных данных/i)).not.toBeInTheDocument();
  });
});
