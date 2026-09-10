export const PREVIEW_PAGE_SIZE = 25;

export function getPreviewPageCount(itemCount: number): number {
  return Math.max(1, Math.ceil(itemCount / PREVIEW_PAGE_SIZE));
}

export function getPreviewPageItems<T>(
  items: readonly T[],
  page: number,
): readonly T[] {
  const safePage = Math.min(
    Math.max(1, page),
    getPreviewPageCount(items.length),
  );
  const start = (safePage - 1) * PREVIEW_PAGE_SIZE;
  return items.slice(start, start + PREVIEW_PAGE_SIZE);
}
