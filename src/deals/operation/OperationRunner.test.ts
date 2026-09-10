import { describe, expect, it } from "vitest";
import {
  createSelectionSnapshot,
  type SelectionSnapshot,
} from "../domain/confirmation";
import { createDeal } from "../../test/dealFixtures";
import { OperationRunner } from "./OperationRunner";
import type { DeleteOutcome, OperationRecord } from "./types";

function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error("Not initialized");
  };
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fixture(ids = ["1", "2"], retainHistory = true) {
  let clock = 1_000_000;
  const selected = createSelectionSnapshot(
    {
      context: {
        portal: "mock.example",
        userId: "1",
        entity: "deal",
        isAdmin: true,
      },
      criteria: {
        entity: "deal",
        dateField: "createdAt",
        beforeDate: "2026-01-01",
        pipelineId: null,
        stageId: null,
        assignedById: null,
      },
      revision: 1,
      selectionVersion: 0,
      collectedAt: clock,
      items: ids.map((id) => createDeal({ id })),
      excludedIds: new Set<string>(),
    },
    clock,
  );
  if (!selected) throw new Error("Invalid fixture");
  let current: SelectionSnapshot | null = selected;
  const calls: string[] = [];
  const events: string[] = [];
  const updates: OperationRecord[] = [];
  const saved: OperationRecord[] = [];
  let held = false;
  let lockAvailable = true;
  let onLock = () => {};
  let loadImpl: () => Promise<OperationRecord | null> = () =>
    Promise.resolve(null);
  let deleteImpl: (id: string) => Promise<DeleteOutcome> = () =>
    Promise.resolve({ kind: "deleted" });
  let saveImpl: (record: OperationRecord) => Promise<void> = () =>
    Promise.resolve();
  let waitImpl: (ms: number) => Promise<void> = () => Promise.resolve();
  const runner = new OperationRunner({
    store: {
      load: () => loadImpl(),
      save: async (record) => {
        if (retainHistory)
          events.push(
            `save:${record.items.map((item) => item.status).join(",")}`,
          );
        await saveImpl(record);
        if (!retainHistory) saved.length = 0;
        saved.push(record);
      },
    },
    lock: {
      runExclusive: async (key, work) => {
        events.push(`lock:${key}`);
        if (held || !lockAvailable) return false;
        held = true;
        try {
          onLock();
          await work();
        } finally {
          held = false;
        }
        return true;
      },
    },
    transport: {
      deleteDeal: async (id) => {
        calls.push(id);
        events.push(`delete:${id}`);
        return deleteImpl(id);
      },
    },
    getCurrentSnapshot: () => current,
    now: () => clock,
    wait: (ms) => waitImpl(ms),
    onUpdate: (record) => {
      if (!retainHistory) updates.length = 0;
      updates.push(record);
    },
  });
  return {
    runner,
    selected,
    calls,
    events,
    updates,
    saved,
    setCurrent: (value: SelectionSnapshot | null) => {
      current = value;
    },
    setClock: (value: number) => {
      clock = value;
    },
    setDelete: (fn: typeof deleteImpl) => {
      deleteImpl = fn;
    },
    setSave: (fn: typeof saveImpl) => {
      saveImpl = fn;
    },
    setWait: (fn: typeof waitImpl) => {
      waitImpl = fn;
    },
    held: () => held,
    setLockAvailable: (value: boolean) => {
      lockAvailable = value;
    },
    setOnLock: (fn: () => void) => {
      onLock = fn;
    },
    setLoad: (fn: typeof loadImpl) => {
      loadImpl = fn;
    },
  };
}

describe("OperationRunner", () => {
  it.each([
    {
      name: "empty IDs",
      invalid: (snapshot: SelectionSnapshot): SelectionSnapshot => ({
        ...snapshot,
        ids: [],
      }),
      clock: 1_000_000,
    },
    {
      name: "3001 IDs",
      invalid: (snapshot: SelectionSnapshot): SelectionSnapshot => ({
        ...snapshot,
        ids: Array.from({ length: 3001 }, (_, index) => String(index + 1)),
      }),
      clock: 1_000_000,
    },
    {
      name: "blank criteria",
      invalid: (snapshot: SelectionSnapshot): SelectionSnapshot => ({
        ...snapshot,
        criteria: { ...snapshot.criteria, beforeDate: null },
      }),
      clock: 1_000_000,
    },
    {
      name: "non-administrator",
      invalid: (snapshot: SelectionSnapshot): SelectionSnapshot => ({
        ...snapshot,
        context: { ...snapshot.context, isAdmin: false },
      }),
      clock: 1_000_000,
    },
    {
      name: "expired preview",
      invalid: (snapshot: SelectionSnapshot): SelectionSnapshot => snapshot,
      clock: 1_600_000,
    },
  ])(
    "rejects $name before any lock, storage or transport access",
    async ({ invalid, clock }) => {
      const f = fixture();
      const snapshot = invalid(f.selected);
      let loads = 0;
      f.setLoad(() => {
        loads += 1;
        return Promise.resolve(null);
      });
      f.setCurrent(snapshot);
      f.setClock(clock);
      await expect(f.runner.start(snapshot)).rejects.toThrow(
        "selection-invalid",
      );
      expect(f.events).toEqual([]);
      expect(loads).toBe(0);
      expect(f.saved).toEqual([]);
      expect(f.calls).toEqual([]);
    },
  );

  it("saves intent before sending and records each result sequentially", async () => {
    const f = fixture();
    await f.runner.start(f.selected);
    expect(f.calls).toEqual(["1", "2"]);
    expect(f.events.indexOf("save:sent,pending")).toBeLessThan(
      f.events.indexOf("delete:1"),
    );
    expect(f.events.indexOf("save:deleted,sent")).toBeLessThan(
      f.events.indexOf("delete:2"),
    );
    expect(f.saved.at(-1)?.status).toBe("completed");
    expect(f.saved.at(-1)?.items).toEqual([
      { id: "1", status: "deleted", attempts: 1 },
      { id: "2", status: "deleted", attempts: 1 },
    ]);
    expect(f.events[0]).toBe('lock:["mock.example","1","deal"]');
    expect(f.held()).toBe(false);
  });
  it("waits for persistence and never runs two deletes together", async () => {
    const f = fixture();
    const writing = deferred<void>();
    const entered = deferred<void>();
    f.setSave(async (record) => {
      if (record.items[0]?.status === "sent") {
        entered.resolve();
        await writing.promise;
      }
    });
    const response = deferred<DeleteOutcome>();
    const sent = deferred<void>();
    f.setDelete(async () => {
      sent.resolve();
      return response.promise;
    });
    const running = f.runner.start(f.selected);
    await entered.promise;
    expect(f.calls).toEqual([]);
    writing.resolve();
    await sent.promise;
    expect(f.calls).toEqual(["1"]);
    f.runner.stop();
    response.resolve({ kind: "deleted" });
    await running;
    expect(f.calls).toEqual(["1"]);
    expect(f.updates.at(-1)?.status).toBe("stopped");
  });
  it("rejects concurrent starts and reuse after completion", async () => {
    const f = fixture();
    const running = f.runner.start(f.selected);
    await expect(f.runner.start(f.selected)).rejects.toThrow();
    await running;
    await expect(
      f.runner.start({ ...f.selected, ids: ["2", "1"] }),
    ).rejects.toThrow();
    expect(f.calls).toEqual(["1", "2"]);
  });
  it("does not retry unknown results or thrown transport errors", async () => {
    const f = fixture();
    f.setDelete((id) =>
      id === "1"
        ? Promise.resolve({ kind: "unknown" })
        : Promise.reject(new Error("secret transport detail")),
    );
    await f.runner.start(f.selected);
    expect(f.calls).toEqual(["1", "2"]);
    expect(f.updates.at(-1)?.items.map((item) => item.status)).toEqual([
      "unknown",
      "unknown",
    ]);
    expect(JSON.stringify(f.updates)).not.toContain("secret transport detail");
  });
  it("caps temporary retries to three attempts and bounds the delay", async () => {
    const f = fixture(["1"]);
    const delays: number[] = [];
    f.setDelete(() =>
      Promise.resolve({
        kind: "error",
        code: "rate-limit",
        temporary: true,
        retryAfterMs: 100_000,
      }),
    );
    f.setWait((ms) => {
      delays.push(ms);
      return Promise.resolve();
    });
    await f.runner.start(f.selected);
    expect(f.calls).toEqual(["1", "1", "1"]);
    expect(delays).toHaveLength(2);
    expect(delays.every((ms) => ms >= 0 && ms <= 5000)).toBe(true);
    expect(f.updates.at(-1)?.items[0]).toEqual({
      id: "1",
      status: "error",
      attempts: 3,
      errorCode: "rate-limit",
    });
  });
  it.each(["access-denied", "unauthorized", "forbidden"])(
    "stops on rights error %s even if labeled temporary",
    async (code) => {
      const f = fixture();
      f.setDelete(() =>
        Promise.resolve({ kind: "error", code, temporary: true }),
      );
      await f.runner.start(f.selected);
      expect(f.calls).toEqual(["1"]);
      expect(f.updates.at(-1)?.status).toBe("stopped");
    },
  );
  it("continues after a permanent item error without retrying it", async () => {
    const f = fixture();
    f.setDelete((id) =>
      Promise.resolve(
        id === "1"
          ? { kind: "error", code: "invalid-parameters", temporary: false }
          : { kind: "deleted" },
      ),
    );
    await f.runner.start(f.selected);
    expect(f.calls).toEqual(["1", "2"]);
    expect(f.updates.at(-1)?.items.map((item) => item.status)).toEqual([
      "error",
      "deleted",
    ]);
  });
  it("holds the lock during pause and continues only after explicit resume", async () => {
    const f = fixture();
    const response = deferred<DeleteOutcome>();
    const entered = deferred<void>();
    const paused = deferred<void>();
    f.setDelete(async (id) => {
      if (id === "1") {
        entered.resolve();
        return response.promise;
      }
      return { kind: "deleted" };
    });
    f.setSave((record) => {
      if (record.status === "paused" && record.items[0]?.status === "deleted")
        paused.resolve();
      return Promise.resolve();
    });
    const running = f.runner.start(f.selected);
    await entered.promise;
    f.runner.pause();
    response.resolve({ kind: "deleted" });
    await paused.promise;
    expect(f.calls).toEqual(["1"]);
    expect(f.held()).toBe(true);
    f.runner.resume();
    await running;
    expect(f.calls).toEqual(["1", "2"]);
  });
  it("stops when resuming an expired preview", async () => {
    const f = fixture();
    const entered = deferred<void>();
    const response = deferred<DeleteOutcome>();
    f.setDelete(async () => {
      entered.resolve();
      return response.promise;
    });
    const running = f.runner.start(f.selected);
    await entered.promise;
    f.runner.pause();
    f.setClock(1_600_000);
    f.runner.resume();
    response.resolve({ kind: "deleted" });
    await running;
    expect(f.calls).toEqual(["1"]);
    expect(f.updates.at(-1)?.status).toBe("stopped");
  });
  it("fails before lock access when confirmation is invalid", async () => {
    const f = fixture();
    f.setCurrent(null);
    await expect(f.runner.start(f.selected)).rejects.toThrow();
    expect(f.events).toEqual([]);
  });
  it("revalidates after awaiting checkpoint and before sending", async () => {
    const f = fixture();
    f.setSave((record) => {
      if (record.items[0]?.status === "sent")
        f.setCurrent({
          ...f.selected,
          context: { ...f.selected.context, portal: "different.example" },
        });
      return Promise.resolve();
    });
    await f.runner.start(f.selected);
    expect(f.calls).toEqual([]);
    expect(f.updates.at(-1)?.status).toBe("stopped");
  });
  it("stops sending after context changes during a transport request", async () => {
    const f = fixture();
    f.setDelete(() => {
      f.setCurrent(null);
      return Promise.resolve({ kind: "deleted" });
    });
    await f.runner.start(f.selected);
    expect(f.calls).toEqual(["1"]);
  });
  it("fails closed if the initial checkpoint cannot be written", async () => {
    const f = fixture();
    f.setSave(() => Promise.reject(new Error("secret storage path")));
    await expect(f.runner.start(f.selected)).rejects.toThrow(
      "checkpoint-unavailable",
    );
    expect(f.calls).toEqual([]);
    expect(f.held()).toBe(false);
  });
  it("reports unknown and sends no more if result persistence fails", async () => {
    const f = fixture();
    f.setSave((record) =>
      record.items[0]?.status === "deleted"
        ? Promise.reject(new Error("quota"))
        : Promise.resolve(),
    );
    await expect(f.runner.start(f.selected)).rejects.toThrow(
      "checkpoint-unavailable",
    );
    expect(f.calls).toEqual(["1"]);
    expect(f.updates.at(-1)?.items[0]?.status).toBe("unknown");
    expect(f.updates.at(-1)?.status).toBe("stopped");
  });
  it("delivers immutable records so observers cannot enlarge the selection", async () => {
    const f = fixture();
    await f.runner.start(f.selected);
    const record = f.updates[0];
    expect(record?.items.map((item) => item.status)).toEqual([
      "pending",
      "pending",
    ]);
    for (const object of [
      record,
      record?.context,
      record?.items,
      record?.items[0],
    ])
      expect(Object.isFrozen(object)).toBe(true);
  });
  it("handles 3000 selected IDs with one result each", async () => {
    const f = fixture(
      Array.from({ length: 3000 }, (_, i) => String(i + 1)),
      false,
    );
    await f.runner.start(f.selected);
    expect(f.calls).toHaveLength(3000);
    expect(new Set(f.calls).size).toBe(3000);
    expect(
      f.updates.at(-1)?.items.every((item) => item.status === "deleted"),
    ).toBe(true);
  }, 15_000);

  it("rejects a consumed selection even if context property order differs", async () => {
    const f = fixture();
    await f.runner.start(f.selected);
    await expect(
      f.runner.start({
        ...f.selected,
        context: {
          isAdmin: true,
          entity: "deal",
          userId: "1",
          portal: "mock.example",
        },
      }),
    ).rejects.toThrow("selection-consumed");
    expect(f.calls).toEqual(["1", "2"]);
  });

  it("rejects occupied lock without storage or transport calls", async () => {
    const f = fixture();
    f.setLockAvailable(false);
    await expect(f.runner.start(f.selected)).rejects.toThrow(
      "operation-locked",
    );
    expect(f.saved).toEqual([]);
    expect(f.calls).toEqual([]);
  });

  it("revalidates after acquiring lock and before accessing storage", async () => {
    const f = fixture();
    let loads = 0;
    f.setLoad(() => {
      loads += 1;
      return Promise.resolve(null);
    });
    f.setOnLock(() => f.setCurrent(null));
    await expect(f.runner.start(f.selected)).rejects.toThrow(
      "selection-invalid",
    );
    expect(loads).toBe(0);
    expect(f.calls).toEqual([]);
  });

  it("blocks storage load failure and masks its details", async () => {
    const f = fixture();
    f.setLoad(() => Promise.reject(new Error("secret URL")));
    await expect(f.runner.start(f.selected)).rejects.toThrow(
      "checkpoint-unavailable",
    );
    expect(f.saved).toEqual([]);
    expect(f.calls).toEqual([]);
  });

  it("copies the caller snapshot before waiting for the lock", async () => {
    const f = fixture();
    const ids = ["1", "2"];
    f.setOnLock(() => ids.push("3"));
    await f.runner.start({ ...f.selected, ids });
    expect(f.calls).toEqual(["1", "2"]);
  });

  it("sanitizes raw error details in persisted results", async () => {
    const f = fixture(["1"]);
    f.setDelete(() =>
      Promise.resolve({
        kind: "error",
        code: "secret URL https://example.test/?token=value",
        temporary: false,
      }),
    );
    await f.runner.start(f.selected);
    expect(f.saved.at(-1)?.items[0]?.errorCode).toBe("operation-error");
  });

  it("pauses during intent persistence without sending and releases lock on stop", async () => {
    const f = fixture();
    const paused = deferred<void>();
    let requestedPause = false;
    f.setSave((record) => {
      if (!requestedPause && record.items[0]?.status === "sent") {
        requestedPause = true;
        f.runner.pause();
      }
      if (record.status === "paused" && record.items[0]?.status === "pending")
        paused.resolve();
      return Promise.resolve();
    });
    const running = f.runner.start(f.selected);
    await paused.promise;
    expect(f.calls).toEqual([]);
    expect(f.held()).toBe(true);
    f.runner.stop();
    await running;
    expect(f.held()).toBe(false);
    expect(f.saved.at(-1)?.items[0]).toEqual({
      id: "1",
      status: "pending",
      attempts: 0,
    });
  });

  it("does not send if the sent checkpoint write fails", async () => {
    const f = fixture();
    f.setSave((record) =>
      record.items[0]?.status === "sent"
        ? Promise.reject(new Error("quota"))
        : Promise.resolve(),
    );
    await expect(f.runner.start(f.selected)).rejects.toThrow(
      "checkpoint-unavailable",
    );
    expect(f.calls).toEqual([]);
    expect(f.updates.at(-1)?.items[0]).toEqual({
      id: "1",
      status: "pending",
      attempts: 0,
    });
  });

  it("records a successful retry and proceeds to the next ID", async () => {
    const f = fixture();
    let attempts = 0;
    f.setDelete(() => {
      attempts += 1;
      return Promise.resolve(
        attempts === 1
          ? { kind: "error", code: "rate-limit", temporary: true }
          : { kind: "deleted" },
      );
    });
    await f.runner.start(f.selected);
    expect(f.calls).toEqual(["1", "1", "2"]);
    expect(f.saved.at(-1)?.items).toEqual([
      { id: "1", status: "deleted", attempts: 2 },
      { id: "2", status: "deleted", attempts: 1 },
    ]);
  });
});
