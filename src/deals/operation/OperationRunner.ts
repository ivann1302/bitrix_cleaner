import {
  isSelectionCurrent,
  type SelectionSnapshot,
} from "../domain/confirmation";
import { criteriaSignature } from "../domain/dealSearch";
import type {
  DeleteOutcome,
  DeleteTransport,
  OperationItem,
  OperationLock,
  OperationRecord,
  OperationStore,
  RetryWait,
} from "./types";

interface RunnerOptions {
  readonly store: OperationStore;
  readonly lock: OperationLock;
  readonly transport: DeleteTransport;
  readonly getCurrentSnapshot: () => SelectionSnapshot | null;
  readonly now?: () => number;
  readonly wait?: (ms: number) => Promise<void>;
  readonly onUpdate: (record: OperationRecord) => void;
  readonly onRetryWait?: (waiting: RetryWait | null) => void;
}

export class OperationRunner {
  private active = false;
  private paused = false;
  private stopped = false;
  private wake: (() => void) | null = null;
  private cancelRetryWait: (() => void) | null = null;
  private record: OperationRecord | null = null;
  private selection: SelectionSnapshot | null = null;
  private readonly consumed = new Set<string>();

  constructor(private readonly options: RunnerOptions) {}

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private valid(snapshot: SelectionSnapshot): boolean {
    const current = this.options.getCurrentSnapshot();
    return (
      current !== null && isSelectionCurrent(snapshot, current, this.now())
    );
  }

  private update(record: OperationRecord): void {
    this.record = Object.isFrozen(record)
      ? record
      : Object.freeze({
          ...record,
          context: Object.freeze({ ...record.context }),
          items: Object.freeze(record.items.map((item) => Object.freeze(item))),
        });
    this.options.onUpdate(this.record);
  }

  private async persist(
    record: OperationRecord,
    failedItem?: OperationItem,
  ): Promise<void> {
    const frozen = Object.freeze({
      ...record,
      context: Object.freeze({ ...record.context }),
      items: Object.freeze(record.items.map((item) => Object.freeze(item))),
    });
    try {
      await this.options.store.save(frozen);
    } catch {
      this.stopped = true;
      this.update({
        ...frozen,
        status: "stopped",
        items: failedItem
          ? frozen.items.map((item) =>
              item.id === failedItem.id ? failedItem : item,
            )
          : frozen.items,
      });
      throw new Error("checkpoint-unavailable");
    }
    this.update(frozen);
  }

  private status(): "running" | "paused" | "stopped" {
    return this.stopped ? "stopped" : this.paused ? "paused" : "running";
  }

  private reportStopped(): void {
    if (this.record && this.record.status !== "stopped") {
      this.update({ ...this.record, status: "stopped" });
    }
  }

  private async gate(snapshot: SelectionSnapshot): Promise<boolean> {
    if (!this.valid(snapshot)) this.stopped = true;
    while (this.paused && !this.stopped) {
      const waiting = new Promise<void>((resolve) => {
        this.wake = resolve;
      });
      if (this.record) await this.persist({ ...this.record, status: "paused" });
      if (this.paused && !this.stopped) await waiting;
      this.wake = null;
      if (!this.valid(snapshot)) this.stopped = true;
    }
    return !this.stopped;
  }

  async start(snapshot: SelectionSnapshot): Promise<void> {
    if (this.active) throw new Error("operation-active");
    if (!this.valid(snapshot)) throw new Error("selection-invalid");
    const selection = Object.freeze({
      ...snapshot,
      context: Object.freeze({ ...snapshot.context }),
      criteria: Object.freeze({ ...snapshot.criteria }),
      ids: Object.freeze([...snapshot.ids]),
    });
    const identity = JSON.stringify([
      selection.context.portal,
      selection.context.userId,
      selection.context.entity,
      selection.context.isAdmin,
      selection.revision,
      selection.selectionVersion,
      selection.collectedAt,
      criteriaSignature(selection.criteria),
      [...selection.ids].sort(),
    ]);
    if (this.consumed.has(identity)) throw new Error("selection-consumed");
    this.active = true;
    this.paused = false;
    this.stopped = false;
    this.selection = selection;
    this.record = null;
    try {
      const acquired = await this.options.lock.runExclusive(
        JSON.stringify([
          selection.context.portal,
          selection.context.userId,
          selection.context.entity,
        ]),
        async () => {
          if (!this.valid(selection)) throw new Error("selection-invalid");
          if (this.stopped) return;
          try {
            await this.options.store.load(selection.context);
          } catch {
            throw new Error("checkpoint-unavailable");
          }
          if (!this.valid(selection)) throw new Error("selection-invalid");
          if (this.stopped) return;
          this.consumed.add(identity);
          await this.persist({
            schemaVersion: 1,
            operationId: crypto.randomUUID(),
            context: selection.context,
            createdAt: this.now(),
            status: this.status(),
            items: selection.ids.map((id) => ({
              id,
              status: "pending",
              attempts: 0,
            })),
          });
          await this.execute(selection);
        },
      );
      if (!acquired) throw new Error("operation-locked");
    } catch (error) {
      this.stopped = true;
      this.reportStopped();
      const safeCodes = [
        "checkpoint-unavailable",
        "selection-invalid",
        "operation-locked",
      ];
      throw new Error(
        error instanceof Error && safeCodes.includes(error.message)
          ? error.message
          : "operation-unavailable",
      );
    } finally {
      this.active = false;
      this.selection = null;
      this.wake?.();
      this.wake = null;
    }
  }

  private async execute(selection: SelectionSnapshot): Promise<void> {
    for (let index = 0; index < selection.ids.length; index += 1) {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        if (!(await this.gate(selection)) || !this.record) break;
        const previous = this.record.items[index];
        if (!previous) throw new Error("operation-unavailable");
        const sent: OperationItem = {
          id: previous.id,
          status: "sent",
          attempts: attempt,
        };
        await this.persist(
          {
            ...this.record,
            status: this.status(),
            items: this.record.items.map((item, position) =>
              position === index ? sent : item,
            ),
          },
          previous,
        );
        // A pause, context change or expiration may happen while committing intent.
        if (this.paused || this.stopped || !this.valid(selection)) {
          if (!this.valid(selection)) this.stopped = true;
          await this.persist({
            ...this.record,
            status: this.status(),
            items: this.record.items.map((item, position) =>
              position === index ? previous : item,
            ),
          });
          attempt -= 1;
          if (this.stopped) break;
          continue;
        }
        let outcome: DeleteOutcome;
        try {
          outcome = await this.options.transport.deleteItem(
            sent.id,
            selection.context,
          );
        } catch {
          outcome = { kind: "unknown" };
        }
        const errorCode =
          outcome.kind === "error" &&
          /^[A-Za-z0-9_.:-]{1,128}$/.test(outcome.code)
            ? outcome.code
            : "operation-error";
        const result: OperationItem = {
          id: sent.id,
          attempts: attempt,
          status: outcome.kind === "error" ? "error" : outcome.kind,
          ...(outcome.kind === "error" ? { errorCode } : {}),
        };
        if (
          outcome.kind === "error" &&
          ["access-denied", "unauthorized", "forbidden"].includes(outcome.code)
        )
          this.stopped = true;
        await this.persist(
          {
            ...this.record,
            status: this.status(),
            items: this.record.items.map((item, position) =>
              position === index ? result : item,
            ),
          },
          { id: sent.id, status: "unknown", attempts: attempt },
        );
        if (
          outcome.kind !== "error" ||
          !outcome.temporary ||
          attempt === 3 ||
          this.stopped
        )
          break;
        if (!(await this.gate(selection))) break;
        const requested = outcome.retryAfterMs ?? 500;
        const delay = Number.isFinite(requested)
          ? Math.min(5000, Math.max(0, requested))
          : 500;
        await this.waitForRetry({
          id: sent.id,
          nextAttempt: attempt + 1,
          delayMs: delay,
        });
      }
      if (this.stopped) break;
    }
    if (this.record)
      await this.persist({
        ...this.record,
        status: this.stopped ? "stopped" : "completed",
      });
  }

  private async waitForRetry(waiting: RetryWait): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancelled = new Promise<void>((resolve) => {
      this.cancelRetryWait = resolve;
    });
    try {
      this.options.onRetryWait?.(waiting);
      if (this.stopped) return;
      const elapsed =
        this.options.wait?.(waiting.delayMs) ??
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, waiting.delayMs);
        });
      await Promise.race([elapsed, cancelled]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      this.cancelRetryWait = null;
      this.options.onRetryWait?.(null);
    }
  }

  pause(): void {
    if (!this.active || this.stopped) return;
    this.paused = true;
    if (this.record) this.update({ ...this.record, status: "paused" });
  }

  resume(): void {
    if (!this.active || !this.paused) return;
    if (!this.selection || !this.valid(this.selection)) this.stopped = true;
    this.paused = false;
    this.wake?.();
    if (this.record) this.update({ ...this.record, status: this.status() });
  }

  stop(): void {
    if (!this.active) return;
    this.stopped = true;
    this.paused = false;
    this.wake?.();
    this.cancelRetryWait?.();
    if (this.record) this.update({ ...this.record, status: "stopped" });
  }
}
