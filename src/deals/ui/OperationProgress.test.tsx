import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { OperationRecord } from "../operation/types";
import { OperationProgress } from "./OperationProgress";

describe("OperationProgress entity wording", () => {
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
