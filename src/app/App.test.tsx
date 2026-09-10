import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("явно показывает локальный режим сделок", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Старые проигранные сделки" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Демо-режим")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /удалить/i }),
    ).not.toBeInTheDocument();
  });
});
