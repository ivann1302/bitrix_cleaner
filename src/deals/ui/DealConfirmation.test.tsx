import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TEST_FILTER_OPTIONS,
  TEST_LEAD_FILTER_OPTIONS,
} from "../../test/dealFixtures";
import type { SelectionSnapshot } from "../domain/confirmation";
import { DealConfirmation } from "./DealConfirmation";

const snapshot: SelectionSnapshot = {
  context: {
    portal: "demo.local",
    userId: "demo-admin",
    entity: "deal",
    isAdmin: true,
  },
  revision: 1,
  selectionVersion: 0,
  collectedAt: 1000,
  criteria: {
    entity: "deal",
    dateField: "createdAt",
    beforeDate: "2026-01-31",
    pipelineId: null,
    stageId: null,
    assignedById: null,
  },
  ids: ["1", "3"],
};

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(2000);
  // jsdom has no modal top layer. Keep our dialog's open/close boundary observable.
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
afterEach(() => vi.restoreAllMocks());

describe("DealConfirmation", () => {
  it("uses lead-specific confirmation wording and criteria", async () => {
    const leadSnapshot: SelectionSnapshot = {
      ...snapshot,
      context: { ...snapshot.context, entity: "lead" },
      criteria: {
        entity: "lead",
        dateField: "createdAt",
        beforeDate: "2026-01-31",
        statusId: "JUNK",
        assignedById: null,
      },
      ids: ["1", "2", "3"],
    };
    render(
      <DealConfirmation
        snapshot={leadSnapshot}
        options={TEST_LEAD_FILTER_OPTIONS}
        onConfirm={vi.fn()}
      />,
    );

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "К подтверждению" }));

    expect(
      screen.getByRole("button", { name: "Удалить 3 демо-лида" }),
    ).toBeEnabled();
    expect(screen.getByText(/Статус: Забракован/)).toBeVisible();
  });

  it("returns focus to the explanation if the trigger became disabled", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <DealConfirmation
        snapshot={snapshot}
        options={TEST_FILTER_OPTIONS}
        onConfirm={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "К подтверждению" }));
    rerender(
      <DealConfirmation
        snapshot={null}
        options={TEST_FILTER_OPTIONS}
        onConfirm={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Отмена" }));
    expect(
      screen.getByRole("region", { name: "Подготовка демо-удаления" }),
    ).toHaveFocus();
  });
  it("shows the exact portal and count, sends no command until explicit confirmation", async () => {
    const user = userEvent.setup();
    const confirm = vi.fn();
    render(
      <DealConfirmation
        snapshot={snapshot}
        options={TEST_FILTER_OPTIONS}
        onConfirm={confirm}
      />,
    );
    await user.click(screen.getByRole("button", { name: "К подтверждению" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("demo.local");
    expect(confirm).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Удалить 2 демо-сделки" }),
    );
    expect(confirm).toHaveBeenCalledExactlyOnceWith(snapshot);
  });

  it("cancel returns focus without executing", async () => {
    const user = userEvent.setup();
    const confirm = vi.fn();
    render(
      <DealConfirmation
        snapshot={snapshot}
        options={TEST_FILTER_OPTIONS}
        onConfirm={confirm}
      />,
    );
    const trigger = screen.getByRole("button", { name: "К подтверждению" });
    await user.click(trigger);
    expect(screen.getByRole("button", { name: "Отмена" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Отмена" }));
    expect(trigger).toHaveFocus();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("rejects expiry at click time even before the timer updates", async () => {
    const user = userEvent.setup();
    const confirm = vi.fn();
    render(
      <DealConfirmation
        snapshot={snapshot}
        options={TEST_FILTER_OPTIONS}
        onConfirm={confirm}
      />,
    );
    await user.click(screen.getByRole("button", { name: "К подтверждению" }));
    vi.mocked(Date.now).mockReturnValue(601000);
    await user.click(
      screen.getByRole("button", { name: "Удалить 2 демо-сделки" }),
    );
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/новый поиск/i);
  });

  it("blocks incomplete, stale or empty selections", () => {
    render(
      <DealConfirmation
        snapshot={null}
        options={TEST_FILTER_OPTIONS}
        onConfirm={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "К подтверждению" }),
    ).toBeDisabled();
  });

  it("rejects a changed selection while the dialog is open", async () => {
    const user = userEvent.setup();
    const confirm = vi.fn();
    const { rerender } = render(
      <DealConfirmation
        snapshot={snapshot}
        options={TEST_FILTER_OPTIONS}
        onConfirm={confirm}
      />,
    );
    await user.click(screen.getByRole("button", { name: "К подтверждению" }));
    rerender(
      <DealConfirmation
        snapshot={{ ...snapshot, selectionVersion: 1, ids: ["1"] }}
        options={TEST_FILTER_OPTIONS}
        onConfirm={confirm}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Удалить 2 демо-сделки" }),
    ).toBeDisabled();
    expect(confirm).not.toHaveBeenCalled();
  });
});
