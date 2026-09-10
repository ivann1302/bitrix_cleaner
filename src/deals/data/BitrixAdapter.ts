import type {
  CrmEntity,
  CrmFilterOptions,
  CrmSearchCriteria,
  CrmSearchResult,
} from "../domain/types";

export interface BitrixAdapter {
  readonly supportedEntities: readonly CrmEntity[];
  getFilterOptions(entity: CrmEntity): Promise<CrmFilterOptions>;
  search(criteria: CrmSearchCriteria): Promise<CrmSearchResult>;
}
