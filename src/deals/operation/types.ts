import type { OperationContext } from "../domain/confirmation";

export type ItemStatus = "pending" | "sent" | "deleted" | "error" | "unknown";

// Live UI state only: a reloaded operation never resumes a retry timer.
export interface RetryWait {
  readonly id: string;
  readonly nextAttempt: number;
  readonly delayMs: number;
}

export interface OperationItem {
  readonly id: string;
  readonly status: ItemStatus;
  readonly attempts: number;
  readonly errorCode?: string;
}

export interface OperationRecord {
  readonly schemaVersion: 1;
  readonly operationId: string;
  readonly context: OperationContext;
  readonly createdAt: number;
  readonly status:
    "running" | "paused" | "stopped" | "completed" | "interrupted";
  readonly items: readonly OperationItem[];
}

export interface OperationStore {
  save(record: OperationRecord): Promise<void>;
  load(context: OperationContext): Promise<OperationRecord | null>;
}

export interface OperationLock {
  runExclusive(key: string, work: () => Promise<void>): Promise<boolean>;
}

export type DeleteOutcome =
  | { kind: "deleted" }
  | { kind: "unknown" }
  | { kind: "error"; code: string; temporary: boolean; retryAfterMs?: number };

export interface DeleteTransport {
  deleteItem(id: string, context: OperationContext): Promise<DeleteOutcome>;
}
