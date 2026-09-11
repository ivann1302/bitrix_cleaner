import { act, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { BitrixAdapter } from "../deals/data/BitrixAdapter";
import type {
  AppContext,
  CrmFilterOptions,
  DealSearchResult,
} from "../deals/domain/types";
import {
  createDeal,
  createLead,
  TEST_FILTER_OPTIONS,
  TEST_LEAD_FILTER_OPTIONS,
} from "../test/dealFixtures";
import { App } from "./App";

function adapterWith(result: DealSearchResult): BitrixAdapter {
  return {
    supportedEntities: ["deal"],
    getFilterOptions: () => Promise.resolve(TEST_FILTER_OPTIONS),
    search: () => Promise.resolve(result),
  };
}

describe("App", () => {
  it("switches safely from a ready deal preview to lead filters", async () => {
    const user = userEvent.setup();
    const adapter: BitrixAdapter = {
      supportedEntities: ["deal", "lead"],
      getFilterOptions: (entity) =>
        Promise.resolve(
          entity === "deal" ? TEST_FILTER_OPTIONS : TEST_LEAD_FILTER_OPTIONS,
        ),
      search: (criteria) =>
        Promise.resolve(
          criteria.entity === "deal"
            ? { kind: "success", items: [createDeal()] }
            : { kind: "success", items: [createLead()] },
        ),
    };
    render(<App adapter={adapter} />);

    await user.type(await screen.findByLabelText("Дата до"), "2026-01-31");
    await user.click(screen.getByRole("button", { name: "Найти сделки" }));
    expect(await screen.findByText("Тестовая сделка")).toBeVisible();

    await user.click(screen.getByRole("radio", { name: "Лиды" }));

    expect(
      screen.getByRole("heading", { name: "Старые неуспешные лиды" }),
    ).toBeVisible();
    expect(screen.queryByText("Тестовая сделка")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Воронка")).not.toBeInTheDocument();
    expect(await screen.findByLabelText("Неуспешный статус")).toBeVisible();
  });

  it("ignores a late deal dictionary after switching to leads", async () => {
    let resolveDeals: ((value: CrmFilterOptions) => void) | undefined;
    const adapter: BitrixAdapter = {
      supportedEntities: ["deal", "lead"],
      getFilterOptions: (entity) =>
        entity === "deal"
          ? new Promise((resolve) => {
              resolveDeals = resolve;
            })
          : Promise.resolve(TEST_LEAD_FILTER_OPTIONS),
      search: () => Promise.resolve({ kind: "empty" }),
    };
    render(<App adapter={adapter} />);

    await userEvent.setup().click(screen.getByRole("radio", { name: "Лиды" }));
    expect(await screen.findByLabelText("Неуспешный статус")).toBeVisible();
    resolveDeals?.(TEST_FILTER_OPTIONS);
    await act(async () => Promise.resolve());

    expect(screen.getByLabelText("Неуспешный статус")).toBeVisible();
    expect(screen.queryByLabelText("Воронка")).not.toBeInTheDocument();
  });

  it("показывает labels и не запускает пустой фильтр", async () => {
    const user = userEvent.setup();
    const searchDeals = vi.fn(() =>
      Promise.resolve({ kind: "empty" } as const),
    );
    render(
      <App
        adapter={{
          supportedEntities: ["deal"],
          getFilterOptions: () => Promise.resolve(TEST_FILTER_OPTIONS),
          search: searchDeals,
        }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Старые проигранные сделки" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Демо-режим")).toBeInTheDocument();
    expect(await screen.findByLabelText("Дата до")).toBeInTheDocument();
    expect(screen.getByLabelText("Поле даты")).toBeInTheDocument();
    expect(screen.getByLabelText("Воронка")).toBeInTheDocument();
    expect(screen.getByLabelText("Проигранная стадия")).toBeInTheDocument();
    expect(screen.getByLabelText("Ответственный")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Найти сделки" }));
    expect(
      screen.getByText("Добавьте хотя бы одно условие поиска."),
    ).toBeInTheDocument();
    expect(searchDeals).not.toHaveBeenCalled();
  });

  it("запускает поиск только при явном submit с клавиатуры", async () => {
    const user = userEvent.setup();
    const searchDeals = vi.fn(() =>
      Promise.resolve({ kind: "empty" } as const),
    );
    render(
      <App
        adapter={{
          supportedEntities: ["deal"],
          getFilterOptions: () => Promise.resolve(TEST_FILTER_OPTIONS),
          search: searchDeals,
        }}
      />,
    );

    const date = await screen.findByLabelText("Дата до");
    await user.type(date, "2026-01-31");
    expect(searchDeals).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");

    expect(
      await screen.findByText("По этим условиям сделок нет"),
    ).toBeInTheDocument();
    expect(searchDeals).toHaveBeenCalledOnce();
  });

  it("не запускает поиск при повторном mount в StrictMode", async () => {
    const searchDeals = vi.fn(() =>
      Promise.resolve({ kind: "empty" } as const),
    );
    render(
      <StrictMode>
        <App
          adapter={{
            supportedEntities: ["deal"],
            getFilterOptions: () => Promise.resolve(TEST_FILTER_OPTIONS),
            search: searchDeals,
          }}
        />
      </StrictMode>,
    );

    await screen.findByLabelText("Дата до");
    expect(searchDeals).not.toHaveBeenCalled();
  });

  it("сбрасывает стадию при смене воронки", async () => {
    const user = userEvent.setup();
    const options = {
      ...TEST_FILTER_OPTIONS,
      pipelines: [
        ...TEST_FILTER_OPTIONS.pipelines,
        { id: "sales", name: "Продажи" },
      ],
      stages: [
        ...TEST_FILTER_OPTIONS.stages,
        {
          id: "sales-lost",
          name: "Неуспех",
          pipelineId: "sales",
          isLost: true,
        },
      ],
    };
    render(
      <App
        adapter={{
          supportedEntities: ["deal"],
          getFilterOptions: () => Promise.resolve(options),
          search: () => Promise.resolve({ kind: "empty" }),
        }}
      />,
    );

    await user.selectOptions(await screen.findByLabelText("Воронка"), "main");
    await user.selectOptions(
      screen.getByLabelText("Проигранная стадия"),
      "main-lost",
    );
    await user.selectOptions(screen.getByLabelText("Воронка"), "sales");

    expect(screen.getByLabelText("Проигранная стадия")).toHaveValue("");
  });

  it.each([
    [{ kind: "empty" } as const, "По этим условиям сделок нет"],
    [
      { kind: "over-limit", matchedAtLeast: 3001 } as const,
      "Найдено больше 3 000 сделок. Сузьте условия.",
    ],
    [
      { kind: "failure", code: "mock-unavailable" } as const,
      "Демо-данные временно недоступны. Повторите поиск.",
    ],
    [
      { kind: "failure", code: "unknown-code" } as const,
      "Не удалось получить сделки. Повторите поиск.",
    ],
  ])("различает результат %#", async (result, message) => {
    const user = userEvent.setup();
    render(<App adapter={adapterWith(result)} />);

    await user.type(await screen.findByLabelText("Дата до"), "2026-01-31");
    await user.click(screen.getByRole("button", { name: "Найти сделки" }));

    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it.each([
    [{ kind: "empty" } as const, "По этим условиям сделок нет"],
    [
      { kind: "over-limit", matchedAtLeast: 3001 } as const,
      "Найдено больше 3 000 сделок. Сузьте условия.",
    ],
  ])("объявляет терминальный результат %#", async (result, message) => {
    const user = userEvent.setup();
    render(<App adapter={adapterWith(result)} />);

    await user.type(await screen.findByLabelText("Дата до"), "2026-01-31");
    await user.click(screen.getByRole("button", { name: "Найти сделки" }));

    expect(await screen.findByRole("status")).toHaveTextContent(message);
  });

  it("показывает loading, ready и устаревший preview после изменения фильтра", async () => {
    const user = userEvent.setup();
    let resolveSearch: ((value: DealSearchResult) => void) | undefined;
    const adapter: BitrixAdapter = {
      supportedEntities: ["deal"],
      getFilterOptions: () => Promise.resolve(TEST_FILTER_OPTIONS),
      search() {
        return new Promise((resolve) => {
          resolveSearch = resolve;
        });
      },
    };
    render(<App adapter={adapter} />);

    const date = await screen.findByLabelText("Дата до");
    await user.type(date, "2026-01-31");
    await user.click(screen.getByRole("button", { name: "Найти сделки" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Ищем сделки в демо-данных",
    );
    expect(screen.getByRole("button", { name: "Ищем сделки…" })).toBeDisabled();

    const resolve = resolveSearch;
    if (resolve === undefined) throw new Error("Search resolver is missing");
    act(() => {
      resolve({ kind: "success", items: [createDeal()] });
    });
    expect(await screen.findByText("Найдено: 1")).toBeInTheDocument();

    await user.clear(date);
    await user.type(date, "2026-02-28");
    expect(
      screen.getByText(
        "Условия изменены. Показан результат предыдущего поиска.",
      ),
    ).toBeInTheDocument();
  });

  it("показывает ошибку загрузки справочников", async () => {
    render(
      <App
        adapter={{
          supportedEntities: ["deal"],
          getFilterOptions: () => Promise.reject(new Error("offline")),
          search: () => Promise.resolve({ kind: "empty" }),
        }}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Не удалось загрузить демо-фильтры.",
    );
  });

  it("не содержит действий удаления", async () => {
    render(
      <App adapter={adapterWith({ kind: "success", items: [createDeal()] })} />,
    );
    await screen.findByLabelText("Дата до");
    expect(
      screen.queryByRole("button", { name: /удалить/i }),
    ).not.toBeInTheDocument();
  });

  it("shows portal context and read-only copy without demo deletion controls", async () => {
    const user = userEvent.setup();
    const context: AppContext = {
      portal: "https://team.bitrix24.ru",
      userId: "42",
      userName: "Иван Иванов",
      isAdmin: false,
      timeZone: "Europe/Moscow",
      timeZoneLabel: "Europe/Moscow (UTC+03:00)",
      timeZoneOffsetSeconds: 10800,
    };
    render(
      <App
        adapter={{
          supportedEntities: ["deal"],
          getFilterOptions: () => Promise.resolve(TEST_FILTER_OPTIONS),
          search: () => new Promise<DealSearchResult>(() => {}),
        }}
        context={context}
        mode="bitrix-readonly"
      />,
    );

    expect(screen.getByText("Bitrix24 · только чтение")).toBeInTheDocument();
    expect(screen.getByText(/team\.bitrix24\.ru/)).toBeInTheDocument();
    expect(screen.getByText(/Иван Иванов/)).toBeInTheDocument();
    expect(screen.getByText(/Администратор: нет/)).toBeInTheDocument();
    await user.type(await screen.findByLabelText("Дата до"), "2026-01-31");
    await user.click(screen.getByRole("button", { name: "Найти сделки" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Ищем сделки в Bitrix24. Ничего не удаляется.",
    );
    expect(
      screen.queryByRole("button", { name: /к подтверждению|удалить/i }),
    ).not.toBeInTheDocument();
  });

  it("uses a portal-specific filter loading error in real mode", async () => {
    const context: AppContext = {
      portal: "https://team.bitrix24.ru",
      userId: "42",
      userName: "Иван Иванов",
      isAdmin: true,
      timeZone: "Europe/Moscow",
      timeZoneLabel: "UTC+03:00",
      timeZoneOffsetSeconds: 10800,
    };
    render(
      <App
        adapter={{
          supportedEntities: ["deal"],
          getFilterOptions: () => Promise.reject(new Error("secret")),
          search: () => Promise.resolve({ kind: "empty" }),
        }}
        context={context}
        mode="bitrix-readonly"
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Не удалось загрузить справочники Bitrix24.",
    );
    expect(document.body).not.toHaveTextContent("secret");
  });

  it("связывает готовый результат с исключением без удаления", async () => {
    const user = userEvent.setup();
    render(
      <App adapter={adapterWith({ kind: "success", items: [createDeal()] })} />,
    );

    await user.type(await screen.findByLabelText("Дата до"), "2026-01-31");
    await user.click(screen.getByRole("button", { name: "Найти сделки" }));
    await user.click(
      await screen.findByRole("button", { name: "Исключить Тестовая сделка" }),
    );

    expect(
      screen.getByRole("group", { name: "Исключено 1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Вернуть Тестовая сделка" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /удалить/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps saved-result criteria independent from the live draft", async () => {
    const user = userEvent.setup();
    render(
      <App adapter={adapterWith({ kind: "success", items: [createDeal()] })} />,
    );

    const date = await screen.findByLabelText("Дата до");
    await user.type(date, "2026-01-31");
    await user.click(screen.getByRole("button", { name: "Найти сделки" }));
    await screen.findByRole("heading", { name: "Условия сохранённого поиска" });
    await user.clear(date);
    await user.type(date, "2026-02-28");

    expect(
      screen.getByRole("complementary", {
        name: "Условия сохранённого поиска",
      }),
    ).toHaveTextContent("до 2026-01-31");
  });

  it("resets preview pagination for a new search revision", async () => {
    const user = userEvent.setup();
    const items = Array.from({ length: 51 }, (_, index) =>
      createDeal({ id: String(index + 1), title: `Сделка ${index + 1}` }),
    );
    render(<App adapter={adapterWith({ kind: "success", items })} />);

    const date = await screen.findByLabelText("Дата до");
    await user.type(date, "2026-01-31");
    await user.click(screen.getByRole("button", { name: "Найти сделки" }));
    await user.click(
      await screen.findByRole("button", { name: "Следующая страница" }),
    );
    expect(screen.getByText("Страница 2 из 3")).toBeInTheDocument();

    await user.clear(date);
    await user.type(date, "2026-02-28");
    await user.click(screen.getByRole("button", { name: "Найти сделки" }));

    expect(await screen.findByText("Страница 1 из 3")).toBeInTheDocument();
  });
});
