import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDeal,
  createLead,
  TEST_FILTER_OPTIONS,
} from "../../test/dealFixtures";
import { DealCsvExport } from "./DealCsvExport";
import { DealPreview } from "./DealPreview";
import { MOCK_APP_CONTEXT } from "../data/mockContext";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function downloadBoundary() {
  const createObjectURL = vi
    .fn<(blob: Blob) => string>()
    .mockReturnValue("blob:csv-test");
  const revokeObjectURL = vi.fn();
  const filenames: string[] = [];
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(function (this: HTMLAnchorElement) {
      filenames.push(this.download);
    });
  return { createObjectURL, revokeObjectURL, click, filenames };
}

describe("DealCsvExport", () => {
  it("downloads leads with an entity-specific filename", async () => {
    const boundary = downloadBoundary();
    render(
      <DealCsvExport
        entity="lead"
        items={[createLead()]}
        excludedIds={new Set()}
      />,
    );

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Скачать CSV/ }));

    expect(boundary.filenames).toEqual(["crm-cleaner-leads.csv"]);
  });

  it("blocks exporting an empty selection", () => {
    render(
      <DealCsvExport
        entity="deal"
        items={[createDeal()]}
        excludedIds={new Set(["1"])}
      />,
    );
    expect(screen.getByRole("button", { name: /Скачать CSV/ })).toBeDisabled();
  });

  it("downloads all preview pages with exclusions through a CSV Blob", async () => {
    const boundary = downloadBoundary();
    const user = userEvent.setup();
    render(
      <DealPreview
        state={{
          kind: "ready",
          revision: 1,
          collectedAt: Date.now(),
          selectionVersion: 1,
          criteria: {
            entity: "deal",
            dateField: "createdAt",
            beforeDate: "2026-01-31",
            pipelineId: null,
            stageId: null,
            assignedById: null,
          },
          items: Array.from({ length: 51 }, (_, i) =>
            createDeal({ id: String(i + 1) }),
          ),
          excludedIds: new Set(["26"]),
        }}
        options={TEST_FILTER_OPTIONS}
        context={MOCK_APP_CONTEXT}
        mode="demo"
        onToggleExcluded={() => undefined}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Скачать CSV/ }));
    const blob = boundary.createObjectURL.mock.calls[0]?.[0];
    expect(blob?.type).toBe("text/csv;charset=utf-8");
    const contents = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") resolve(reader.result);
        else reject(new Error("Expected CSV text"));
      };
      reader.onerror = () => reject(new Error("read failed"));
      if (blob) reader.readAsText(blob);
      else reject(new Error("Missing Blob"));
    });
    expect(contents).toContain('\r\n"51",');
    expect(contents).not.toContain('\r\n"26",');
    expect(boundary.click).toHaveBeenCalledOnce();
    expect(document.querySelector("a[download]")).toBeNull();
  });

  it("cleans up the object URL on unmount", async () => {
    const boundary = downloadBoundary();
    const { unmount } = render(
      <DealCsvExport
        entity="deal"
        items={[createDeal()]}
        excludedIds={new Set()}
      />,
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Скачать CSV/ }));
    unmount();
    expect(boundary.revokeObjectURL).toHaveBeenCalledWith("blob:csv-test");
  });

  it("shows safe retryable errors and releases the URL when download fails", async () => {
    const boundary = downloadBoundary();
    boundary.click.mockImplementationOnce(() => {
      throw new Error("secret internal path");
    });
    render(
      <DealCsvExport
        entity="deal"
        items={[createDeal()]}
        excludedIds={new Set()}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Скачать CSV/ }));
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      "secret internal path",
    );
    expect(boundary.revokeObjectURL).toHaveBeenCalledWith("blob:csv-test");
    await user.click(screen.getByRole("button", { name: /Скачать CSV/ }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
