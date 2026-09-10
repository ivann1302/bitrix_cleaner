import type { OperationLock } from "./types";
export class BrowserOperationLock implements OperationLock {
  async runExclusive(key: string, work: () => Promise<void>): Promise<boolean> {
    if (typeof navigator === "undefined" || !navigator.locks)
      throw new Error("LOCK_UNAVAILABLE");
    return navigator.locks.request(
      key,
      { mode: "exclusive", ifAvailable: true },
      async (lock) => {
        if (!lock) return false;
        await work();
        return true;
      },
    );
  }
}
