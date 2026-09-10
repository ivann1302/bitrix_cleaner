export type BitrixReadCallMethod =
  "profile" | "crm.category.list" | "crm.status.list";

export type BitrixReadListMethod = "user.get" | "crm.item.list";

export interface BitrixListOptions {
  readonly idKey: string;
  readonly customKeyForResult?: string;
}

export interface BitrixReadGateway {
  readonly portalOrigin: string;
  readonly isAdmin: boolean;
  call(
    method: BitrixReadCallMethod,
    params?: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  fetchList(
    method: BitrixReadListMethod,
    params: Readonly<Record<string, unknown>>,
    options: BitrixListOptions,
  ): AsyncIterable<readonly unknown[]>;
  destroy(): void;
}

export class BitrixGatewayError extends Error {
  public readonly code: string;

  public constructor(code: string) {
    super(code);
    this.name = "BitrixGatewayError";
    this.code = code;
  }
}
