# Bitrix24 Read-only Adapter Design

**Date:** 2026-09-10  
**Status:** approved by the existing autonomous-work instruction  
**Scope:** `PLAN.md` 1.2b and the autonomous parts of 2.1–2.2

## Goal

Add a browser-only Bitrix24 adapter that discovers the current portal and user,
loads deal filter dictionaries, and streams a complete preview of old lost deals
up to the hard 3,000-item limit. The adapter must never send a mutating REST
request. Direct top-level development remains an explicit mock mode.

## Boundaries

- Use the official `@bitrix24/b24jssdk` package and `initializeB24Frame()` only
  when the application is embedded in an iframe.
- Use the universal `crm.item.list` method with `entityTypeId: 2`; do not add the
  deprecated deal-specific list API.
- Keep SDK response objects behind a small `BitrixReadGateway` so domain tests
  use deterministic fakes and never need a portal.
- Permit only the read methods `profile`, `crm.category.list`,
  `crm.status.list`, `user.get`, and `crm.item.list` in the gateway.
- Use the SDK's cursor-based list generator and stop as soon as 3,001 unique IDs
  are collected. Never report a truncated 3,000-item success.
- Determine lost stages from Bitrix24 stage metadata. Never hard-code stage IDs.
- Convert a date-only boundary to `23:59:59` with the current user's portal
  offset returned by `profile`.
- Validate all external payloads at runtime. UI-visible failures contain only
  stable local codes and never raw SDK messages, request parameters, or tokens.
- Real mode is preview-only in this increment: it receives no deletion
  transport and therefore cannot render or start a delete confirmation.

## Runtime model

`createAppRuntime()` selects one of two modes:

1. A top-level window receives `MockBitrixAdapter`, mock context, and the tested
   local delete transport.
2. An iframe initializes `B24Frame`, wraps it in `B24SdkReadGateway`, loads the
   profile/context, and receives `BitrixDealReadAdapter` without any delete
   transport.

Initialization failure in an iframe renders a safe, actionable error. It does
not silently fall back to mock data because that could make artificial records
look like portal records.

## Adapter contract

```ts
interface BitrixReadGateway {
  readonly portalOrigin: string;
  readonly isAdmin: boolean;
  call(
    method: BitrixReadCallMethod,
    params?: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  fetchList(
    method: BitrixReadListMethod,
    params: Readonly<Record<string, unknown>>,
    options: BitrixListOptions,
  ): AsyncIterable<readonly unknown[]>;
  destroy(): void;
}

interface AppContext {
  readonly portal: string;
  readonly userId: string;
  readonly userName: string;
  readonly isAdmin: boolean;
  readonly timeZoneLabel: string;
  readonly timeZoneOffsetSeconds: number;
}
```

`BitrixDealReadAdapter.loadContext()` parses `profile`. Filter options load
categories, the stage directory for each category, and active users. Search
builds one server filter containing lost-stage IDs plus any selected pipeline,
stage, responsible user, and inclusive date boundary. Returned deals are
deduplicated by ID and mapped to the already loaded dictionaries.

## Failure behavior

- SDK initialization failure: `sdk-init-failed` bootstrap state.
- Permission or REST rejection: `bitrix-request-failed`.
- Missing or malformed required response fields: `invalid-bitrix-response`.
- No lost stages available: valid empty stage dictionary and an empty search
  result without issuing an unfiltered deal request.
- Unknown historical assignee: display `Пользователь ID <id>`; an inaccessible
  or deleted user must not invalidate an otherwise valid deal.

## Verification

- Contract tests assert exact method names and parameters.
- Pagination tests prove early stop at 3,001 unique deals and deduplication
  before the limit decision.
- Payload tests cover malformed profile, category, stage, user, and deal data.
- Runtime tests prove top-level mock selection, iframe SDK selection, safe iframe
  failure, and SDK destruction.
- UI tests prove real read-only labeling/context and the absence of deletion
  controls.
- Full `test`, `typecheck`, `lint`, `format:check`, `build`, PHP lint, document
  mirror, and secret-string scans run before completion.
