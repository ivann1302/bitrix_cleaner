import type { OperationContext } from "../domain/confirmation";
import type { OperationRecord, OperationStore } from "./types";
import { contextKey, parseOperationRecord } from "./operationRecord";

export class IndexedDbOperationStore implements OperationStore {
  constructor(private readonly databaseName = "crm-cleaner-operations-v1") {}

  async save(record: OperationRecord): Promise<void> {
    const safeRecord = parseOperationRecord(record, record.context);
    await this.transaction("readwrite", (store) =>
      store.put(safeRecord, contextKey(safeRecord.context)),
    );
  }

  async load(context: OperationContext): Promise<OperationRecord | null> {
    const value = await this.transaction("readonly", (store) =>
      store.get(contextKey(context)),
    );
    return value === undefined ? null : parseOperationRecord(value, context);
  }

  private open(): Promise<IDBDatabase> {
    if (typeof indexedDB === "undefined")
      return Promise.reject(new Error("STORAGE_UNAVAILABLE"));
    return new Promise((resolve, reject) => {
      let failed = false;
      const request = indexedDB.open(this.databaseName, 1);
      request.onupgradeneeded = () => {
        if (failed) {
          request.transaction?.abort();
          return;
        }
        request.result.createObjectStore("operations");
      };
      request.onblocked = () => {
        failed = true;
        reject(new Error("STORAGE_BLOCKED"));
      };
      request.onerror = () => {
        failed = true;
        reject(new Error("STORAGE_OPEN_FAILED"));
      };
      request.onsuccess = () => {
        const db = request.result;
        if (failed || !db.objectStoreNames.contains("operations")) {
          db.close();
          reject(new Error("INVALID_STORAGE_SCHEMA"));
          return;
        }
        db.onversionchange = () => db.close();
        resolve(db);
      };
    });
  }

  private async transaction(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest,
  ): Promise<unknown> {
    const db = await this.open();
    try {
      return await new Promise<unknown>((resolve, reject) => {
        const transaction = db.transaction("operations", mode);
        let value: unknown;
        transaction.oncomplete = () => resolve(value);
        transaction.onabort = () =>
          reject(new Error("STORAGE_TRANSACTION_ABORTED"));
        transaction.onerror = () =>
          reject(new Error("STORAGE_TRANSACTION_FAILED"));
        const request = action(transaction.objectStore("operations"));
        request.onsuccess = () => {
          value = request.result;
        };
        // Request success is not a committed checkpoint. Await oncomplete above.
      });
    } finally {
      db.close();
    }
  }
}
