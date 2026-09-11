import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { MockBitrixAdapter } from "../deals/data/MockBitrixAdapter";
import type {
  OperationRecord,
  OperationStore,
  OperationLock,
} from "../deals/operation/types";
import { createDeal, createLead } from "../test/dealFixtures";
import { App } from "./App";

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
});

function services() {
  let saved: OperationRecord | null = null;
  const store: OperationStore = {
    save: (value) => {
      saved = structuredClone(value);
      return Promise.resolve();
    },
    load: () => Promise.resolve(saved),
  };
  let locked = false;
  const lock: OperationLock = {
    async runExclusive(_key, work) {
      if (locked) return false;
      locked = true;
      try {
        await work();
        return true;
      } finally {
        locked = false;
      }
    },
  };
  return { store, lock, saved: () => saved };
}

describe("local operation flow", () => {
  it("searches, excludes, confirms, and deletes only selected demo leads", async () => {
    const user = userEvent.setup();
    const adapter = new MockBitrixAdapter({
      leads: [createLead(), createLead({ id: "42", title: "Сохранить лид" })],
    });
    const storage = services();
    render(<App adapter={adapter} operationServices={storage} />);

    await user.click(screen.getByRole("radio", { name: "Лиды" }));
    await user.type(await screen.findByLabelText("Дата до"), "2026-12-31");
    await user.click(screen.getByRole("button", { name: "Найти лиды" }));
    await user.click(
      await screen.findByRole("button", { name: "Исключить Сохранить лид" }),
    );
    await user.click(screen.getByRole("button", { name: "К подтверждению" }));
    await user.click(
      screen.getByRole("button", { name: "Удалить 1 демо-лид" }),
    );

    expect(await screen.findByText("Операция завершена")).toBeVisible();
    expect(storage.saved()?.context.entity).toBe("lead");
    expect(storage.saved()?.items).toEqual([
      { id: "41", status: "deleted", attempts: 1 },
    ]);
  });

  it("search → exclusion → confirmation → result keeps excluded deal", async () => {
    const user = userEvent.setup();
    const adapter = new MockBitrixAdapter({
      deals: [createDeal(), createDeal({ id: "2", title: "Сохранить" })],
    });
    const storage = services();
    render(<App adapter={adapter} operationServices={storage} />);
    await user.type(await screen.findByLabelText("Дата до"), "2026-01-31");
    await user.click(screen.getByRole("button", { name: "Найти сделки" }));
    await user.click(
      await screen.findByRole("button", { name: "Исключить Сохранить" }),
    );
    await user.click(screen.getByRole("button", { name: "К подтверждению" }));
    expect(storage.saved()).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Удалить 1 демо-сделку" }),
    );
    expect(await screen.findByText("Операция завершена")).toBeInTheDocument();
    expect(storage.saved()?.items).toEqual([
      { id: "1", status: "deleted", attempts: 1 },
    ]);
    await user.click(screen.getByRole("button", { name: "Найти сделки" }));
    expect(
      await screen.findByRole("group", { name: "Найдено 1" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Сохранить")).toBeInTheDocument();
  });

  it("fails closed when checkpoint storage is unavailable", async () => {
    const user = userEvent.setup();
    const storage = services();
    storage.store.load = () =>
      Promise.reject(new Error("private path/token must not leak"));
    render(
      <App
        adapter={new MockBitrixAdapter({ deals: [createDeal()] })}
        operationServices={storage}
      />,
    );
    await user.type(await screen.findByLabelText("Дата до"), "2026-01-31");
    await user.click(screen.getByRole("button", { name: "Найти сделки" }));
    expect(
      await screen.findByText(/Локальное хранилище недоступно/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "К подтверждению" }),
    ).toBeDisabled();
    expect(storage.saved()).toBeNull();
    expect(document.body).not.toHaveTextContent("private path/token");
  });

  it("shows saved sent IDs as unknown on reopen without auto execution", async () => {
    const storage = services();
    await storage.store.save({
      schemaVersion: 1,
      operationId: "old",
      context: {
        portal: "demo.local",
        userId: "demo-admin",
        entity: "deal",
        isAdmin: true,
      },
      createdAt: 1000,
      status: "running",
      items: [{ id: "1", status: "sent", attempts: 1 }],
    });
    render(
      <App
        adapter={new MockBitrixAdapter({ deals: [createDeal()] })}
        operationServices={storage}
      />,
    );
    expect(await screen.findByText("Операция прервана")).toBeInTheDocument();
    expect(screen.getByText("Неизвестно: 1")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Дата до")).toBeEnabled());
    expect(storage.saved()?.items[0]?.status).toBe("sent");
    expect(
      screen.queryByRole("button", { name: "Продолжить" }),
    ).not.toBeInTheDocument();
  });
});
