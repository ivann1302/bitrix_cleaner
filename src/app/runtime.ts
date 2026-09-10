import { connectB24SdkReadGateway } from "../bitrix/B24SdkReadGateway";
import type { BitrixReadGateway } from "../bitrix/BitrixReadGateway";
import type { BitrixAdapter } from "../deals/data/BitrixAdapter";
import { BitrixDealReadAdapter } from "../deals/data/BitrixDealReadAdapter";
import { MockBitrixAdapter } from "../deals/data/MockBitrixAdapter";
import { MOCK_APP_CONTEXT } from "../deals/data/mockContext";
import type { AppContext } from "../deals/domain/types";

export type AppMode = "demo" | "bitrix-readonly";

export interface AppRuntime {
  readonly mode: AppMode;
  readonly adapter: BitrixAdapter;
  readonly context: AppContext;
  destroy(): void;
}

export interface AppRuntimeDependencies {
  readonly isEmbedded: () => boolean;
  readonly connect: () => Promise<BitrixReadGateway>;
}

export class AppRuntimeError extends Error {
  public readonly code: "sdk-init-failed";

  public constructor() {
    super("sdk-init-failed");
    this.name = "AppRuntimeError";
    this.code = "sdk-init-failed";
  }
}

function browserIsEmbedded(): boolean {
  return window.self !== window.top;
}

const DEFAULT_DEPENDENCIES: AppRuntimeDependencies = {
  isEmbedded: browserIsEmbedded,
  connect: connectB24SdkReadGateway,
};

export async function createAppRuntime(
  dependencies: Partial<AppRuntimeDependencies> = {},
): Promise<AppRuntime> {
  const environment = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  if (!environment.isEmbedded()) {
    return {
      mode: "demo",
      adapter: new MockBitrixAdapter({
        behavior: { delayMs: 350, deleteDelayMs: 250 },
      }),
      context: MOCK_APP_CONTEXT,
      destroy: () => {},
    };
  }

  let gateway: BitrixReadGateway | null = null;
  try {
    gateway = await environment.connect();
    const adapter = new BitrixDealReadAdapter(gateway);
    const context = await adapter.loadContext();
    return {
      mode: "bitrix-readonly",
      adapter,
      context,
      destroy: () => gateway?.destroy(),
    };
  } catch {
    gateway?.destroy();
    throw new AppRuntimeError();
  }
}
