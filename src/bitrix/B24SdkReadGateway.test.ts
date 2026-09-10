import { describe, expect, it, vi } from "vitest";
import {
  B24SdkReadGateway,
  connectB24SdkReadGateway,
  type B24SdkFrameBridge,
} from "./B24SdkReadGateway";
import type { BitrixReadCallMethod } from "./BitrixReadGateway";
import { BitrixDealReadAdapter } from "../deals/data/BitrixDealReadAdapter";

function successfulResponse(result: unknown) {
  return {
    isSuccess: true,
    getData: () => ({ result }),
  };
}

function createFrame(
  overrides: Partial<B24SdkFrameBridge> = {},
): B24SdkFrameBridge {
  return {
    portalOrigin: "https://example.bitrix24.ru",
    isAdmin: true,
    call: vi.fn(() => Promise.resolve(successfulResponse({ ID: "7" }))),
    fetchList: vi.fn(async function* () {
      await Promise.resolve();
      yield [{ id: 1 }];
    }),
    destroy: vi.fn(),
    ...overrides,
  };
}

describe("B24SdkReadGateway", () => {
  it("unwraps a successful REST result", async () => {
    const call = vi.fn(() =>
      Promise.resolve(successfulResponse({ ID: "7", NAME: "Иван" })),
    );
    const gateway = new B24SdkReadGateway(createFrame({ call }));

    await expect(gateway.call("profile")).resolves.toEqual({
      ID: "7",
      NAME: "Иван",
    });
    expect(call).toHaveBeenCalledWith({ method: "profile", params: {} });
  });

  it("never exposes a rejected response message", async () => {
    const gateway = new B24SdkReadGateway(
      createFrame({
        call: () =>
          Promise.resolve({
            isSuccess: false,
            getData: () => ({ result: null }),
          }),
      }),
    );

    await expect(gateway.call("profile")).rejects.toMatchObject({
      code: "bitrix-request-failed",
      message: "bitrix-request-failed",
    });
  });

  it("rejects every method outside the read allowlist before the SDK call", async () => {
    const call = vi.fn(() => Promise.resolve(successfulResponse(true)));
    const gateway = new B24SdkReadGateway(createFrame({ call }));

    await expect(
      gateway.call("crm.item.delete" as BitrixReadCallMethod, { id: 10 }),
    ).rejects.toMatchObject({ code: "bitrix-method-not-allowed" });
    expect(call).not.toHaveBeenCalled();
  });

  it("streams list pages with the exact SDK cursor options", async () => {
    const fetchList = vi.fn(async function* () {
      await Promise.resolve();
      yield [{ id: 1 }];
      yield [{ id: 2 }];
    });
    const gateway = new B24SdkReadGateway(createFrame({ fetchList }));
    const pages: unknown[] = [];

    for await (const page of gateway.fetchList(
      "crm.item.list",
      { entityTypeId: 2 },
      { idKey: "id", customKeyForResult: "items" },
    )) {
      pages.push(page);
    }

    expect(pages).toEqual([[{ id: 1 }], [{ id: 2 }]]);
    expect(fetchList).toHaveBeenCalledWith({
      method: "crm.item.list",
      params: { entityTypeId: 2 },
      idKey: "id",
      customKeyForResult: "items",
    });
  });

  it("maps thrown SDK details to a stable local error", async () => {
    const gateway = new B24SdkReadGateway(
      createFrame({
        fetchList: async function* () {
          await Promise.resolve();
          throw new Error("request contained access_token=secret");
        },
      }),
    );

    const consume = async () => {
      for await (const page of gateway.fetchList(
        "user.get",
        { ACTIVE: true },
        { idKey: "ID" },
      )) {
        void page;
      }
    };

    await expect(consume()).rejects.toMatchObject({
      code: "bitrix-request-failed",
      message: "bitrix-request-failed",
    });
  });

  it("connects the official frame through a narrow bridge and destroys it", async () => {
    const destroy = vi.fn();
    const makeCall = vi.fn(() => Promise.resolve(successfulResponse(true)));
    const makeFetchList = vi.fn(async function* () {
      await Promise.resolve();
      yield [{ ID: "4" }];
    });
    const initialize = vi.fn(() =>
      Promise.resolve({
        auth: { isAdmin: false },
        actions: {
          v2: {
            call: { make: makeCall },
            fetchList: { make: makeFetchList },
          },
        },
        getTargetOrigin: () => "https://team.bitrix24.ru",
        destroy,
      }),
    );

    const gateway = await connectB24SdkReadGateway(initialize);
    await gateway.call("profile");
    for await (const page of gateway.fetchList(
      "user.get",
      {},
      { idKey: "ID" },
    )) {
      void page;
    }
    gateway.destroy();

    expect(gateway.portalOrigin).toBe("https://team.bitrix24.ru");
    expect(gateway.isAdmin).toBe(false);
    expect(makeCall).toHaveBeenCalledWith({ method: "profile", params: {} });
    expect(makeFetchList).toHaveBeenCalledWith({
      method: "user.get",
      params: {},
      idKey: "ID",
    });
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("loads the default category through offset pagination instead of the zero-skipping cursor", async () => {
    const call = vi.fn((request: { method: string; params: object }) => {
      if (request.method === "profile") {
        return Promise.resolve(
          successfulResponse({
            ID: "7",
            ADMIN: true,
            NAME: "Иван",
            LAST_NAME: "Петров",
            PERSONAL_GENDER: "",
            TIME_ZONE: "Europe/Moscow",
          }),
        );
      }
      return Promise.resolve(
        successfulResponse({
          categories: [{ id: 0, name: "Основная", sort: 100 }],
        }),
      );
    });
    const fetchList = vi.fn(async function* (request: { method: string }) {
      await Promise.resolve();
      if (request.method === "crm.category.list") {
        throw new Error("cursor starts after category zero");
      }
      if (request.method === "crm.status.list") {
        yield [
          {
            STATUS_ID: "LOSE",
            NAME: "Проиграна",
            SORT: "100",
            EXTRA: { SEMANTICS: "failure" },
          },
        ];
      }
    });
    const adapter = new BitrixDealReadAdapter(
      new B24SdkReadGateway(createFrame({ call, fetchList })),
    );

    await expect(adapter.getDealFilterOptions()).resolves.toMatchObject({
      pipelines: [{ id: "0", name: "Основная" }],
      stages: [{ id: "LOSE", pipelineId: "0" }],
    });
    expect(call).toHaveBeenCalledWith({
      method: "crm.category.list",
      params: { entityTypeId: 2, start: 0 },
    });
    expect(fetchList).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: "crm.category.list" }),
    );
  });
});
