import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MOCK_CONTEXT } from "../data/mockContext";
import type { SelectionSnapshot } from "../domain/confirmation";
import type { OperationContext } from "../domain/confirmation";
import { OperationRunner } from "../operation/OperationRunner";
import {
  contextKey,
  recoverOperationRecord,
} from "../operation/operationRecord";
import type {
  DeleteTransport,
  OperationLock,
  OperationRecord,
  OperationStore,
  RetryWait,
} from "../operation/types";

export interface OperationServices {
  readonly store: OperationStore;
  readonly lock: OperationLock;
}

export function useDemoOperation(
  snapshot: SelectionSnapshot | null,
  transport: DeleteTransport | null,
  services: OperationServices,
  operationContext: OperationContext = MOCK_CONTEXT,
) {
  const { store, lock } = services;
  const {
    portal: operationPortal,
    userId: operationUserId,
    entity: operationEntity,
    isAdmin: operationIsAdmin,
  } = operationContext;
  const current = useRef(snapshot);
  const runner = useRef<OperationRunner | null>(null);
  const lifecycle = useRef(0);
  const [record, setRecord] = useState<OperationRecord | null>(null);
  const [storage, setStorage] = useState<"loading" | "ready" | "failure">(
    "loading",
  );
  const [busy, setBusy] = useState(false);
  const [retryWait, setRetryWait] = useState<RetryWait | null>(null);
  const [error, setError] = useState(false);
  const [usedRevision, setUsedRevision] = useState<number | null>(null);
  const stableOperationContext = useMemo(
    () => ({
      portal: operationPortal,
      userId: operationUserId,
      entity: operationEntity,
      isAdmin: operationIsAdmin,
    }),
    [operationPortal, operationUserId, operationEntity, operationIsAdmin],
  );
  const operationContextKey = contextKey(stableOperationContext);
  const [dependencies, setDependencies] = useState({
    store,
    lock,
    transport,
    operationContextKey,
  });

  // Reset readiness before rendering controls for a replacement environment.
  if (
    dependencies.store !== store ||
    dependencies.lock !== lock ||
    dependencies.transport !== transport ||
    dependencies.operationContextKey !== operationContextKey
  ) {
    setDependencies({ store, lock, transport, operationContextKey });
    setRecord(null);
    setStorage("loading");
    setBusy(false);
    setRetryWait(null);
    setError(false);
    setUsedRevision(null);
  }

  useLayoutEffect(() => {
    current.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    lifecycle.current += 1;
    const generation = lifecycle.current;
    if (transport !== null) {
      void store
        .load(stableOperationContext)
        .then((saved) => {
          if (generation !== lifecycle.current) return;
          if (saved !== null) setRecord(recoverOperationRecord(saved));
          setStorage("ready");
        })
        .catch(() => {
          if (generation === lifecycle.current) setStorage("failure");
        });
    }
    return () => {
      lifecycle.current += 1;
      runner.current?.stop();
      runner.current = null;
    };
  }, [store, lock, transport, stableOperationContext, operationContextKey]);

  function start(confirmed: SelectionSnapshot): void {
    if (
      transport === null ||
      storage !== "ready" ||
      busy ||
      usedRevision === confirmed.revision
    )
      return;
    const generation = lifecycle.current;
    if (runner.current === null) {
      runner.current = new OperationRunner({
        ...services,
        transport,
        getCurrentSnapshot: () => current.current,
        onUpdate: (next) => {
          if (generation === lifecycle.current) setRecord(next);
        },
        onRetryWait: (next) => {
          if (generation === lifecycle.current) setRetryWait(next);
        },
      });
    }
    setBusy(true);
    setError(false);
    setUsedRevision(confirmed.revision);
    void runner.current
      .start(confirmed)
      .catch(() => {
        if (generation === lifecycle.current) setError(true);
      })
      .finally(() => {
        if (generation === lifecycle.current) setBusy(false);
      });
  }

  return {
    record,
    retryWait,
    storage,
    busy,
    error,
    usedRevision,
    start,
    pause: () => runner.current?.pause(),
    resume: () => runner.current?.resume(),
    stop: () => runner.current?.stop(),
  };
}
