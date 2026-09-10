import { describe, expect, it } from "vitest";
import {
  contextKey,
  parseOperationRecord,
  recoverOperationRecord,
} from "./operationRecord";

const context = {
  portal: "demo.local",
  userId: "1",
  entity: "deal" as const,
  isAdmin: true,
};
const record = {
  schemaVersion: 1 as const,
  operationId: "demo-operation-1",
  context,
  createdAt: 1000,
  status: "running" as const,
  items: [{ id: "1", status: "pending" as const, attempts: 0 }],
};

describe("operation checkpoint boundary", () => {
  it.each(["pending", "sent"])(
    "rejects completed reports containing %s items",
    (status) => {
      expect(() =>
        parseOperationRecord(
          {
            ...record,
            status: "completed",
            items: [
              { id: "1", status, attempts: status === "pending" ? 0 : 1 },
            ],
          },
          context,
        ),
      ).toThrow("INVALID_CHECKPOINT");
    },
  );

  it("rejects pending items with an earlier send attempt", () => {
    expect(() =>
      parseOperationRecord(
        { ...record, items: [{ id: "1", status: "pending", attempts: 1 }] },
        context,
      ),
    ).toThrow("INVALID_CHECKPOINT");
  });

  it.each(["pending", "sent", "deleted", "unknown"])(
    "rejects stale error codes on %s items",
    (status) => {
      expect(() =>
        parseOperationRecord(
          {
            ...record,
            items: [
              {
                id: "1",
                status,
                attempts: status === "pending" ? 0 : 1,
                errorCode: "temporary",
              },
            ],
          },
          context,
        ),
      ).toThrow("INVALID_CHECKPOINT");
    },
  );

  it("accepts retry checkpoints and completed reports with final errors and unknowns", () => {
    const items = [
      { id: "1", status: "error", attempts: 2, errorCode: "temporary" },
      { id: "2", status: "unknown", attempts: 1 },
    ];
    expect(parseOperationRecord({ ...record, items }, context).items).toEqual(
      items,
    );
    expect(
      parseOperationRecord({ ...record, status: "completed", items }, context)
        .status,
    ).toBe("completed");
  });

  it("preserves stopped in-flight checkpoints for explicit recovery", () => {
    const saved = parseOperationRecord(
      {
        ...record,
        status: "stopped",
        items: [
          { id: "1", status: "sent", attempts: 1 },
          { id: "2", status: "pending", attempts: 0 },
        ],
      },
      context,
    );
    expect(
      recoverOperationRecord(saved).items.map((item) => item.status),
    ).toEqual(["unknown", "pending"]);
  });

  it("copies only whitelisted fields without retaining secrets", () => {
    const parsed = parseOperationRecord(
      {
        ...record,
        token: "secret",
        context: { ...context, refreshToken: "secret" },
        items: [{ ...record.items[0], title: "CRM text", token: "secret" }],
      },
      context,
    );
    expect(parsed).toEqual(record);
    expect(parsed).not.toBe(record);
    expect(parsed.context).not.toBe(context);
  });

  it.each([
    null,
    [],
    {},
    { ...record, schemaVersion: 2 },
    { ...record, createdAt: NaN },
    { ...record, createdAt: Infinity },
    { ...record, createdAt: -1 },
    { ...record, operationId: "" },
    { ...record, status: "resuming" },
    { ...record, items: [] },
    { ...record, context: { ...context, portal: "other" } },
    { ...record, context: { ...context, userId: "2" } },
    { ...record, context: { ...context, entity: "lead" } },
    { ...record, context: { ...context, isAdmin: false } },
  ])("rejects malformed or mismatched checkpoint %#", (value) => {
    expect(() => parseOperationRecord(value, context)).toThrow();
  });

  it.each([
    { id: "01", status: "pending", attempts: 0 },
    { id: "0", status: "pending", attempts: 0 },
    { id: "-1", status: "pending", attempts: 0 },
    { id: 1, status: "pending", attempts: 0 },
    { id: "1", status: "retry", attempts: 0 },
    { id: "1", status: "pending", attempts: -1 },
    { id: "1", status: "pending", attempts: 0.5 },
    { id: "1", status: "error", attempts: 4 },
    { id: "1", status: "sent", attempts: 0 },
    {
      id: "1",
      status: "error",
      attempts: 1,
      errorCode: "secret raw response text",
    },
  ])("rejects invalid item %#", (item) => {
    expect(() =>
      parseOperationRecord({ ...record, items: [item] }, context),
    ).toThrow();
  });

  it("accepts 3000 IDs, rejects 3001 and duplicates", () => {
    const items = Array.from({ length: 3000 }, (_, i) => ({
      id: String(i + 1),
      status: "pending",
      attempts: 0,
    }));
    expect(
      parseOperationRecord({ ...record, items }, context).items,
    ).toHaveLength(3000);
    expect(() =>
      parseOperationRecord(
        {
          ...record,
          items: [...items, { id: "3001", status: "pending", attempts: 0 }],
        },
        context,
      ),
    ).toThrow();
    expect(() =>
      parseOperationRecord({ ...record, items: [items[0], items[0]] }, context),
    ).toThrow();
  });

  it("does not confuse delimiter-containing contexts", () => {
    expect(contextKey({ ...context, portal: "a|b", userId: "c" })).not.toBe(
      contextKey({ ...context, portal: "a", userId: "b|c" }),
    );
  });

  it("recovers unfinished state without converting unknowns or pending to success", () => {
    const saved = parseOperationRecord(
      {
        ...record,
        items: [
          { id: "1", status: "sent", attempts: 1 },
          { id: "2", status: "deleted", attempts: 1 },
          { id: "3", status: "pending", attempts: 0 },
        ],
      },
      context,
    );
    const recovered = recoverOperationRecord(saved);
    expect(recovered.status).toBe("interrupted");
    expect(recovered.items.map((item) => item.status)).toEqual([
      "unknown",
      "deleted",
      "pending",
    ]);
    expect(saved.items[0]?.status).toBe("sent");
  });

  it.each(["completed", "stopped"] as const)(
    "keeps final %s reports final",
    (status) => {
      const saved = parseOperationRecord(
        {
          ...record,
          status,
          items: [{ id: "1", status: "deleted", attempts: 1 }],
        },
        context,
      );
      expect(recoverOperationRecord(saved).status).toBe(status);
    },
  );
});
