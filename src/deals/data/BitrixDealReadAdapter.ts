import {
  BitrixGatewayError,
  type BitrixReadGateway,
} from "../../bitrix/BitrixReadGateway";
import type {
  AppContext,
  Deal,
  DealFilterOptions,
  DealSearchCriteria,
  DealSearchResult,
  DealStageOption,
  NamedOption,
} from "../domain/types";
import {
  DEAL_SEARCH_LIMIT,
  validateDealSearchDraft,
} from "../domain/dealSearch";
import type { BitrixAdapter } from "./BitrixAdapter";

const DEAL_ENTITY_TYPE_ID = 2;
const BITRIX_LIST_PAGE_SIZE = 50;
const MAX_TIME_ZONE_OFFSET_SECONDS = 14 * 60 * 60;

type UnknownRecord = Readonly<Record<string, unknown>>;

function invalidResponse(): BitrixGatewayError {
  return new BitrixGatewayError("invalid-bitrix-response");
}

function asRecord(value: unknown): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalidResponse();
  }
  return value as UnknownRecord;
}

function asNonEmptyString(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw invalidResponse();
  }
  return value.trim();
}

function asNumericId(value: unknown, allowZero = false): string {
  const normalized =
    typeof value === "number" && Number.isSafeInteger(value)
      ? String(value)
      : typeof value === "string"
        ? value.trim()
        : "";
  const pattern = allowZero ? /^(?:0|[1-9]\d*)$/ : /^[1-9]\d*$/;
  if (!pattern.test(normalized)) throw invalidResponse();
  return normalized;
}

function parseTimeZoneOffset(value: unknown): number {
  const offset =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  if (
    !Number.isSafeInteger(offset) ||
    offset % 60 !== 0 ||
    Math.abs(offset) > MAX_TIME_ZONE_OFFSET_SECONDS
  ) {
    throw invalidResponse();
  }
  return offset;
}

function formatNumericOffset(offsetSeconds: number): string {
  return formatUtcOffset(offsetSeconds).slice(3);
}

function formatUtcOffset(offsetSeconds: number): string {
  const absoluteMinutes = Math.floor(Math.abs(offsetSeconds) / 60);
  const hours = String(Math.floor(absoluteMinutes / 60)).padStart(2, "0");
  const minutes = String(absoluteMinutes % 60).padStart(2, "0");
  return `UTC${offsetSeconds < 0 ? "-" : "+"}${hours}:${minutes}`;
}

function optionalTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function parseTimeZone(value: unknown): string | null {
  const timeZone = optionalTrimmedString(value);
  if (timeZone === null) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(new Date(0));
    return timeZone;
  } catch {
    throw invalidResponse();
  }
}

function parseContext(value: unknown, gateway: BitrixReadGateway): AppContext {
  const profile = asRecord(value);
  const userId = asNumericId(profile.ID);
  const firstName = optionalTrimmedString(profile.NAME);
  const lastName = optionalTrimmedString(profile.LAST_NAME);
  const userName =
    [firstName, lastName]
      .filter((part): part is string => part !== null)
      .join(" ") || `Пользователь ID ${userId}`;
  const timeZone = parseTimeZone(profile.TIME_ZONE);
  const hasExplicitOffset =
    profile.TIME_ZONE_OFFSET !== undefined &&
    profile.TIME_ZONE_OFFSET !== null &&
    profile.TIME_ZONE_OFFSET !== "";
  const timeZoneOffsetSeconds = hasExplicitOffset
    ? parseTimeZoneOffset(profile.TIME_ZONE_OFFSET)
    : timeZone === null
      ? 0
      : offsetAtInstant(Date.now(), timeZone);
  const utcOffset = formatUtcOffset(timeZoneOffsetSeconds);
  let portal: string;
  try {
    const url = new URL(gateway.portalOrigin);
    if (url.protocol !== "https:" || url.origin !== gateway.portalOrigin) {
      throw invalidResponse();
    }
    portal = url.origin;
  } catch (error) {
    if (error instanceof BitrixGatewayError) throw error;
    throw invalidResponse();
  }

  return {
    portal,
    userId,
    userName,
    isAdmin: gateway.isAdmin,
    timeZone,
    timeZoneLabel:
      timeZone !== null
        ? `${timeZone} (сейчас ${utcOffset})`
        : hasExplicitOffset
          ? utcOffset
          : `Часовой пояс недоступен (используется ${utcOffset})`,
    timeZoneOffsetSeconds,
  };
}

function offsetAtInstant(timestamp: number, timeZone: string): number {
  const wholeSecondTimestamp = Math.floor(timestamp / 1000) * 1000;
  const formatter = new Intl.DateTimeFormat("en", {
    timeZone,
    calendar: "gregory",
    numberingSystem: "latn",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date(wholeSecondTimestamp))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const requiredPart = (name: string): number => {
    const value = parts[name];
    if (typeof value !== "number" || !Number.isSafeInteger(value)) {
      throw invalidResponse();
    }
    return value;
  };
  const representedAsUtc = Date.UTC(
    requiredPart("year"),
    requiredPart("month") - 1,
    requiredPart("day"),
    requiredPart("hour"),
    requiredPart("minute"),
    requiredPart("second"),
  );
  const offset = Math.round((representedAsUtc - wholeSecondTimestamp) / 1000);
  if (
    !Number.isSafeInteger(offset) ||
    offset % 60 !== 0 ||
    Math.abs(offset) > MAX_TIME_ZONE_OFFSET_SECONDS
  ) {
    throw invalidResponse();
  }
  return offset;
}

function offsetForLocalEndOfDay(date: string, timeZone: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (match === null) throw invalidResponse();
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const localAsUtc = Date.UTC(year, month - 1, day, 23, 59, 59);
  let instant = localAsUtc;
  let offset = 0;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    offset = offsetAtInstant(instant, timeZone);
    const correctedInstant = localAsUtc - offset * 1000;
    if (correctedInstant === instant) return offset;
    instant = correctedInstant;
  }
  return offsetAtInstant(instant, timeZone);
}

function parseSort(value: unknown): number {
  if (value === undefined || value === null || value === "") {
    return Number.MAX_SAFE_INTEGER;
  }
  const sort =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^(?:0|[1-9]\d*)$/.test(value)
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(sort) || sort < 0) throw invalidResponse();
  return sort;
}

function parseCategories(value: unknown): readonly NamedOption[] {
  if (!Array.isArray(value)) throw invalidResponse();
  const seen = new Set<string>();
  const categories: Array<{
    option: NamedOption;
    sort: number;
    position: number;
  }> = [];
  for (const [position, entry] of value.entries()) {
    const category = asRecord(entry);
    const id = asNumericId(category.id, true);
    if (seen.has(id)) continue;
    seen.add(id);
    categories.push({
      option: { id, name: asNonEmptyString(category.name) },
      sort: parseSort(category.sort),
      position,
    });
  }
  categories.sort((left, right) =>
    left.sort === right.sort
      ? left.position - right.position
      : left.sort - right.sort,
  );
  return categories.map(({ option }) => option);
}

function parseCategoryPage(value: unknown): readonly unknown[] {
  const result = asRecord(value);
  if (!Array.isArray(result.categories)) throw invalidResponse();
  return result.categories;
}

function isLostStage(stage: UnknownRecord): boolean {
  const direct = optionalTrimmedString(stage.SEMANTICS)?.toLowerCase();
  const extra =
    typeof stage.EXTRA === "object" &&
    stage.EXTRA !== null &&
    !Array.isArray(stage.EXTRA)
      ? optionalTrimmedString(
          (stage.EXTRA as UnknownRecord).SEMANTICS,
        )?.toLowerCase()
      : null;
  return direct === "f" || extra === "failure" || extra === "apology";
}

function parseStages(
  value: unknown,
  pipelineId: string,
): readonly DealStageOption[] {
  if (!Array.isArray(value)) throw invalidResponse();
  const seen = new Set<string>();
  const stages: Array<{
    option: DealStageOption;
    sort: number;
    position: number;
  }> = [];
  for (const [position, entry] of value.entries()) {
    const stage = asRecord(entry);
    const id = asNonEmptyString(stage.STATUS_ID);
    if (seen.has(id)) continue;
    seen.add(id);
    stages.push({
      option: {
        id,
        name: asNonEmptyString(stage.NAME),
        pipelineId,
        isLost: isLostStage(stage),
      },
      sort: parseSort(stage.SORT),
      position,
    });
  }
  stages.sort((left, right) =>
    left.sort === right.sort
      ? left.position - right.position
      : left.sort - right.sort,
  );
  return stages.map(({ option }) => option);
}

function parseUser(value: unknown): NamedOption | null {
  const user = asRecord(value);
  if (typeof user.ACTIVE !== "boolean") throw invalidResponse();
  const id = asNumericId(user.ID);
  if (!user.ACTIVE) return null;
  const firstName = optionalTrimmedString(user.NAME);
  const lastName = optionalTrimmedString(user.LAST_NAME);
  return {
    id,
    name:
      [firstName, lastName]
        .filter((part): part is string => part !== null)
        .join(" ") || `Пользователь ID ${id}`,
  };
}

function parseIsoDateTime(value: unknown): string {
  if (typeof value !== "string") {
    throw invalidResponse();
  }
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/.exec(
      value,
    );
  if (match === null) throw invalidResponse();
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  calendar.setUTCHours(hour, minute, second, 0);
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day ||
    calendar.getUTCHours() !== hour ||
    calendar.getUTCMinutes() !== minute ||
    calendar.getUTCSeconds() !== second
  ) {
    throw invalidResponse();
  }
  if (match[7] !== "Z") {
    const offsetHour = Number(match[8]);
    const offsetMinute = Number(match[9]);
    if (
      offsetHour > 14 ||
      offsetMinute > 59 ||
      (offsetHour === 14 && offsetMinute !== 0)
    ) {
      throw invalidResponse();
    }
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw invalidResponse();
  return new Date(timestamp).toISOString();
}

function parseDeal(value: unknown, options: DealFilterOptions): Deal {
  const item = asRecord(value);
  const id = asNumericId(item.id);
  const pipelineId = asNumericId(item.categoryId, true);
  const stageId = asNonEmptyString(item.stageId);
  const assignedById = asNumericId(item.assignedById);
  const pipeline = options.pipelines.find((entry) => entry.id === pipelineId);
  const stage = options.stages.find(
    (entry) => entry.id === stageId && entry.pipelineId === pipelineId,
  );
  if (pipeline === undefined || stage === undefined) throw invalidResponse();
  const assignee = options.assignees.find((entry) => entry.id === assignedById);
  return {
    id,
    title: asNonEmptyString(item.title),
    pipelineId,
    pipelineName: pipeline.name,
    stageId,
    stageName: stage.name,
    assignedById,
    assignedByName: assignee?.name ?? `Пользователь ID ${assignedById}`,
    createdAt: parseIsoDateTime(item.createdTime),
    updatedAt: parseIsoDateTime(item.updatedTime),
  };
}

function validateCriteria(
  criteria: DealSearchCriteria,
  options: DealFilterOptions,
): void {
  const validation = validateDealSearchDraft({
    dateField: criteria.dateField,
    beforeDate: criteria.beforeDate ?? "",
    pipelineId: criteria.pipelineId ?? "",
    stageId: criteria.stageId ?? "",
    assignedById: criteria.assignedById ?? "",
  });
  if (!validation.ok) {
    throw new BitrixGatewayError("invalid-search-criteria");
  }
  const pipeline =
    criteria.pipelineId === null
      ? null
      : options.pipelines.find((entry) => entry.id === criteria.pipelineId);
  const stage =
    criteria.stageId === null
      ? null
      : options.stages.find((entry) => entry.id === criteria.stageId);
  const assignee =
    criteria.assignedById === null
      ? null
      : options.assignees.find((entry) => entry.id === criteria.assignedById);
  if (
    (criteria.pipelineId !== null && pipeline === undefined) ||
    (criteria.stageId !== null && stage === undefined) ||
    (criteria.assignedById !== null && assignee === undefined) ||
    (pipeline !== null &&
      pipeline !== undefined &&
      stage !== null &&
      stage !== undefined &&
      stage.pipelineId !== pipeline.id)
  ) {
    throw new BitrixGatewayError("invalid-search-criteria");
  }
}

function buildSearchFilter(
  criteria: DealSearchCriteria,
  options: DealFilterOptions,
  context: AppContext,
): Readonly<Record<string, unknown>> | null {
  validateCriteria(criteria, options);
  const stages = options.stages.filter(
    (stage) =>
      stage.isLost &&
      (criteria.pipelineId === null ||
        stage.pipelineId === criteria.pipelineId),
  );
  if (stages.length === 0) return null;
  const filter: Record<string, unknown> = {};
  if (criteria.pipelineId !== null) {
    filter.categoryId = Number(criteria.pipelineId);
  }
  if (criteria.stageId === null) {
    filter["@stageId"] = stages.map((stage) => stage.id);
  } else {
    filter.stageId = criteria.stageId;
  }
  if (criteria.assignedById !== null) {
    filter.assignedById = Number(criteria.assignedById);
  }
  if (criteria.beforeDate !== null) {
    const field =
      criteria.dateField === "createdAt" ? "createdTime" : "updatedTime";
    const offset =
      context.timeZone === null
        ? context.timeZoneOffsetSeconds
        : offsetForLocalEndOfDay(criteria.beforeDate, context.timeZone);
    filter[`<=${field}`] =
      `${criteria.beforeDate}T23:59:59${formatNumericOffset(offset)}`;
  }
  return filter;
}

function searchFailureCode(error: unknown): string {
  return error instanceof BitrixGatewayError
    ? error.code
    : "bitrix-request-failed";
}

export class BitrixDealReadAdapter implements BitrixAdapter {
  private contextPromise: Promise<AppContext> | null = null;
  private optionsPromise: Promise<DealFilterOptions> | null = null;

  public constructor(private readonly gateway: BitrixReadGateway) {}

  public loadContext(): Promise<AppContext> {
    this.contextPromise ??= this.gateway
      .call("profile")
      .then((profile) => parseContext(profile, this.gateway));
    return this.contextPromise;
  }

  public getDealFilterOptions(): Promise<DealFilterOptions> {
    this.optionsPromise ??= this.loadFilterOptions();
    return this.optionsPromise;
  }

  public async searchDeals(
    criteria: DealSearchCriteria,
  ): Promise<DealSearchResult> {
    try {
      const context = await this.loadContext();
      const options = await this.getDealFilterOptions();
      const filter = buildSearchFilter(criteria, options, context);
      if (filter === null) return { kind: "empty" };

      const deals: Deal[] = [];
      const seen = new Set<string>();
      for await (const page of this.gateway.fetchList(
        "crm.item.list",
        {
          entityTypeId: DEAL_ENTITY_TYPE_ID,
          select: [
            "id",
            "title",
            "categoryId",
            "stageId",
            "assignedById",
            "createdTime",
            "updatedTime",
          ],
          filter,
        },
        { idKey: "id", customKeyForResult: "items" },
      )) {
        for (const value of page) {
          const deal = parseDeal(value, options);
          if (seen.has(deal.id)) continue;
          seen.add(deal.id);
          deals.push(deal);
          if (deals.length > DEAL_SEARCH_LIMIT) {
            return {
              kind: "over-limit",
              matchedAtLeast: DEAL_SEARCH_LIMIT + 1,
            };
          }
        }
      }
      return deals.length === 0
        ? { kind: "empty" }
        : { kind: "success", items: deals };
    } catch (error) {
      return { kind: "failure", code: searchFailureCode(error) };
    }
  }

  private async loadFilterOptions(): Promise<DealFilterOptions> {
    const context = await this.loadContext();
    const categoryRows: unknown[] = [];
    for (let start = 0; ; start += BITRIX_LIST_PAGE_SIZE) {
      const page = parseCategoryPage(
        await this.gateway.call("crm.category.list", {
          entityTypeId: DEAL_ENTITY_TYPE_ID,
          start,
        }),
      );
      categoryRows.push(...page);
      if (page.length < BITRIX_LIST_PAGE_SIZE) break;
    }
    const pipelines = parseCategories(categoryRows);
    const stages: DealStageOption[] = [];
    for (const pipeline of pipelines) {
      const entityId =
        pipeline.id === "0" ? "DEAL_STAGE" : `DEAL_STAGE_${pipeline.id}`;
      const stageRows: unknown[] = [];
      for await (const page of this.gateway.fetchList(
        "crm.status.list",
        { filter: { ENTITY_ID: entityId } },
        { idKey: "ID" },
      )) {
        stageRows.push(...page);
      }
      stages.push(
        ...parseStages(stageRows, pipeline.id).filter((stage) => stage.isLost),
      );
    }

    const assignees: NamedOption[] = [];
    const seenAssignees = new Set<string>();
    for await (const page of this.gateway.fetchList(
      "user.get",
      {
        filter: { ACTIVE: true },
        select: ["ID", "ACTIVE", "NAME", "LAST_NAME"],
      },
      { idKey: "ID" },
    )) {
      for (const value of page) {
        const user = parseUser(value);
        if (user !== null && !seenAssignees.has(user.id)) {
          seenAssignees.add(user.id);
          assignees.push(user);
        }
      }
    }

    return {
      pipelines,
      stages,
      assignees,
      timeZoneLabel: context.timeZoneLabel,
    };
  }
}
