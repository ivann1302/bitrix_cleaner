export type DateField = "createdAt" | "updatedAt";

export interface Deal {
  readonly id: string;
  readonly title: string;
  readonly pipelineId: string;
  readonly pipelineName: string;
  readonly stageId: string;
  readonly stageName: string;
  readonly assignedById: string;
  readonly assignedByName: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NamedOption {
  readonly id: string;
  readonly name: string;
}

export interface DealStageOption extends NamedOption {
  readonly pipelineId: string;
  readonly isLost: boolean;
}

export interface DealFilterOptions {
  readonly pipelines: readonly NamedOption[];
  readonly stages: readonly DealStageOption[];
  readonly assignees: readonly NamedOption[];
  readonly timeZoneLabel: string;
}

export interface DealSearchDraft {
  readonly dateField: DateField;
  readonly beforeDate: string;
  readonly pipelineId: string;
  readonly stageId: string;
  readonly assignedById: string;
}

export interface DealSearchCriteria {
  readonly dateField: DateField;
  readonly beforeDate: string | null;
  readonly pipelineId: string | null;
  readonly stageId: string | null;
  readonly assignedById: string | null;
}

export type DealSearchErrorCode = string;

export type DealSearchResult =
  | { readonly kind: "success"; readonly items: readonly Deal[] }
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
