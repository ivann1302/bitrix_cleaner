import { describe, expect, it, vi } from "vitest";
import type {
  BitrixListOptions,
  BitrixReadCallMethod,
  BitrixReadGateway,
  BitrixReadListMethod,
} from "../bitrix/BitrixReadGateway";
import { MockBitrixAdapter } from "../deals/data/MockBitrixAdapter";
import { BitrixDealReadAdapter } from "../deals/data/BitrixDealReadAdapter";
import { MOCK_APP_CONTEXT } from "../deals/data/mockContext";
import { createAppRuntime } from "./runtime";

class RuntimeGateway implements BitrixReadGateway {
  public readonly portalOrigin = "https://team.bitrix24.ru";
  public readonly isAdmin = true;
  public readonly destroy = vi.fn();

  public call(
    method: BitrixReadCallMethod,
    params: Readonly<Record<string, unknown>> = {},
  ): Promise<unknown> {
    void params;
    if (method === "profile") {
      return Promise.resolve({
        ID: "42",
        NAME: "Иван",
        LAST_NAME: "Иванов",
        TIME_ZONE: "Europe/Moscow",
        TIME_ZONE_OFFSET: "10800",
      });
    }
    return Promise.resolve(undefined);
  }

  public async *fetchList(
    method: BitrixReadListMethod,
    params: Readonly<Record<string, unknown>>,
    options: BitrixListOptions,
  ): AsyncIterable<readonly unknown[]> {
    void method;
    void params;
    void options;
    await Promise.resolve();
  }
}

describe("createAppRuntime", () => {
  it("uses the local mock only outside an iframe", async () => {
    const connect = vi.fn();

    const runtime = await createAppRuntime({
      isEmbedded: () => false,
      connect,
    });

    expect(runtime.mode).toBe("demo");
    expect(runtime.adapter).toBeInstanceOf(MockBitrixAdapter);
    expect(runtime.context).toEqual(MOCK_APP_CONTEXT);
    expect(connect).not.toHaveBeenCalled();
  });

  it("loads context before returning a read-only iframe runtime", async () => {
    const gateway = new RuntimeGateway();

    const runtime = await createAppRuntime({
      isEmbedded: () => true,
      connect: () => Promise.resolve(gateway),
    });

    expect(runtime.mode).toBe("bitrix-readonly");
    expect(runtime.adapter).toBeInstanceOf(BitrixDealReadAdapter);
    expect(runtime.context).toEqual({
      portal: "https://team.bitrix24.ru",
      userId: "42",
      userName: "Иван Иванов",
      isAdmin: true,
      timeZone: "Europe/Moscow",
      timeZoneLabel: "Europe/Moscow (сейчас UTC+03:00)",
      timeZoneOffsetSeconds: 10800,
    });
    runtime.destroy();
    expect(gateway.destroy).toHaveBeenCalledOnce();
  });

  it("destroys a connected SDK and exposes only a safe init code on failure", async () => {
    const gateway = new RuntimeGateway();
    gateway.call = () => Promise.reject(new Error("access_token=secret"));

    await expect(
      createAppRuntime({
        isEmbedded: () => true,
        connect: () => Promise.resolve(gateway),
      }),
    ).rejects.toMatchObject({
      code: "sdk-init-failed",
      message: "sdk-init-failed",
    });
    expect(gateway.destroy).toHaveBeenCalledOnce();
  });

  it("maps connector rejection to the same safe init code", async () => {
    await expect(
      createAppRuntime({
        isEmbedded: () => true,
        connect: () => Promise.reject(new Error("frame details")),
      }),
    ).rejects.toMatchObject({
      code: "sdk-init-failed",
      message: "sdk-init-failed",
    });
  });
});
