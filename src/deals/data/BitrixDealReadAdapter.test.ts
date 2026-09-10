import { describe, expect, it } from "vitest";
import type {
  BitrixListOptions,
  BitrixReadCallMethod,
  BitrixReadGateway,
  BitrixReadListMethod,
} from "../../bitrix/BitrixReadGateway";
import { BitrixDealReadAdapter } from "./BitrixDealReadAdapter";
import type { DealSearchCriteria } from "../domain/types";

type CallResponses = Partial<Record<BitrixReadCallMethod, unknown>>;
type ListResponses = Partial<
  Record<BitrixReadListMethod, readonly (readonly unknown[])[]>
>;

class FakeReadGateway implements BitrixReadGateway {
  public readonly portalOrigin = "https://example.bitrix24.ru";
  public readonly isAdmin: boolean;
  public readonly calls: Array<{
    method: BitrixReadCallMethod;
    params: Readonly<Record<string, unknown>>;
  }> = [];
  public readonly lists: Array<{
    method: BitrixReadListMethod;
    params: Readonly<Record<string, unknown>>;
    options: BitrixListOptions;
  }> = [];

  public constructor(
    private readonly callResponses: CallResponses,
    private readonly listResponses: ListResponses = {},
    isAdmin = true,
  ) {
    this.isAdmin = isAdmin;
  }

  public call(
    method: BitrixReadCallMethod,
    params: Readonly<Record<string, unknown>> = {},
  ): Promise<unknown> {
    this.calls.push({ method, params });
    return Promise.resolve(this.callResponses[method]);
  }

  public async *fetchList(
    method: BitrixReadListMethod,
    params: Readonly<Record<string, unknown>>,
    options: BitrixListOptions,
  ): AsyncIterable<readonly unknown[]> {
    this.lists.push({ method, params, options });
    await Promise.resolve();
    for (const page of this.listResponses[method] ?? []) yield page;
  }

  public destroy(): void {}
}

const PROFILE = {
  ID: "7",
  NAME: "Иван",
  LAST_NAME: "Петров",
  TIME_ZONE: "Europe/Moscow",
  TIME_ZONE_OFFSET: "10800",
};

const CATEGORIES = {
  categories: [
    { id: 0, name: "Основная" },
    { id: 7, name: "Повторные продажи" },
  ],
};

const MAIN_STAGES = [
  {
    STATUS_ID: "NEW",
    NAME: "Новая",
    EXTRA: { SEMANTICS: "process" },
  },
  {
    STATUS_ID: "LOSE",
    NAME: "Проиграна",
    EXTRA: { SEMANTICS: "failure" },
  },
];

const REPEAT_STAGES = [
  { STATUS_ID: "C7:LOSE", NAME: "Не состоялась", SEMANTICS: "F" },
  {
    STATUS_ID: "C7:APOLOGY",
    NAME: "Отменена",
    EXTRA: { SEMANTICS: "apology" },
  },
];

const BASE_CRITERIA: DealSearchCriteria = {
  dateField: "createdAt",
  beforeDate: "2026-01-31",
  pipelineId: null,
  stageId: null,
  assignedById: null,
};

function rawDeal(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Сделка ${id}`,
    categoryId: 0,
    stageId: "LOSE",
    assignedById: 10,
    createdTime: "2026-01-10T12:00:00+03:00",
    updatedTime: "2026-01-20T15:00:00+03:00",
    ...overrides,
  };
}

function createGateway(
  overrides: {
    calls?: CallResponses;
    lists?: ListResponses;
    isAdmin?: boolean;
  } = {},
): FakeReadGateway {
  const statusPages = [MAIN_STAGES, REPEAT_STAGES];
  let statusIndex = 0;
  const callResponses: CallResponses = {
    profile: PROFILE,
    "crm.category.list": CATEGORIES,
    "crm.status.list": undefined,
    ...overrides.calls,
  };
  const gateway = new FakeReadGateway(
    callResponses,
    {
      "user.get": [
        [
          { ID: "10", ACTIVE: true, NAME: "Анна", LAST_NAME: "Смирнова" },
          { ID: "11", ACTIVE: false, NAME: "Архив", LAST_NAME: null },
        ],
        [{ ID: "20", ACTIVE: true, NAME: "Михаил", LAST_NAME: "Волков" }],
      ],
      ...overrides.lists,
    },
    overrides.isAdmin,
  );
  const originalCall = gateway.call.bind(gateway);
  gateway.call = (method, params = {}) => {
    if (
      method === "crm.status.list" &&
      overrides.calls?.[method] === undefined
    ) {
      gateway.calls.push({ method, params });
      return Promise.resolve(statusPages[statusIndex++]);
    }
    return originalCall(method, params);
  };
  return gateway;
}

describe("BitrixDealReadAdapter dictionaries", () => {
  it("loads and caches the portal/user context with an explicit UTC offset", async () => {
    const gateway = createGateway({ isAdmin: false });
    const adapter = new BitrixDealReadAdapter(gateway);

    await expect(adapter.loadContext()).resolves.toEqual({
      portal: "https://example.bitrix24.ru",
      userId: "7",
      userName: "Иван Петров",
      isAdmin: false,
      timeZone: "Europe/Moscow",
      timeZoneLabel: "Europe/Moscow (сейчас UTC+03:00)",
      timeZoneOffsetSeconds: 10800,
    });
    await adapter.loadContext();

    expect(
      gateway.calls.filter(({ method }) => method === "profile"),
    ).toHaveLength(1);
  });

  it("loads categories, lost stage semantics, and paged active assignees", async () => {
    const gateway = createGateway();
    const adapter = new BitrixDealReadAdapter(gateway);

    await expect(adapter.getDealFilterOptions()).resolves.toEqual({
      pipelines: [
        { id: "0", name: "Основная" },
        { id: "7", name: "Повторные продажи" },
      ],
      stages: [
        { id: "LOSE", name: "Проиграна", pipelineId: "0", isLost: true },
        {
          id: "C7:LOSE",
          name: "Не состоялась",
          pipelineId: "7",
          isLost: true,
        },
        {
          id: "C7:APOLOGY",
          name: "Отменена",
          pipelineId: "7",
          isLost: true,
        },
      ],
      assignees: [
        { id: "10", name: "Анна Смирнова" },
        { id: "20", name: "Михаил Волков" },
      ],
      timeZoneLabel: "Europe/Moscow (сейчас UTC+03:00)",
    });

    expect(gateway.calls).toEqual([
      { method: "profile", params: {} },
      { method: "crm.category.list", params: { entityTypeId: 2 } },
      {
        method: "crm.status.list",
        params: { order: { SORT: "ASC" }, filter: { ENTITY_ID: "DEAL_STAGE" } },
      },
      {
        method: "crm.status.list",
        params: {
          order: { SORT: "ASC" },
          filter: { ENTITY_ID: "DEAL_STAGE_7" },
        },
      },
    ]);
    expect(gateway.lists).toEqual([
      {
        method: "user.get",
        params: {
          filter: { ACTIVE: true },
          select: ["ID", "ACTIVE", "NAME", "LAST_NAME"],
        },
        options: { idKey: "ID" },
      },
    ]);
  });

  it("caches the complete filter dictionary promise", async () => {
    const gateway = createGateway();
    const adapter = new BitrixDealReadAdapter(gateway);

    await Promise.all([
      adapter.getDealFilterOptions(),
      adapter.getDealFilterOptions(),
    ]);

    expect(
      gateway.calls.filter(({ method }) => method === "crm.category.list"),
    ).toHaveLength(1);
    expect(
      gateway.lists.filter(({ method }) => method === "user.get"),
    ).toHaveLength(1);
  });

  it.each([
    ["profile", { ...PROFILE, ID: "" }],
    ["profile offset", { ...PROFILE, TIME_ZONE_OFFSET: "not-a-number" }],
    ["categories", { categories: [{ id: -1, name: "Некорректная" }] }],
  ])(
    "rejects malformed %s payloads without guessing",
    async (kind, payload) => {
      const calls: CallResponses =
        kind === "categories"
          ? { "crm.category.list": payload }
          : { profile: payload };
      const adapter = new BitrixDealReadAdapter(createGateway({ calls }));

      const request =
        kind === "categories"
          ? adapter.getDealFilterOptions()
          : adapter.loadContext();
      await expect(request).rejects.toMatchObject({
        code: "invalid-bitrix-response",
        message: "invalid-bitrix-response",
      });
    },
  );

  it("rejects malformed stage and user rows", async () => {
    const badStage = new BitrixDealReadAdapter(
      createGateway({
        calls: {
          "crm.category.list": { categories: [{ id: 0, name: "Основная" }] },
          "crm.status.list": [{ STATUS_ID: "LOSE", NAME: "" }],
        },
      }),
    );
    const badUser = new BitrixDealReadAdapter(
      createGateway({
        calls: {
          "crm.category.list": { categories: [{ id: 0, name: "Основная" }] },
          "crm.status.list": MAIN_STAGES,
        },
        lists: { "user.get": [[{ ACTIVE: true, NAME: "Без ID" }]] },
      }),
    );

    await expect(badStage.getDealFilterOptions()).rejects.toMatchObject({
      code: "invalid-bitrix-response",
    });
    await expect(badUser.getDealFilterOptions()).rejects.toMatchObject({
      code: "invalid-bitrix-response",
    });
  });
});

describe("BitrixDealReadAdapter search", () => {
  it("builds the universal lost-deal query with an inclusive portal-day boundary", async () => {
    const gateway = createGateway({
      lists: { "crm.item.list": [[rawDeal(501)]] },
    });
    const adapter = new BitrixDealReadAdapter(gateway);

    await expect(adapter.searchDeals(BASE_CRITERIA)).resolves.toEqual({
      kind: "success",
      items: [
        {
          id: "501",
          title: "Сделка 501",
          pipelineId: "0",
          pipelineName: "Основная",
          stageId: "LOSE",
          stageName: "Проиграна",
          assignedById: "10",
          assignedByName: "Анна Смирнова",
          createdAt: "2026-01-10T09:00:00.000Z",
          updatedAt: "2026-01-20T12:00:00.000Z",
        },
      ],
    });
    expect(
      gateway.lists.find(({ method }) => method === "crm.item.list"),
    ).toEqual({
      method: "crm.item.list",
      params: {
        entityTypeId: 2,
        select: [
          "id",
          "title",
          "categoryId",
          "stageId",
          "assignedById",
          "createdTime",
          "updatedTime",
        ],
        filter: {
          "@stageId": ["LOSE", "C7:LOSE", "C7:APOLOGY"],
          "<=createdTime": "2026-01-31T23:59:59+03:00",
        },
      },
      options: { idKey: "id", customKeyForResult: "items" },
    });
  });

  it("uses selected pipeline, stage, assignee, and updated-time fields", async () => {
    const gateway = createGateway({
      lists: {
        "crm.item.list": [
          [
            rawDeal(502, {
              categoryId: 7,
              stageId: "C7:LOSE",
              assignedById: 20,
            }),
          ],
        ],
      },
    });
    const adapter = new BitrixDealReadAdapter(gateway);

    await adapter.searchDeals({
      ...BASE_CRITERIA,
      dateField: "updatedAt",
      pipelineId: "7",
      stageId: "C7:LOSE",
      assignedById: "20",
    });

    expect(
      gateway.lists.find(({ method }) => method === "crm.item.list")?.params,
    ).toMatchObject({
      filter: {
        categoryId: 7,
        stageId: "C7:LOSE",
        assignedById: 20,
        "<=updatedTime": "2026-01-31T23:59:59+03:00",
      },
    });
    expect(
      (
        gateway.lists.find(({ method }) => method === "crm.item.list")?.params
          .filter as Record<string, unknown>
      )["@stageId"],
    ).toBeUndefined();
  });

  it("uses the cutoff date's IANA offset instead of the profile's current offset", async () => {
    const gateway = createGateway({
      calls: {
        profile: {
          ...PROFILE,
          TIME_ZONE: "America/New_York",
          TIME_ZONE_OFFSET: "-14400",
        },
      },
      lists: { "crm.item.list": [[]] },
    });
    const adapter = new BitrixDealReadAdapter(gateway);

    await adapter.searchDeals(BASE_CRITERIA);

    expect(
      (
        gateway.lists.find(({ method }) => method === "crm.item.list")?.params
          .filter as Record<string, unknown>
      )["<=createdTime"],
    ).toBe("2026-01-31T23:59:59-05:00");
  });

  it("uses only the selected pipeline's lost stages when no stage is selected", async () => {
    const gateway = createGateway({ lists: { "crm.item.list": [[]] } });
    const adapter = new BitrixDealReadAdapter(gateway);

    await adapter.searchDeals({
      ...BASE_CRITERIA,
      beforeDate: null,
      pipelineId: "7",
    });

    expect(
      gateway.lists.find(({ method }) => method === "crm.item.list")?.params,
    ).toMatchObject({
      filter: {
        categoryId: 7,
        "@stageId": ["C7:LOSE", "C7:APOLOGY"],
      },
    });
  });

  it("does not issue an unfiltered deal request when no lost stage exists", async () => {
    const gateway = createGateway({
      calls: {
        "crm.category.list": { categories: [{ id: 0, name: "Основная" }] },
        "crm.status.list": [
          {
            STATUS_ID: "NEW",
            NAME: "Новая",
            EXTRA: { SEMANTICS: "process" },
          },
        ],
      },
    });
    const adapter = new BitrixDealReadAdapter(gateway);

    await expect(adapter.searchDeals(BASE_CRITERIA)).resolves.toEqual({
      kind: "empty",
    });
    expect(gateway.lists.some(({ method }) => method === "crm.item.list")).toBe(
      false,
    );
  });

  it("uses a truthful fallback for a historical user absent from the active directory", async () => {
    const adapter = new BitrixDealReadAdapter(
      createGateway({
        lists: {
          "crm.item.list": [[rawDeal(503, { assignedById: 99 })]],
        },
      }),
    );

    await expect(adapter.searchDeals(BASE_CRITERIA)).resolves.toMatchObject({
      kind: "success",
      items: [{ assignedById: "99", assignedByName: "Пользователь ID 99" }],
    });
  });

  it.each([
    [0, { kind: "empty" }],
    [3000, { kind: "success" }],
    [3001, { kind: "over-limit", matchedAtLeast: 3001 }],
  ] as const)(
    "handles the %i unique-deal boundary",
    async (count, expected) => {
      const adapter = new BitrixDealReadAdapter(
        createGateway({
          lists: {
            "crm.item.list": [
              Array.from({ length: count }, (_, index) => rawDeal(index + 1)),
            ],
          },
        }),
      );

      const result = await adapter.searchDeals(BASE_CRITERIA);
      expect(result).toMatchObject(expected);
      if (result.kind === "success") expect(result.items).toHaveLength(count);
    },
  );

  it("deduplicates before deciding whether the limit is exceeded", async () => {
    const deals = Array.from({ length: 3000 }, (_, index) =>
      rawDeal(index + 1),
    );
    const adapter = new BitrixDealReadAdapter(
      createGateway({ lists: { "crm.item.list": [[deals[0], ...deals]] } }),
    );

    const result = await adapter.searchDeals(BASE_CRITERIA);
    expect(result.kind).toBe("success");
    if (result.kind === "success") expect(result.items).toHaveLength(3000);
  });

  it("closes the upstream generator immediately after the 3,001st unique ID", async () => {
    let pagesRequested = 0;
    let generatorClosed = false;
    const base = createGateway();
    base.fetchList = async function* (method, params, options) {
      this.lists.push({ method, params, options });
      await Promise.resolve();
      if (method === "user.get") {
        yield [{ ID: "10", ACTIVE: true, NAME: "Анна", LAST_NAME: "Смирнова" }];
        return;
      }
      try {
        for (let page = 0; page < 100; page += 1) {
          pagesRequested += 1;
          yield Array.from({ length: 50 }, (_, index) =>
            rawDeal(page * 50 + index + 1),
          );
        }
      } finally {
        generatorClosed = true;
      }
    };
    const adapter = new BitrixDealReadAdapter(base);

    await expect(adapter.searchDeals(BASE_CRITERIA)).resolves.toEqual({
      kind: "over-limit",
      matchedAtLeast: 3001,
    });
    expect(pagesRequested).toBe(61);
    expect(generatorClosed).toBe(true);
  });

  it("returns stable failures for invalid criteria, malformed deals, and gateway errors", async () => {
    const invalidCriteria = new BitrixDealReadAdapter(createGateway());
    const malformedDeal = new BitrixDealReadAdapter(
      createGateway({
        lists: { "crm.item.list": [[{ ...rawDeal(1), title: "" }]] },
      }),
    );
    const requestFailureGateway = createGateway();
    requestFailureGateway.fetchList = async function* (
      method,
      params,
      options,
    ) {
      this.lists.push({ method, params, options });
      await Promise.resolve();
      if (method === "user.get") return;
      throw new Error("access_token=secret");
    };
    const requestFailure = new BitrixDealReadAdapter(requestFailureGateway);

    await expect(
      invalidCriteria.searchDeals({ ...BASE_CRITERIA, pipelineId: "999" }),
    ).resolves.toEqual({ kind: "failure", code: "invalid-search-criteria" });
    await expect(malformedDeal.searchDeals(BASE_CRITERIA)).resolves.toEqual({
      kind: "failure",
      code: "invalid-bitrix-response",
    });
    await expect(requestFailure.searchDeals(BASE_CRITERIA)).resolves.toEqual({
      kind: "failure",
      code: "bitrix-request-failed",
    });
  });
});
