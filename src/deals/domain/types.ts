export type DateField = "createdAt" | "updatedAt";

export interface AppContext {
  readonly portal: string;
  readonly userId: string;
  readonly userName: string;
  readonly isAdmin: boolean;
  readonly timeZone: string | null;
  readonly timeZoneLabel: string;
  readonly timeZoneOffsetSeconds: number;
}

export type CrmEntity = "deal" | "lead";

interface CrmItemBase {
  readonly id: string;
  readonly title: string;
  readonly statusId: string;
  readonly statusName: string;
  readonly assignedById: string;
  readonly assignedByName: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Deal extends CrmItemBase {
  readonly entity: "deal";
  readonly pipelineId: string;
  readonly pipelineName: string;
}

export interface Lead extends CrmItemBase {
  readonly entity: "lead";
}

export type CrmItem = Deal | Lead;

export interface NamedOption {
  readonly id: string;
  readonly name: string;
}

export interface DealStageOption extends NamedOption {
  readonly pipelineId: string;
  readonly isLost: boolean;
}

export interface DealFilterOptions {
  readonly entity: "deal";
  readonly pipelines: readonly NamedOption[];
  readonly stages: readonly DealStageOption[];
  readonly assignees: readonly NamedOption[];
  readonly timeZoneLabel: string;
}

export interface LeadStatusOption extends NamedOption {
  readonly isFailed: true;
}

export interface LeadFilterOptions {
  readonly entity: "lead";
  readonly statuses: readonly LeadStatusOption[];
  readonly assignees: readonly NamedOption[];
  readonly timeZoneLabel: string;
}

export interface DealSearchDraft {
  readonly entity: "deal";
  readonly dateField: DateField;
  readonly beforeDate: string;
  readonly pipelineId: string;
  readonly stageId: string;
  readonly assignedById: string;
}

export interface LeadSearchDraft {
  readonly entity: "lead";
  readonly dateField: DateField;
  readonly beforeDate: string;
  readonly statusId: string;
  readonly assignedById: string;
}

export interface DealSearchCriteria {
  readonly entity: "deal";
  readonly dateField: DateField;
  readonly beforeDate: string | null;
  readonly pipelineId: string | null;
  readonly stageId: string | null;
  readonly assignedById: string | null;
}

export interface LeadSearchCriteria {
  readonly entity: "lead";
  readonly dateField: DateField;
  readonly beforeDate: string | null;
  readonly statusId: string | null;
  readonly assignedById: string | null;
}

export type CrmFilterOptions = DealFilterOptions | LeadFilterOptions;
export type CrmSearchDraft = DealSearchDraft | LeadSearchDraft;
export type CrmSearchCriteria = DealSearchCriteria | LeadSearchCriteria;

export type DealSearchErrorCode = string;

export type DealSearchResult =
  | { readonly kind: "success"; readonly items: readonly Deal[] }
  | { readonly kind: "empty" }
  | { readonly kind: "over-limit"; readonly matchedAtLeast: number }
  | { readonly kind: "failure"; readonly code: DealSearchErrorCode };

export type CrmSearchResult =
  | { readonly kind: "success"; readonly items: readonly CrmItem[] }
  | { readonly kind: "empty" }
  | { readonly kind: "over-limit"; readonly matchedAtLeast: number }
  | { readonly kind: "failure"; readonly code: DealSearchErrorCode };

export interface DealSearchValidationErrors {
  readonly beforeDate?: string;
  readonly form?: string;
}

export type DealSearchValidation =
  | { readonly ok: true; readonly criteria: DealSearchCriteria }
  | {
      readonly ok: false;
      readonly fieldErrors: DealSearchValidationErrors;
      readonly formError?: string;
    };

export type CrmSearchValidation =
  | { readonly ok: true; readonly criteria: CrmSearchCriteria }
  | {
      readonly ok: false;
      readonly fieldErrors: DealSearchValidationErrors;
      readonly formError?: string;
    };
