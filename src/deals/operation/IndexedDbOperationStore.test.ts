import { afterEach, describe, expect, it, vi } from "vitest";
import { IndexedDbOperationStore } from "./IndexedDbOperationStore";

const context = {
  portal: "demo.local",
  userId: "1",
  entity: "deal" as const,
  isAdmin: true,
};
afterEach(() => vi.unstubAllGlobals());

describe("IndexedDbOperationStore availability", () => {
  it("fails closed when IndexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const store = new IndexedDbOperationStore();
    await expect(store.load(context)).rejects.toThrow("STORAGE_UNAVAILABLE");
    await expect(
      store.save({
        schemaVersion: 1,
        operationId: "op-1",
        context,
        createdAt: 1,
        status: "running",
        items: [{ id: "1", status: "pending", attempts: 0 }],
      }),
    ).rejects.toThrow("STORAGE_UNAVAILABLE");
  });
});
