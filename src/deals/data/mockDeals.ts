import type { Deal, DealFilterOptions } from "../domain/types";

export const MOCK_FILTER_OPTIONS: DealFilterOptions = {
  entity: "deal",
  pipelines: [
    { id: "main", name: "Основная" },
    { id: "repeat", name: "Повторные продажи" },
  ],
  stages: [
    { id: "main-active", name: "В работе", pipelineId: "main", isLost: false },
    { id: "main-lost", name: "Проиграна", pipelineId: "main", isLost: true },
    {
      id: "repeat-lost",
      name: "Не состоялась",
      pipelineId: "repeat",
      isLost: true,
    },
  ],
  assignees: [
    { id: "10", name: "Анна Смирнова" },
    { id: "20", name: "Михаил Волков" },
  ],
  timeZoneLabel: "UTC+3",
};

const CORE_DEALS: readonly Deal[] = [
  {
    entity: "deal",
    id: "101",
    title: "Поставка оборудования",
    statusId: "main-lost",
    statusName: "Проиграна",
    pipelineId: "main",
    pipelineName: "Основная",
    stageId: "main-lost",
    stageName: "Проиграна",
    assignedById: "10",
    assignedByName: "Анна Смирнова",
    createdAt: "2025-11-15T08:10:00.000Z",
    updatedAt: "2026-01-19T12:30:00.000Z",
  },
  {
    entity: "deal",
    id: "102",
    title: "Продление сопровождения",
    statusId: "repeat-lost",
    statusName: "Не состоялась",
    pipelineId: "repeat",
    pipelineName: "Повторные продажи",
    stageId: "repeat-lost",
    stageName: "Не состоялась",
    assignedById: "20",
    assignedByName: "Михаил Волков",
    createdAt: "2026-02-01T07:00:00.000Z",
    updatedAt: "2026-04-03T14:15:00.000Z",
  },
  {
    entity: "deal",
    id: "103",
    title: "Пилот CRM",
    statusId: "main-active",
    statusName: "В работе",
    pipelineId: "main",
    pipelineName: "Основная",
    stageId: "main-active",
    stageName: "В работе",
    assignedById: "10",
    assignedByName: "Анна Смирнова",
    createdAt: "2025-09-05T10:00:00.000Z",
    updatedAt: "2026-08-15T11:45:00.000Z",
  },
];

function createDemoDeal(index: number): Deal {
  const isRepeat = index % 3 === 0;
  const isActive = index % 11 === 0;
  const assignedToAnna = index % 2 === 0;
  const pipelineId = isRepeat ? "repeat" : "main";
  const pipelineName = isRepeat ? "Повторные продажи" : "Основная";
  const stageId = isActive
    ? "main-active"
    : isRepeat
      ? "repeat-lost"
      : "main-lost";
  const stageName = isActive
    ? "В работе"
    : isRepeat
      ? "Не состоялась"
      : "Проиграна";

  return {
    entity: "deal",
    id: String(200 + index),
    title: `Демо-сделка ${index}`,
    statusId: stageId,
    statusName: stageName,
    pipelineId,
    pipelineName,
    stageId,
    stageName,
    assignedById: assignedToAnna ? "10" : "20",
    assignedByName: assignedToAnna ? "Анна Смирнова" : "Михаил Волков",
    createdAt: `2025-${String((index % 9) + 1).padStart(2, "0")}-${String((index % 27) + 1).padStart(2, "0")}T10:00:00.000Z`,
    updatedAt: `2026-${String((index % 8) + 1).padStart(2, "0")}-${String((index % 27) + 1).padStart(2, "0")}T12:00:00.000Z`,
  };
}

export const MOCK_DEALS: readonly Deal[] = [
  ...CORE_DEALS,
  ...Array.from({ length: 48 }, (_, index) => createDemoDeal(index + 1)),
];
