import type {
  Deal,
  DealFilterOptions,
  Lead,
  LeadFilterOptions,
} from "../deals/domain/types";

export function createDeal(overrides: Partial<Deal> = {}): Deal {
  return {
    entity: "deal",
    id: "1",
    title: "Тестовая сделка",
    statusId: "main-lost",
    statusName: "Проиграна",
    pipelineId: "main",
    pipelineName: "Основная",
    assignedById: "10",
    assignedByName: "Анна Смирнова",
    createdAt: "2026-01-10T09:00:00.000Z",
    updatedAt: "2026-01-20T09:00:00.000Z",
    ...overrides,
  };
}

export function createLead(overrides: Partial<Lead> = {}): Lead {
  return {
    entity: "lead",
    id: "41",
    title: "Некачественная заявка",
    statusId: "JUNK",
    statusName: "Забракован",
    assignedById: "10",
    assignedByName: "Иван Иванов",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
    ...overrides,
  };
}

export const TEST_FILTER_OPTIONS: DealFilterOptions = {
  entity: "deal",
  pipelines: [{ id: "main", name: "Основная" }],
  stages: [
    { id: "main-lost", name: "Проиграна", pipelineId: "main", isLost: true },
  ],
  assignees: [{ id: "10", name: "Анна Смирнова" }],
  timeZoneLabel: "UTC+3",
};

export const TEST_LEAD_FILTER_OPTIONS: LeadFilterOptions = {
  entity: "lead",
  statuses: [{ id: "JUNK", name: "Забракован", isFailed: true }],
  assignees: [{ id: "10", name: "Иван Иванов" }],
  timeZoneLabel: "UTC+3",
};
