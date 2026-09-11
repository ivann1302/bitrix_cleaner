import type { Lead, LeadFilterOptions } from "../domain/types";

export const MOCK_LEAD_FILTER_OPTIONS: LeadFilterOptions = {
  entity: "lead",
  statuses: [
    { id: "JUNK", name: "Некачественный лид", isFailed: true },
    { id: "CANNOT_CONTACT", name: "Не удалось связаться", isFailed: true },
  ],
  assignees: [
    { id: "10", name: "Анна Смирнова" },
    { id: "20", name: "Михаил Волков" },
  ],
  timeZoneLabel: "UTC+3",
};

const CORE_LEADS: readonly Lead[] = [
  {
    entity: "lead",
    id: "401",
    title: "Запрос без ответа",
    statusId: "JUNK",
    statusName: "Некачественный лид",
    assignedById: "10",
    assignedByName: "Анна Смирнова",
    createdAt: "2025-11-15T08:10:00.000Z",
    updatedAt: "2026-01-19T12:30:00.000Z",
  },
  {
    entity: "lead",
    id: "402",
    title: "Контакт недоступен",
    statusId: "CANNOT_CONTACT",
    statusName: "Не удалось связаться",
    assignedById: "20",
    assignedByName: "Михаил Волков",
    createdAt: "2025-12-01T07:00:00.000Z",
    updatedAt: "2026-02-03T14:15:00.000Z",
  },
  {
    entity: "lead",
    id: "403",
    title: "Новый активный лид",
    statusId: "NEW",
    statusName: "Новый",
    assignedById: "10",
    assignedByName: "Анна Смирнова",
    createdAt: "2025-09-05T10:00:00.000Z",
    updatedAt: "2026-08-15T11:45:00.000Z",
  },
];

function createDemoLead(index: number): Lead {
  const isActive = index % 11 === 0;
  const cannotContact = index % 3 === 0;
  const assignedToAnna = index % 2 === 0;
  const statusId = isActive ? "NEW" : cannotContact ? "CANNOT_CONTACT" : "JUNK";
  const statusName = isActive
    ? "Новый"
    : cannotContact
      ? "Не удалось связаться"
      : "Некачественный лид";

  return {
    entity: "lead",
    id: String(500 + index),
    title: `Демо-лид ${index}`,
    statusId,
    statusName,
    assignedById: assignedToAnna ? "10" : "20",
    assignedByName: assignedToAnna ? "Анна Смирнова" : "Михаил Волков",
    createdAt: `2025-${String((index % 9) + 1).padStart(2, "0")}-${String((index % 27) + 1).padStart(2, "0")}T10:00:00.000Z`,
    updatedAt: `2026-${String((index % 8) + 1).padStart(2, "0")}-${String((index % 27) + 1).padStart(2, "0")}T12:00:00.000Z`,
  };
}

export const MOCK_LEADS: readonly Lead[] = [
  ...CORE_LEADS,
  ...Array.from({ length: 48 }, (_, index) => createDemoLead(index + 1)),
];
