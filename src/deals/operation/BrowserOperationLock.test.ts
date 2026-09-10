import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserOperationLock } from "./BrowserOperationLock";

afterEach(() => vi.unstubAllGlobals());

describe("BrowserOperationLock", () => {
  it("rejects unsupported browsers without starting work", async () => {
    vi.stubGlobal("navigator", {});
    let started = false;
    await expect(
      new BrowserOperationLock().runExclusive("context", () => {
        started = true;
        return Promise.resolve();
      }),
    ).rejects.toThrow();
    expect(started).toBe(false);
  });

  it("uses an exclusive nonwaiting browser lock and awaits work", async () => {
    const request = vi.fn(
      async (
        _key: string,
        _options: LockOptions,
        callback: (lock: Lock | null) => Promise<boolean>,
      ) => callback({ name: "context", mode: "exclusive" }),
    );
    vi.stubGlobal("navigator", { locks: { request } });
    let finished = false;
    expect(
      await new BrowserOperationLock().runExclusive("context", async () => {
        await Promise.resolve();
        finished = true;
      }),
    ).toBe(true);
    expect(finished).toBe(true);
    expect(request).toHaveBeenCalledWith(
      "context",
      { mode: "exclusive", ifAvailable: true },
      expect.any(Function),
    );
  });

  it("does not execute work when another tab owns the lock", async () => {
    const request = vi.fn(
      async (
        _key: string,
        _options: LockOptions,
        callback: (lock: Lock | null) => Promise<boolean>,
      ) => callback(null),
    );
    vi.stubGlobal("navigator", { locks: { request } });
    let started = false;
    expect(
      await new BrowserOperationLock().runExclusive("context", () => {
        started = true;
        return Promise.resolve();
      }),
    ).toBe(false);
    expect(started).toBe(false);
  });
});
