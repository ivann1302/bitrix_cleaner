import type { OperationContext } from "../domain/confirmation";
import { CRM_SEARCH_LIMIT } from "../domain/dealSearch";
import type { OperationItem, OperationRecord } from "./types";

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("INVALID_CHECKPOINT");
  return value as Record<string, unknown>;
}

function nonempty(value: unknown): value is string {
  return (
    typeof value === "string" && value.trim().length > 0 && value.length <= 512
  );
}

export function contextKey(context: OperationContext): string {
  return JSON.stringify([context.portal, context.userId, context.entity]);
}

export function parseOperationRecord(
  value: unknown,
  context: OperationContext,
): OperationRecord {
  const raw = object(value);
  const storedContext = object(raw.context);
  if (
    raw.schemaVersion !== 1 ||
    !nonempty(raw.operationId) ||
    typeof raw.createdAt !== "number" ||
    !Number.isFinite(raw.createdAt) ||
    raw.createdAt < 0 ||
    !nonempty(storedContext.portal) ||
    !nonempty(storedContext.userId) ||
    (storedContext.entity !== "deal" && storedContext.entity !== "lead") ||
    typeof storedContext.isAdmin !== "boolean" ||
    storedContext.portal !== context.portal ||
    storedContext.userId !== context.userId ||
    storedContext.entity !== context.entity ||
    storedContext.isAdmin !== context.isAdmin ||
    (raw.status !== "running" &&
      raw.status !== "paused" &&
      raw.status !== "stopped" &&
      raw.status !== "completed" &&
      raw.status !== "interrupted") ||
    !Array.isArray(raw.items) ||
    raw.items.length === 0 ||
    raw.items.length > CRM_SEARCH_LIMIT
  )
    throw new Error("INVALID_CHECKPOINT");

  const seen = new Set<string>();
  const items: OperationItem[] = raw.items.map((value: unknown) => {
    const item = object(value);
    if (
      typeof item.id !== "string" ||
      !/^[1-9]\d*$/.test(item.id) ||
      seen.has(item.id) ||
      (item.status !== "pending" &&
        item.status !== "sent" &&
        item.status !== "deleted" &&
        item.status !== "error" &&
        item.status !== "unknown") ||
      typeof item.attempts !== "number" ||
      !Number.isInteger(item.attempts) ||
      item.attempts < 0 ||
      item.attempts > 3 ||
      (item.status === "pending" && item.attempts !== 0) ||
      (item.status !== "pending" && item.attempts === 0) ||
      (item.errorCode !== undefined &&
        (item.status !== "error" ||
          typeof item.errorCode !== "string" ||
          !/^[A-Za-z0-9_.:-]{1,128}$/.test(item.errorCode)))
    )
      throw new Error("INVALID_CHECKPOINT");
    seen.add(item.id);
    return {
      id: item.id,
      status: item.status,
      attempts: item.attempts,
      ...(item.errorCode === undefined ? {} : { errorCode: item.errorCode }),
    };
  });
  if (
    raw.status === "completed" &&
    items.some((item) => item.status === "pending" || item.status === "sent")
  )
    throw new Error("INVALID_CHECKPOINT");
  return {
    schemaVersion: 1,
    operationId: raw.operationId,
    context: {
      portal: storedContext.portal,
      userId: storedContext.userId,
      entity: storedContext.entity,
      isAdmin: storedContext.isAdmin,
    },
    createdAt: raw.createdAt,
    status: raw.status,
    items,
  };
}

export function recoverOperationRecord(
  record: OperationRecord,
): OperationRecord {
  return {
    ...record,
    context: { ...record.context },
    status:
      record.status === "running" || record.status === "paused"
        ? "interrupted"
        : record.status,
    items: record.items.map((item) => ({
      ...item,
      status: item.status === "sent" ? "unknown" : item.status,
    })),
  };
}
