import {
  deduplicateCrmItems,
  isDealSearchOverLimit,
} from "../domain/dealSearch";
import type {
  CrmEntity,
  CrmFilterOptions,
  CrmSearchCriteria,
  CrmSearchResult,
  Deal,
  DealFilterOptions,
  DealSearchCriteria,
  DealSearchResult,
  Lead,
  LeadFilterOptions,
} from "../domain/types";
import type { BitrixAdapter } from "./BitrixAdapter";
import { MOCK_DEALS, MOCK_FILTER_OPTIONS } from "./mockDeals";
import { MOCK_CONTEXT } from "./mockContext";
import { MOCK_LEADS, MOCK_LEAD_FILTER_OPTIONS } from "./mockLeads";
import type { OperationContext } from "../domain/confirmation";
import type { DeleteOutcome, DeleteTransport } from "../operation/types";

const MOCK_TIME_ZONE_OFFSET_MINUTES = 180;

export interface MockBitrixAdapterBehavior {
  readonly delayMs?: number | ((criteria: CrmSearchCriteria) => number);
  readonly failureCode?: string;
  readonly deleteDelayMs?: number;
}

export interface MockBitrixAdapterConfig {
  readonly deals?: readonly Deal[];
  readonly options?: DealFilterOptions;
  readonly leads?: readonly Lead[];
  readonly leadOptions?: LeadFilterOptions;
  readonly behavior?: MockBitrixAdapterBehavior;
}

function endOfMockDay(date: string): number {
  return (
    Date.parse(`${date}T23:59:59.999Z`) -
    MOCK_TIME_ZONE_OFFSET_MINUTES * 60 * 1000
  );
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, milliseconds);
  });
}

export class MockBitrixAdapter implements BitrixAdapter, DeleteTransport {
  public readonly supportedEntities = ["deal", "lead"] as const;
  private readonly deals: readonly Deal[];
  private readonly options: DealFilterOptions;
  private readonly leads: readonly Lead[];
  private readonly leadOptions: LeadFilterOptions;
  private readonly behavior: MockBitrixAdapterBehavior;
  private readonly deletedIds = new Set<string>();

  public constructor(config: MockBitrixAdapterConfig = {}) {
    this.deals = config.deals ?? MOCK_DEALS;
    this.options = config.options ?? MOCK_FILTER_OPTIONS;
    this.leads = config.leads ?? MOCK_LEADS;
    this.leadOptions = config.leadOptions ?? MOCK_LEAD_FILTER_OPTIONS;
    this.behavior = config.behavior ?? {};
  }

  public getFilterOptions(entity: CrmEntity): Promise<CrmFilterOptions> {
    return entity === "deal"
      ? Promise.resolve({
          ...this.options,
          stages: this.options.stages.filter((stage) => stage.isLost),
        })
      : Promise.resolve({ ...this.leadOptions });
  }

  public getDealFilterOptions(): Promise<DealFilterOptions> {
    return Promise.resolve({
      ...this.options,
      stages: this.options.stages.filter((stage) => stage.isLost),
    });
  }

  public async deleteItem(
    id: string,
    context: OperationContext,
  ): Promise<DeleteOutcome> {
    if (
      !context.isAdmin ||
      context.portal !== MOCK_CONTEXT.portal ||
      context.userId !== MOCK_CONTEXT.userId ||
      (context.entity !== "deal" && context.entity !== "lead")
    ) {
      return { kind: "error", code: "access-denied", temporary: false };
    }
    const delay = this.behavior.deleteDelayMs ?? 0;
    if (delay > 0) await wait(delay);
    const itemKey = `${context.entity}:${id}`;
    const items = context.entity === "deal" ? this.deals : this.leads;
    if (this.deletedIds.has(itemKey) || !items.some((item) => item.id === id)) {
      return { kind: "error", code: "not-found", temporary: false };
    }
    this.deletedIds.add(itemKey);
    return { kind: "deleted" };
  }

  public async search(criteria: CrmSearchCriteria): Promise<CrmSearchResult> {
    const configuredDelay = this.behavior.delayMs ?? 0;
    const delay =
      typeof configuredDelay === "function"
        ? configuredDelay(criteria)
        : configuredDelay;

    if (delay > 0) {
      await wait(delay);
    }

    if (this.behavior.failureCode !== undefined) {
      return { kind: "failure", code: this.behavior.failureCode };
    }

    const cutoff =
      criteria.beforeDate === null ? null : endOfMockDay(criteria.beforeDate);
    const matches =
      criteria.entity === "deal"
        ? deduplicateCrmItems(
            this.deals.filter((deal) => {
              const lostStageIds = new Set(
                this.options.stages
                  .filter((stage) => stage.isLost)
                  .map((stage) => stage.id),
              );
              if (this.deletedIds.has(`deal:${deal.id}`)) return false;
              if (!lostStageIds.has(deal.statusId)) return false;
              if (
                criteria.pipelineId !== null &&
                deal.pipelineId !== criteria.pipelineId
              )
                return false;
              if (
                criteria.stageId !== null &&
                deal.statusId !== criteria.stageId
              )
                return false;
              if (
                criteria.assignedById !== null &&
                deal.assignedById !== criteria.assignedById
              )
                return false;
              return !(
                cutoff !== null && Date.parse(deal[criteria.dateField]) > cutoff
              );
            }),
          )
        : deduplicateCrmItems(
            this.leads.filter((lead) => {
              const failedStatusIds = new Set(
                this.leadOptions.statuses.map((status) => status.id),
              );
              if (this.deletedIds.has(`lead:${lead.id}`)) return false;
              if (!failedStatusIds.has(lead.statusId)) return false;
              if (
                criteria.statusId !== null &&
                lead.statusId !== criteria.statusId
              )
                return false;
              if (
                criteria.assignedById !== null &&
                lead.assignedById !== criteria.assignedById
              )
                return false;
              return !(
                cutoff !== null && Date.parse(lead[criteria.dateField]) > cutoff
              );
            }),
          );

    if (isDealSearchOverLimit(matches.length)) {
      return { kind: "over-limit", matchedAtLeast: matches.length };
    }
    if (matches.length === 0) {
      return { kind: "empty" };
    }
    return { kind: "success", items: matches };
  }

  public searchDeals(criteria: DealSearchCriteria): Promise<DealSearchResult> {
    return this.search(criteria) as Promise<DealSearchResult>;
  }
}
