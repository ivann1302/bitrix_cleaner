import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { OperationRecord } from "../operation/types";
import { OperationProgress } from "./OperationProgress";

describe("OperationProgress entity wording", () => {
  it("announces the retry delay and keeps pause and stop available", () => {
    const record: OperationRecord = {
      schemaVersion: 1,
      operationId: "retry",
      context: {
        portal: "demo.local",
        userId: "demo-admin",
        entity: "deal",
        isAdmin: true,
      },
      createdAt: 1,
      status: "running",
      items: [
        { id: "1", status: "error", attempts: 1, errorCode: "rate-limit" },
      ],
    };
    const props = {
      record,
      busy: true,
      retryWait: { id: "1", nextAttempt: 2, delayMs: 1500 },
      onPause: vi.fn(),
      onResume: vi.fn(),
      onStop: vi.fn(),
    };
    const { rerender } = render(<OperationProgress {...props} />);
    expect(screen.getByRole("status")).toHaveTextContent(/Ожидаем.*2 с/);
    expect(screen.getByRole("status")).toHaveTextContent(/попытка 2 из 3/);
    expect(screen.getByRole("button", { name: "Пауза" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Остановить новые запросы" }),
    ).toBeEnabled();
    rerender(
      <OperationProgress {...props} record={{ ...record, status: "paused" }} />,
    );
    expect(screen.getByRole("status")).not.toHaveTextContent(/Ожидаем/);
    expect(screen.getByRole("button", { name: "Продолжить" })).toBeEnabled();
  });
  it("reports completed lead results with lead wording", () => {
    const record: OperationRecord = {
      schemaVersion: 1,
      operationId: "lead-operation",
      context: {
        portal: "demo.local",
        userId: "demo-admin",
        entity: "lead",
        isAdmin: true,
      },
      createdAt: 1,
      status: "completed",
      items: [
        { id: "1", status: "deleted", attempts: 1 },
        { id: "2", status: "error", attempts: 1, errorCode: "temporary" },
      ],
    };
    render(
      <OperationProgress
        record={record}
        busy={false}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    expect(screen.getByText(/Лиды/)).toBeVisible();
    expect(screen.getByText("Удалено лидов: 1 · Ошибок: 1")).toBeVisible();
  });
});
