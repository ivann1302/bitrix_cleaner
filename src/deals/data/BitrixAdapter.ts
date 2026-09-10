import type {
  DealFilterOptions,
  DealSearchCriteria,
  DealSearchResult,
} from "../domain/types";

export interface BitrixAdapter {
  getDealFilterOptions(): Promise<DealFilterOptions>;
  searchDeals(criteria: DealSearchCriteria): Promise<DealSearchResult>;
}
