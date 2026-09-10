import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BootstrapError } from "./BootstrapError";

describe("BootstrapError", () => {
  it("shows a safe no-change message and offers an explicit retry", async () => {
    const reload = vi.fn();
    render(<BootstrapError onReload={reload} />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Никакие данные не изменялись.",
    );
    expect(document.body).not.toHaveTextContent("access_token");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Повторить" }));
    expect(reload).toHaveBeenCalledOnce();
  });
});
