import { describe, expect, it } from "vitest";
import type {
  BitrixListOptions,
  BitrixReadCallMethod,
  BitrixReadGateway,
  BitrixReadListMethod,
} from "../../bitrix/BitrixReadGateway";
import { BitrixDealReadAdapter } from "./BitrixDealReadAdapter";
import type { DealSearchCriteria, LeadSearchCriteria } from "../domain/types";

type CallResponses = Partial<Record<BitrixReadCallMethod, unknown>>;
type ListPages = readonly (readonly unknown[])[];
type ListResponses = Partial<
  Record<
    string,
    ListPages | ((params: Readonly<Record<string, unknown>>) => ListPages)
  >
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
    const response = this.callResponses[method];
    return Promise.resolve(
      typeof response === "function"
        ? (response as (params: Readonly<Record<string, unknown>>) => unknown)(
            params,
          )
        : response,
    );
  }

  public async *fetchList(
    method: BitrixReadListMethod,
    params: Readonly<Record<string, unknown>>,
    options: BitrixListOptions,
  ): AsyncIterable<readonly unknown[]> {
    this.lists.push({ method, params, options });
    await Promise.resolve();
    const response = this.listResponses[method];
    const pages = typeof response === "function" ? response(params) : response;
    for (const page of pages ?? []) yield page;
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
  entity: "deal",
  dateField: "createdAt",
  beforeDate: "2026-01-31",
  pipelineId: null,
  stageId: null,
  assignedById: null,
};

const BASE_LEAD_CRITERIA: LeadSearchCriteria = {
  entity: "lead",
  dateField: "createdAt",
  beforeDate: "2026-09-01",
  statusId: null,
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

function rawLead(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Лид ${id}`,
    stageId: "JUNK",
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
  const callResponses: CallResponses = {
    profile: PROFILE,
    "crm.category.list": CATEGORIES,
    ...overrides.calls,
  };
  const gateway = new FakeReadGateway(
    callResponses,
    {
      "crm.status.list": (params) => {
        const filter = params.filter as Record<string, unknown>;
        return [
          filter.ENTITY_ID === "DEAL_STAGE" ? MAIN_STAGES : REPEAT_STAGES,
        ];
      },
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

  it("derives the current UTC offset from the documented profile time zone", async () => {
    const gateway = createGateway({
      calls: {
        profile: {
          ID: "7",
          ADMIN: false,
          NAME: "Иван",
          LAST_NAME: "Петров",
          PERSONAL_GENDER: "",
          TIME_ZONE: "Europe/Moscow",
        },
      },
    });
    const adapter = new BitrixDealReadAdapter(gateway);

    await expect(adapter.loadContext()).resolves.toMatchObject({
      timeZone: "Europe/Moscow",
      timeZoneLabel: "Europe/Moscow (сейчас UTC+03:00)",
      timeZoneOffsetSeconds: 10800,
    });
  });

  it("models the documented empty profile time zone as unavailable UTC", async () => {
    const gateway = createGateway({
      calls: {
        profile: {
          ID: "7",
          ADMIN: false,
          NAME: "Иван",
          LAST_NAME: "Петров",
          PERSONAL_GENDER: "",
          TIME_ZONE: "",
        },
      },
    });
    const adapter = new BitrixDealReadAdapter(gateway);

    await expect(adapter.loadContext()).resolves.toMatchObject({
      timeZone: null,
      timeZoneLabel: "Часовой пояс недоступен (используется UTC+00:00)",
      timeZoneOffsetSeconds: 0,
    });
  });

  it("loads categories, lost stage semantics, and paged active assignees", async () => {
    const gateway = createGateway();
    const adapter = new BitrixDealReadAdapter(gateway);

    await expect(adapter.getDealFilterOptions()).resolves.toEqual({
      entity: "deal",
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
      {
        method: "crm.category.list",
        params: { entityTypeId: 2, start: 0 },
      },
    ]);
    expect(gateway.lists).toEqual([
      {
        method: "crm.status.list",
        params: { filter: { ENTITY_ID: "DEAL_STAGE" } },
        options: { idKey: "ID" },
      },
      {
        method: "crm.status.list",
        params: {
          filter: { ENTITY_ID: "DEAL_STAGE_7" },
        },
        options: { idKey: "ID" },
      },
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

  it("loads every paginated stage page", async () => {
    const gateway = createGateway({
      lists: {
        "crm.status.list": (params) => {
          const filter = params.filter as Record<string, unknown>;
          return filter.ENTITY_ID === "DEAL_STAGE"
            ? [[MAIN_STAGES[0]], [MAIN_STAGES[1]]]
            : [[REPEAT_STAGES[0]], [REPEAT_STAGES[1]]];
        },
      },
    });
    const adapter = new BitrixDealReadAdapter(gateway);

    await expect(adapter.getDealFilterOptions()).resolves.toMatchObject({
      pipelines: [
        { id: "0", name: "Основная" },
        { id: "7", name: "Повторные продажи" },
      ],
      stages: [
        { id: "LOSE", pipelineId: "0" },
        { id: "C7:LOSE", pipelineId: "7" },
        { id: "C7:APOLOGY", pipelineId: "7" },
      ],
    });
  });

  it("loads a lost stage from the 51st status-list position", async () => {
    const firstPage = Array.from({ length: 50 }, (_, index) => ({
      ID: String(index + 1),
      STATUS_ID: `PROCESS_${index + 1}`,
      NAME: `Рабочая ${index + 1}`,
      SORT: String((index + 1) * 10),
      EXTRA: { SEMANTICS: "process" },
    }));
    const gateway = createGateway({
      calls: {
        "crm.category.list": {
          categories: [{ id: 0, name: "Основная" }],
        },
      },
      lists: {
        "crm.status.list": [
          firstPage,
          [
            {
              ID: "51",
              STATUS_ID: "LOSE_51",
              NAME: "Проиграна 51",
              SORT: "510",
              EXTRA: { SEMANTICS: "failure" },
            },
          ],
        ],
      },
    });
    const adapter = new BitrixDealReadAdapter(gateway);

    await expect(adapter.getDealFilterOptions()).resolves.toMatchObject({
      stages: [{ id: "LOSE_51", pipelineId: "0", isLost: true }],
    });
  });

  it("loads the 51st category from a second list page", async () => {
    const categories = Array.from({ length: 51 }, (_, id) => ({
      id,
      name: `Воронка ${id}`,
    }));
    const gateway = createGateway({
      calls: {
        "crm.category.list": (params: Readonly<Record<string, unknown>>) => {
          const start = Number(params.start);
          return { categories: categories.slice(start, start + 50) };
        },
      },
      lists: {
        "crm.status.list": [],
      },
    });
    const adapter = new BitrixDealReadAdapter(gateway);

    const options = await adapter.getDealFilterOptions();
    expect(options.pipelines).toHaveLength(51);
    expect(options.pipelines.at(-1)).toEqual({
      id: "50",
      name: "Воронка 50",
    });
  });

  it("deduplicates a category repeated across list pages", async () => {
    const firstPage = Array.from({ length: 50 }, (_, id) => ({
      id,
      name: `Воронка ${id}`,
    }));
    const gateway = createGateway({
      calls: {
        "crm.category.list": (params: Readonly<Record<string, unknown>>) => ({
          categories:
            params.start === 0 ? firstPage : [{ id: 0, name: "Воронка 0" }],
        }),
      },
      lists: {
        "crm.status.list": [],
      },
    });
    const adapter = new BitrixDealReadAdapter(gateway);

    const options = await adapter.getDealFilterOptions();
    expect(options.pipelines).toHaveLength(50);
    expect(options.pipelines.filter(({ id }) => id === "0")).toHaveLength(1);
  });

  it("deduplicates a stage repeated across list pages", async () => {
    const gateway = createGateway({
      calls: {
        "crm.category.list": {
          categories: [{ id: 0, name: "Основная" }],
        },
      },
      lists: {
        "crm.status.list": [[MAIN_STAGES[1]], [MAIN_STAGES[1]]],
      },
    });
    const adapter = new BitrixDealReadAdapter(gateway);

    await expect(adapter.getDealFilterOptions()).resolves.toMatchObject({
      stages: [{ id: "LOSE", pipelineId: "0" }],
    });
  });

  it("preserves the CRM sort order across status-list pages", async () => {
    const gateway = createGateway({
      calls: {
        "crm.category.list": {
          categories: [{ id: 0, name: "Основная" }],
        },
      },
      lists: {
        "crm.status.list": [
          [
            {
              STATUS_ID: "LOSE_LATE",
              NAME: "Поздняя",
              SORT: "200",
              EXTRA: { SEMANTICS: "failure" },
            },
          ],
          [
            {
              STATUS_ID: "LOSE_EARLY",
              NAME: "Ранняя",
              SORT: "100",
              EXTRA: { SEMANTICS: "failure" },
            },
          ],
        ],
      },
    });
    const adapter = new BitrixDealReadAdapter(gateway);

    await expect(adapter.getDealFilterOptions()).resolves.toMatchObject({
      stages: [{ id: "LOSE_EARLY" }, { id: "LOSE_LATE" }],
    });
  });

  it("preserves the CRM sort order across category-list pages", async () => {
    const firstPage = [
      { id: 0, name: "Поздняя", sort: 200 },
      ...Array.from({ length: 49 }, (_, index) => ({
        id: index + 1,
        name: `Ещё ${index + 1}`,
        sort: index + 300,
      })),
    ];
    const gateway = createGateway({
      calls: {
        "crm.category.list": (params: Readonly<Record<string, unknown>>) => ({
          categories:
            params.start === 0
              ? firstPage
              : [{ id: 50, name: "Ранняя", sort: 100 }],
        }),
      },
      lists: {
        "crm.status.list": [],
      },
    });
    const adapter = new BitrixDealReadAdapter(gateway);

    const options = await adapter.getDealFilterOptions();
    expect(options.pipelines.at(0)).toMatchObject({ id: "50" });
    expect(options.pipelines.at(1)).toMatchObject({ id: "0" });
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
    ["categories", [{ id: -1, name: "Некорректная" }]],
  ])(
    "rejects malformed %s payloads without guessing",
    async (kind, payload) => {
      const gateway =
        kind === "categories"
          ? createGateway({
              calls: {
                "crm.category.list": { categories: payload },
              },
            })
          : createGateway({ calls: { profile: payload } });
      const adapter = new BitrixDealReadAdapter(gateway);

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
        lists: {
          "crm.status.list": [[{ STATUS_ID: "LOSE", NAME: "" }]],
        },
      }),
    );
    const badUser = new BitrixDealReadAdapter(
      createGateway({
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
          entity: "deal",
          id: "501",
          title: "Сделка 501",
          statusId: "LOSE",
          statusName: "Проиграна",
          pipelineId: "0",
          pipelineName: "Основная",
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
        "crm.category.list": {
          categories: [{ id: 0, name: "Основная" }],
        },
      },
      lists: {
        "crm.status.list": [
          [
            {
              STATUS_ID: "NEW",
              NAME: "Новая",
              EXTRA: { SEMANTICS: "process" },
            },
          ],
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
    const fetchDictionaryList = base.fetchList.bind(base);
    base.fetchList = async function* (method, params, options) {
      if (method !== "crm.item.list") {
        yield* fetchDictionaryList(method, params, options);
        return;
      }
      this.lists.push({ method, params, options });
      await Promise.resolve();
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
    const fetchRequestFailureDictionary = requestFailureGateway.fetchList.bind(
      requestFailureGateway,
    );
    requestFailureGateway.fetchList = async function* (
      method,
      params,
      options,
    ) {
      if (method !== "crm.item.list") {
        yield* fetchRequestFailureDictionary(method, params, options);
        return;
      }
      this.lists.push({ method, params, options });
      await Promise.resolve();
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

  it.each([
    "1",
    "2026-01-10",
    "2026-01-10T12:00:00",
    "2026-02-30T12:00:00+03:00",
  ])("rejects malformed CRM datetime %s", async (createdTime) => {
    const adapter = new BitrixDealReadAdapter(
      createGateway({
        lists: {
          "crm.item.list": [[rawDeal(1, { createdTime })]],
        },
      }),
    );

    await expect(adapter.searchDeals(BASE_CRITERIA)).resolves.toEqual({
      kind: "failure",
      code: "invalid-bitrix-response",
    });
  });
});

describe("BitrixDealReadAdapter lead read path", () => {
  const leadStatuses = [
    {
      ID: "1",
      STATUS_ID: "NEW",
      NAME: "Новый",
      SORT: "10",
      EXTRA: { SEMANTICS: "process" },
    },
    {
      ID: "2",
      STATUS_ID: "NOT_INTERESTED",
      NAME: "Не интересно",
      SORT: "200",
      EXTRA: { SEMANTICS: "failure" },
    },
    {
      ID: "3",
      STATUS_ID: "JUNK",
      NAME: "Некачественный лид",
      SORT: "100",
      SEMANTICS: "F",
    },
    {
      ID: "4",
      STATUS_ID: "CONVERTED",
      NAME: "Сконвертирован",
      SORT: "300",
      EXTRA: { SEMANTICS: "success" },
    },
  ];

  it("loads all failed lead statuses in CRM order without deal categories", async () => {
    const firstPage = [
      ...Array.from({ length: 48 }, (_, index) => ({
        ID: String(index + 10),
        STATUS_ID: `PROCESS_${index}`,
        NAME: `Рабочий ${index}`,
        SORT: String(index + 300),
        EXTRA: { SEMANTICS: "process" },
      })),
      leadStatuses[1],
      leadStatuses[3],
    ];
    const gateway = createGateway({
      lists: {
        "crm.status.list": [firstPage, [leadStatuses[2], leadStatuses[1]]],
      },
    });
    const adapter = new BitrixDealReadAdapter(gateway);

    await expect(adapter.getFilterOptions("lead")).resolves.toEqual({
      entity: "lead",
      statuses: [
        { id: "JUNK", name: "Некачественный лид", isFailed: true },
        { id: "NOT_INTERESTED", name: "Не интересно", isFailed: true },
      ],
      assignees: [
        { id: "10", name: "Анна Смирнова" },
        { id: "20", name: "Михаил Волков" },
      ],
      timeZoneLabel: "Europe/Moscow (сейчас UTC+03:00)",
    });
    expect(gateway.calls).not.toContainEqual(
      expect.objectContaining({ method: "crm.category.list" }),
    );
    expect(gateway.lists[0]).toEqual({
      method: "crm.status.list",
      params: { filter: { ENTITY_ID: "STATUS" } },
      options: { idKey: "ID" },
    });
  });

  it.each([
    { name: "null row", row: null },
    { name: "array row", row: [] },
    { name: "missing status ID", row: { NAME: "Ошибка", SEMANTICS: "F" } },
    {
      name: "empty failed-status name",
      row: { STATUS_ID: "BROKEN", NAME: " ", SEMANTICS: "F" },
    },
    {
      name: "invalid failed-status sort",
      row: { STATUS_ID: "BROKEN", NAME: "Ошибка", SEMANTICS: "F", SORT: -1 },
    },
  ])("fails closed on a lead dictionary with $name", async ({ row }) => {
    const gateway = createGateway({
      lists: {
        "crm.status.list": [[leadStatuses[2]], [row]],
        "crm.item.list": [[rawLead(701)]],
      },
    });
    const adapter = new BitrixDealReadAdapter(gateway);

    await expect(adapter.getFilterOptions("lead")).rejects.toMatchObject({
      code: "invalid-bitrix-response",
    });
    await expect(adapter.search(BASE_LEAD_CRITERIA)).resolves.toEqual({
      kind: "failure",
      code: "invalid-bitrix-response",
    });
    expect(gateway.lists.some(({ method }) => method === "crm.item.list")).toBe(
      false,
    );
  });

  it("does not infer failed leads from malformed or absent semantics", async () => {
    const gateway = createGateway({
      lists: {
        "crm.status.list": [
          [
            { STATUS_ID: "JUNK", NAME: "Без семантики" },
            {
              STATUS_ID: "ARRAY",
              NAME: "Массив",
              EXTRA: [{ SEMANTICS: "failure" }],
            },
            { STATUS_ID: "OBJECT", NAME: "Объект", SEMANTICS: { value: "F" } },
            {
              STATUS_ID: "UNKNOWN",
              NAME: "Неизвестная",
              EXTRA: { SEMANTICS: "apology" },
            },
          ],
        ],
        "crm.item.list": [[rawLead(701)]],
      },
    });

    await expect(
      new BitrixDealReadAdapter(gateway).search(BASE_LEAD_CRITERIA),
    ).resolves.toEqual({ kind: "empty" });
    expect(gateway.lists.some(({ method }) => method === "crm.item.list")).toBe(
      false,
    );
  });

  it("builds the exact failed-lead query and parses historical assignees", async () => {
    const gateway = createGateway({
      lists: {
        "crm.status.list": [leadStatuses],
        "crm.item.list": [[rawLead(701, { assignedById: 99 })]],
      },
    });
    const adapter = new BitrixDealReadAdapter(gateway);

    await expect(adapter.search(BASE_LEAD_CRITERIA)).resolves.toEqual({
      kind: "success",
      items: [
        {
          entity: "lead",
          id: "701",
          title: "Лид 701",
          statusId: "JUNK",
          statusName: "Некачественный лид",
          assignedById: "99",
          assignedByName: "Пользователь ID 99",
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
        entityTypeId: 1,
        select: [
          "id",
          "title",
          "stageId",
          "assignedById",
          "createdTime",
          "updatedTime",
        ],
        filter: {
          "@stageId": ["JUNK", "NOT_INTERESTED"],
          "<=createdTime": "2026-09-01T23:59:59+03:00",
        },
      },
      options: { idKey: "id", customKeyForResult: "items" },
    });
  });

  it("uses selected failed status, assignee, and updated date", async () => {
    const gateway = createGateway({
      lists: {
        "crm.status.list": [leadStatuses],
        "crm.item.list": [[]],
      },
    });
    const adapter = new BitrixDealReadAdapter(gateway);

    await adapter.search({
      ...BASE_LEAD_CRITERIA,
      dateField: "updatedAt",
      statusId: "NOT_INTERESTED",
      assignedById: "20",
    });

    expect(
      gateway.lists.find(({ method }) => method === "crm.item.list")?.params,
    ).toMatchObject({
      filter: {
        stageId: "NOT_INTERESTED",
        assignedById: 20,
        "<=updatedTime": "2026-09-01T23:59:59+03:00",
      },
    });
  });

  it("does not request unfiltered lead items without failed statuses", async () => {
    const gateway = createGateway({
      lists: { "crm.status.list": [[leadStatuses[0], leadStatuses[3]]] },
    });
    const adapter = new BitrixDealReadAdapter(gateway);

    await expect(adapter.search(BASE_LEAD_CRITERIA)).resolves.toEqual({
      kind: "empty",
    });
    expect(gateway.lists.some(({ method }) => method === "crm.item.list")).toBe(
      false,
    );
  });

  it.each([
    [0, { kind: "empty" }],
    [3000, { kind: "success" }],
    [3001, { kind: "over-limit", matchedAtLeast: 3001 }],
  ] as const)(
    "handles the %i unique-lead boundary",
    async (count, expected) => {
      const gateway = createGateway({
        lists: {
          "crm.status.list": [leadStatuses],
          "crm.item.list": [
            Array.from({ length: count }, (_, index) => rawLead(index + 1)),
          ],
        },
      });
      const result = await new BitrixDealReadAdapter(gateway).search(
        BASE_LEAD_CRITERIA,
      );

      expect(result).toMatchObject(expected);
      if (result.kind === "success") expect(result.items).toHaveLength(count);
    },
  );

  it("deduplicates leads and safely rejects malformed fields and criteria", async () => {
    const duplicateGateway = createGateway({
      lists: {
        "crm.status.list": [leadStatuses],
        "crm.item.list": [[rawLead(1), rawLead(1)]],
      },
    });
    const malformedGateway = createGateway({
      lists: {
        "crm.status.list": [leadStatuses],
        "crm.item.list": [[rawLead(1, { stageId: "UNKNOWN" })]],
      },
    });

    await expect(
      new BitrixDealReadAdapter(duplicateGateway).search(BASE_LEAD_CRITERIA),
    ).resolves.toMatchObject({ kind: "success", items: [{ id: "1" }] });
    await expect(
      new BitrixDealReadAdapter(malformedGateway).search(BASE_LEAD_CRITERIA),
    ).resolves.toEqual({
      kind: "failure",
      code: "invalid-bitrix-response",
    });
    await expect(
      new BitrixDealReadAdapter(createGateway()).search({
        ...BASE_LEAD_CRITERIA,
        statusId: "SUCCESS",
      }),
    ).resolves.toEqual({
      kind: "failure",
      code: "invalid-search-criteria",
    });
  });
});
