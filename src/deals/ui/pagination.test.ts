import { describe, expect, it } from "vitest";
import { createDeal } from "../../test/dealFixtures";
import {
  PREVIEW_PAGE_SIZE,
  getPreviewPageCount,
  getPreviewPageItems,
} from "./pagination";

describe("preview pagination", () => {
  it("uses pages of 25 rows", () => {
    expect(PREVIEW_PAGE_SIZE).toBe(25);
    expect(getPreviewPageCount(0)).toBe(1);
    expect(getPreviewPageCount(1)).toBe(1);
    expect(getPreviewPageCount(50)).toBe(2);
    expect(getPreviewPageCount(51)).toBe(3);
  });

  it("returns the final deal from a 51-item result on page three", () => {
    const deals = Array.from({ length: 51 }, (_, index) =>
      createDeal({ id: String(index + 1), title: `Сделка ${index + 1}` }),
    );

    expect(getPreviewPageItems(deals, 3)).toEqual([
      expect.objectContaining({ id: "51" }),
    ]);
  });
});
