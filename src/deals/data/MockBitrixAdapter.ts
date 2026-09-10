import { deduplicateDeals, isDealSearchOverLimit } from "../domain/dealSearch";
import type {
  Deal,
  DealFilterOptions,
  DealSearchCriteria,
  DealSearchResult,
} from "../domain/types";
import type { BitrixAdapter } from "./BitrixAdapter";
import { MOCK_DEALS, MOCK_FILTER_OPTIONS } from "./mockDeals";
import { MOCK_CONTEXT } from "./mockContext";
import type { OperationContext } from "../domain/confirmation";
import type { DeleteOutcome, DeleteTransport } from "../operation/types";

const MOCK_TIME_ZONE_OFFSET_MINUTES = 180;

export interface MockBitrixAdapterBehavior {
  readonly delayMs?: number | ((criteria: DealSearchCriteria) => number);
  readonly failureCode?: string;
  readonly deleteDelayMs?: number;
}

export interface MockBitrixAdapterConfig {
  readonly deals?: readonly Deal[];
  readonly options?: DealFilterOptions;
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
  private readonly deals: readonly Deal[];
  private readonly options: DealFilterOptions;
  private readonly behavior: MockBitrixAdapterBehavior;
  private readonly deletedIds = new Set<string>();

  public constructor(config: MockBitrixAdapterConfig = {}) {
    this.deals = config.deals ?? MOCK_DEALS;
    this.options = config.options ?? MOCK_FILTER_OPTIONS;
    this.behavior = config.behavior ?? {};
  }

  public getDealFilterOptions(): Promise<DealFilterOptions> {
    return Promise.resolve({
      ...this.options,
      stages: this.options.stages.filter((stage) => stage.isLost),
    });
  }

  public async deleteDeal(
    id: string,
    context: OperationContext,
  ): Promise<DeleteOutcome> {
    if (
      !context.isAdmin ||
      context.portal !== MOCK_CONTEXT.portal ||
      context.userId !== MOCK_CONTEXT.userId ||
      context.entity !== "deal"
    ) {
      return { kind: "error", code: "access-denied", temporary: false };
    }
    const delay = this.behavior.deleteDelayMs ?? 0;
    if (delay > 0) await wait(delay);
    if (this.deletedIds.has(id) || !this.deals.some((deal) => deal.id === id)) {
      return { kind: "error", code: "not-found", temporary: false };
    }
    this.deletedIds.add(id);
    return { kind: "deleted" };
  }

  public async searchDeals(
    criteria: DealSearchCriteria,
  ): Promise<DealSearchResult> {
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

    const lostStageIds = new Set(
      this.options.stages
        .filter((stage) => stage.isLost)
        .map((stage) => stage.id),
    );
    const cutoff =
      criteria.beforeDate === null ? null : endOfMockDay(criteria.beforeDate);
    const matches = deduplicateDeals(
      this.deals.filter((deal) => {
        if (this.deletedIds.has(deal.id)) return false;
        if (!lostStageIds.has(deal.stageId)) return false;
        if (
          criteria.pipelineId !== null &&
          deal.pipelineId !== criteria.pipelineId
        ) {
          return false;
        }
        if (criteria.stageId !== null && deal.stageId !== criteria.stageId) {
          return false;
        }
        if (
          criteria.assignedById !== null &&
          deal.assignedById !== criteria.assignedById
        ) {
          return false;
        }
        if (cutoff !== null && Date.parse(deal[criteria.dateField]) > cutoff) {
          return false;
        }
        return true;
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
}
