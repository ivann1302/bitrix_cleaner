import type { OperationContext } from "../domain/confirmation";
import type { AppContext } from "../domain/types";

export const MOCK_APP_CONTEXT: AppContext = Object.freeze({
  portal: "demo.local",
  userId: "demo-admin",
  userName: "Демо-администратор",
  isAdmin: true,
  timeZone: "Europe/Moscow",
  timeZoneLabel: "Europe/Moscow (сейчас UTC+03:00)",
  timeZoneOffsetSeconds: 10800,
});

export const MOCK_CONTEXT: OperationContext = Object.freeze({
  portal: MOCK_APP_CONTEXT.portal,
  userId: MOCK_APP_CONTEXT.userId,
  entity: "deal",
  isAdmin: MOCK_APP_CONTEXT.isAdmin,
});
