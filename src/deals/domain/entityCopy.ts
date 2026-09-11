import type { CrmEntity } from "./types";

interface EntityCopy {
  readonly one: string;
  readonly few: string;
  readonly many: string;
  readonly title: string;
}

export const ENTITY_COPY = {
  deal: {
    one: "сделку",
    few: "сделки",
    many: "сделок",
    title: "Старые проигранные сделки",
  },
  lead: {
    one: "лид",
    few: "лида",
    many: "лидов",
    title: "Старые неуспешные лиды",
  },
} as const satisfies Record<CrmEntity, EntityCopy>;

export function entityNoun(entity: CrmEntity, count: number): string {
  const lastTwo = Math.abs(count) % 100;
  const last = lastTwo % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return ENTITY_COPY[entity].many;
  if (last === 1) return ENTITY_COPY[entity].one;
  if (last >= 2 && last <= 4) return ENTITY_COPY[entity].few;
  return ENTITY_COPY[entity].many;
}
