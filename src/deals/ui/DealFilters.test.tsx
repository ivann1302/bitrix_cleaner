import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TEST_LEAD_FILTER_OPTIONS } from "../../test/dealFixtures";
import { DealFilters } from "./DealFilters";

describe("DealFilters lead branch", () => {
  it("shows failed lead statuses without a pipeline control", () => {
    render(
      <DealFilters
        draft={{
          entity: "lead",
          dateField: "createdAt",
          beforeDate: "2026-01-31",
          statusId: "",
          assignedById: "",
        }}
        options={TEST_LEAD_FILTER_OPTIONS}
        errors={{}}
        loading={false}
        onDraftChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Неуспешный статус")).toBeVisible();
    expect(screen.queryByLabelText("Воронка")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Найти лиды" })).toBeVisible();
  });
});
