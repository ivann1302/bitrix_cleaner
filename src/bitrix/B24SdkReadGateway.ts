import { initializeB24Frame } from "@bitrix24/b24jssdk";
import {
  BitrixGatewayError,
  type BitrixListOptions,
  type BitrixReadCallMethod,
  type BitrixReadGateway,
  type BitrixReadListMethod,
} from "./BitrixReadGateway";

interface SdkCallResponse {
  readonly isSuccess: boolean;
  getData(): unknown;
}

interface SdkCallRequest {
  readonly method: string;
  readonly params: Readonly<Record<string, unknown>>;
}

interface SdkListRequest extends SdkCallRequest {
  readonly idKey: string;
  readonly customKeyForResult?: string;
}

export interface B24SdkFrameBridge {
  readonly portalOrigin: string;
  readonly isAdmin: boolean;
  call(request: SdkCallRequest): Promise<SdkCallResponse>;
  fetchList(request: SdkListRequest): AsyncIterable<readonly unknown[]>;
  destroy(): void;
}

interface InitializableB24Frame {
  readonly auth: { readonly isAdmin: boolean };
  readonly actions: {
    readonly v2: {
      readonly call: {
        make(request: SdkCallRequest): Promise<SdkCallResponse>;
      };
      readonly fetchList: {
        make(request: SdkListRequest): AsyncIterable<readonly unknown[]>;
      };
    };
  };
  getTargetOrigin(): string;
  destroy(): void;
}

type FrameInitializer = () => Promise<InitializableB24Frame>;

const CALL_ALLOWLIST = new Set<string>(["profile", "crm.category.list"]);
const LIST_ALLOWLIST = new Set<string>([
  "user.get",
  "crm.item.list",
  "crm.status.list",
]);

function stableRequestError(): BitrixGatewayError {
  return new BitrixGatewayError("bitrix-request-failed");
}

function unwrapResult(response: SdkCallResponse): unknown {
  if (!response.isSuccess) throw stableRequestError();
  const data = response.getData();
  if (
    typeof data !== "object" ||
    data === null ||
    !Object.prototype.hasOwnProperty.call(data, "result")
  ) {
    throw new BitrixGatewayError("invalid-bitrix-response");
  }
  return (data as { readonly result: unknown }).result;
}

function normalizeRequestError(error: unknown): BitrixGatewayError {
  return error instanceof BitrixGatewayError ? error : stableRequestError();
}

export class B24SdkReadGateway implements BitrixReadGateway {
  public readonly portalOrigin: string;
  public readonly isAdmin: boolean;

  public constructor(private readonly frame: B24SdkFrameBridge) {
    this.portalOrigin = frame.portalOrigin;
    this.isAdmin = frame.isAdmin;
  }

  public async call(
    method: BitrixReadCallMethod,
    params: Readonly<Record<string, unknown>> = {},
  ): Promise<unknown> {
    if (!CALL_ALLOWLIST.has(method)) {
      throw new BitrixGatewayError("bitrix-method-not-allowed");
    }
    try {
      return unwrapResult(await this.frame.call({ method, params }));
    } catch (error) {
      throw normalizeRequestError(error);
    }
  }

  public async *fetchList(
    method: BitrixReadListMethod,
    params: Readonly<Record<string, unknown>>,
    options: BitrixListOptions,
  ): AsyncIterable<readonly unknown[]> {
    if (!LIST_ALLOWLIST.has(method)) {
      throw new BitrixGatewayError("bitrix-method-not-allowed");
    }
    try {
      const request: SdkListRequest = {
        method,
        params,
        idKey: options.idKey,
        ...(options.customKeyForResult === undefined
          ? {}
          : { customKeyForResult: options.customKeyForResult }),
      };
      for await (const page of this.frame.fetchList(request)) {
        if (!Array.isArray(page)) {
          throw new BitrixGatewayError("invalid-bitrix-response");
        }
        yield page;
      }
    } catch (error) {
      throw normalizeRequestError(error);
    }
  }

  public destroy(): void {
    this.frame.destroy();
  }
}

async function initializeOfficialFrame(): Promise<InitializableB24Frame> {
  const frame = await initializeB24Frame();
  return {
    auth: frame.auth,
    actions: {
      v2: {
        call: {
          make: (request) => frame.actions.v2.call.make(request),
        },
        fetchList: {
          make: (request) => frame.actions.v2.fetchList.make(request),
        },
      },
    },
    getTargetOrigin: () => frame.getTargetOrigin(),
    destroy: () => frame.destroy(),
  };
}

export async function connectB24SdkReadGateway(
  initialize: FrameInitializer = initializeOfficialFrame,
): Promise<B24SdkReadGateway> {
  const frame = await initialize();
  return new B24SdkReadGateway({
    portalOrigin: frame.getTargetOrigin(),
    isAdmin: frame.auth.isAdmin,
    call: (request) => frame.actions.v2.call.make(request),
    fetchList: (request) => frame.actions.v2.fetchList.make(request),
    destroy: () => frame.destroy(),
  });
}
