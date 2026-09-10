import type { OperationContext } from "../domain/confirmation";

export const MOCK_CONTEXT: OperationContext = Object.freeze({
  portal: "demo.local",
  userId: "demo-admin",
  entity: "deal",
  isAdmin: true,
});
