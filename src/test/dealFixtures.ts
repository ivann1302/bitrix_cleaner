import type { Deal, DealFilterOptions } from "../deals/domain/types";

export function createDeal(overrides: Partial<Deal> = {}): Deal {
  return {
    id: "1",
    title: "Тестовая сделка",
    pipelineId: "main",
    pipelineName: "Основная",
    stageId: "main-lost",
    stageName: "Проиграна",
    assignedById: "10",
    assignedByName: "Анна Смирнова",
    createdAt: "2026-01-10T09:00:00.000Z",
    updatedAt: "2026-01-20T09:00:00.000Z",
    ...overrides,
  };
}

export const TEST_FILTER_OPTIONS: DealFilterOptions = {
  pipelines: [{ id: "main", name: "Основная" }],
  stages: [
    { id: "main-lost", name: "Проиграна", pipelineId: "main", isLost: true },
  ],
  assignees: [{ id: "10", name: "Анна Смирнова" }],
  timeZoneLabel: "UTC+3",
};
