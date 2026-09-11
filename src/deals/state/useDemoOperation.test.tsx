import { StrictMode, type PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createSelectionSnapshot } from "../domain/confirmation";
import type { OperationContext } from "../domain/confirmation";
import { MOCK_CONTEXT } from "../data/mockContext";
import type {
  DeleteOutcome,
  DeleteTransport,
  OperationRecord,
  OperationStore,
} from "../operation/types";
import { createDeal } from "../../test/dealFixtures";
import { useDemoOperation, type OperationServices } from "./useDemoOperation";

function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error("Not initialized");
  };
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function selection(revision = 1) {
  const now = Date.now();
  const result = createSelectionSnapshot(
    {
      context: MOCK_CONTEXT,
      revision,
      selectionVersion: 0,
      criteria: {
        entity: "deal",
        dateField: "createdAt",
        beforeDate: "2026-01-01",
        pipelineId: null,
        stageId: null,
        assignedById: null,
      },
      collectedAt: now,
      items: [createDeal(), createDeal({ id: "2" })],
      excludedIds: new Set<string>(),
    },
    now,
  );
  if (!result) throw new Error("Invalid fixture");
  return result;
}

function services(load: OperationStore["load"] = () => Promise.resolve(null)) {
  let saved: OperationRecord | null = null;
  let held = false;
  const dependencies: OperationServices = {
    store: {
      load,
      save: (record) => {
        saved = record;
        return Promise.resolve();
      },
    },
    lock: {
      runExclusive: async (_key, work) => {
        if (held) return false;
        held = true;
        try {
          await work();
          return true;
        } finally {
          held = false;
        }
      },
    },
  };
  return { dependencies, saved: () => saved, held: () => held };
}

function delayedTransport() {
  const response = deferred<DeleteOutcome>();
  const sent = deferred<void>();
  const calls: string[] = [];
  const transport: DeleteTransport = {
    deleteItem: (id) => {
      calls.push(id);
      sent.resolve();
      return response.promise;
    },
  };
  return { response, sent, calls, transport };
}

describe("useDemoOperation lifecycle", () => {
  it("ignores a late deal checkpoint after switching to leads with the same services", async () => {
    const oldLoad = deferred<OperationRecord | null>();
    const loaded: string[] = [];
    const storage = services((context) => {
      loaded.push(context.entity);
      return context.entity === "deal"
        ? oldLoad.promise
        : Promise.resolve(null);
    });
    const delayed = delayedTransport();
    const { result, rerender } = renderHook(
      ({ context }: { context: OperationContext }) =>
        useDemoOperation(
          null,
          delayed.transport,
          storage.dependencies,
          context,
        ),
      { initialProps: { context: MOCK_CONTEXT } },
    );
    rerender({ context: { ...MOCK_CONTEXT, entity: "lead" } });
    await waitFor(() => expect(result.current.storage).toBe("ready"));
    await act(async () => {
      oldLoad.resolve({
        schemaVersion: 1,
        operationId: "old-deal",
        context: MOCK_CONTEXT,
        createdAt: Date.now(),
        status: "running",
        items: [{ id: "1", status: "sent", attempts: 1 }],
      });
      await oldLoad.promise;
    });
    expect(loaded).toEqual(["deal", "lead"]);
    expect(result.current.record).toBeNull();
    expect(delayed.calls).toEqual([]);
  });

  it("resets busy on dependency replacement and blocks start until the replacement store is ready", async () => {
    const original = services();
    const pendingLoad = deferred<OperationRecord | null>();
    const replacement = services(() => pendingLoad.promise);
    const first = delayedTransport();
    const second = delayedTransport();
    const initial = selection();
    const next = selection(2);
    const { result, rerender } = renderHook(
      ({ snapshot, transport, dependencies }) =>
        useDemoOperation(snapshot, transport, dependencies),
      {
        initialProps: {
          snapshot: initial,
          transport: first.transport,
          dependencies: original.dependencies,
        },
      },
    );
    await waitFor(() => expect(result.current.storage).toBe("ready"));
    act(() => result.current.start(initial));
    await first.sent.promise;
    expect(result.current.busy).toBe(true);
    rerender({
      snapshot: next,
      transport: second.transport,
      dependencies: replacement.dependencies,
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.storage).toBe("loading");
    expect(result.current.record).toBeNull();
    expect(result.current.usedRevision).toBeNull();
    act(() => result.current.start(next));
    expect(second.calls).toEqual([]);
    await act(async () => {
      pendingLoad.resolve(null);
      await pendingLoad.promise;
    });
    await waitFor(() => expect(result.current.storage).toBe("ready"));
    act(() => result.current.start(next));
    await second.sent.promise;
    expect(result.current.busy).toBe(true);
    await act(async () => {
      first.response.resolve({ kind: "deleted" });
      await first.response.promise;
    });
    await waitFor(() => expect(original.held()).toBe(false));
    expect(result.current.busy).toBe(true);
    expect(result.current.record?.items[0]?.status).toBe("sent");
    expect(first.calls).toEqual(["1"]);
    await act(async () => {
      second.response.resolve({ kind: "deleted" });
      await second.response.promise;
    });
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(second.calls).toEqual(["1", "2"]);
  });

  it("does not stop an active operation when only the services wrapper changes", async () => {
    const storage = services();
    const delayed = delayedTransport();
    const snapshot = selection();
    const { result, rerender } = renderHook(
      ({ dependencies }) =>
        useDemoOperation(snapshot, delayed.transport, dependencies),
      { initialProps: { dependencies: storage.dependencies } },
    );
    await waitFor(() => expect(result.current.storage).toBe("ready"));
    act(() => result.current.start(snapshot));
    await delayed.sent.promise;
    rerender({ dependencies: { ...storage.dependencies } });
    expect(result.current.busy).toBe(true);
    await act(async () => {
      delayed.response.resolve({ kind: "deleted" });
      await delayed.response.promise;
    });
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(delayed.calls).toEqual(["1", "2"]);
    expect(result.current.record?.status).toBe("completed");
  });

  it("does not let a stale store load overwrite replacement state", async () => {
    const oldLoad = deferred<OperationRecord | null>();
    const old = services(() => oldLoad.promise);
    const replacement = services();
    const delayed = delayedTransport();
    const snapshot = selection();
    const { result, rerender } = renderHook(
      ({ dependencies }) =>
        useDemoOperation(snapshot, delayed.transport, dependencies),
      { initialProps: { dependencies: old.dependencies } },
    );
    rerender({ dependencies: replacement.dependencies });
    await waitFor(() => expect(result.current.storage).toBe("ready"));
    await act(async () => {
      oldLoad.resolve({
        schemaVersion: 1,
        operationId: "stale",
        context: MOCK_CONTEXT,
        createdAt: Date.now(),
        status: "running",
        items: [{ id: "1", status: "sent", attempts: 1 }],
      });
      await oldLoad.promise;
    });
    expect(result.current.record).toBeNull();
    expect(result.current.error).toBe(false);
    expect(delayed.calls).toEqual([]);
  });

  it("works in StrictMode and stops further sends after unmount", async () => {
    const storage = services();
    const delayed = delayedTransport();
    const snapshot = selection();
    const wrapper = ({ children }: PropsWithChildren) => (
      <StrictMode>{children}</StrictMode>
    );
    const { result, unmount } = renderHook(
      () => useDemoOperation(snapshot, delayed.transport, storage.dependencies),
      { wrapper },
    );
    await waitFor(() => expect(result.current.storage).toBe("ready"));
    expect(delayed.calls).toEqual([]);
    act(() => result.current.start(snapshot));
    await delayed.sent.promise;
    expect(delayed.calls).toEqual(["1"]);
    unmount();
    await act(async () => {
      delayed.response.resolve({ kind: "deleted" });
      await delayed.response.promise;
    });
    await waitFor(() => expect(storage.held()).toBe(false));
    expect(delayed.calls).toEqual(["1"]);
    expect(storage.saved()?.status).toBe("stopped");
    expect(storage.saved()?.items[1]?.status).toBe("pending");
  });
});
