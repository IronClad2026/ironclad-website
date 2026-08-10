import { vi } from "vitest";

export type SupabaseQueryCall = {
  args: unknown[];
  method: string;
};

const supportedQueryMethods = [
  "delete",
  "eq",
  "in",
  "is",
  "maybeSingle",
  "not",
  "order",
  "select",
  "update",
] as const;

type SupportedQueryMethod = (typeof supportedQueryMethods)[number];

export function createSupabaseQueryMock({
  data = null,
  error = null,
}: {
  data?: unknown;
  error?: { message: string } | null;
} = {}) {
  const calls: SupabaseQueryCall[] = [];
  const result = { data, error };
  type QueryMethod = (...args: unknown[]) => QueryMock;
  type QueryMock = PromiseLike<typeof result> &
    Record<SupportedQueryMethod, QueryMethod>;
  const target: Partial<QueryMock> = {};
  const query = new Proxy(
    target,
    {
      get(currentTarget, property, receiver) {
        if (
          typeof property === "string" &&
          !Object.hasOwn(currentTarget, property)
        ) {
          throw new Error(
            `Unsupported Supabase query mock method: ${property}`
          );
        }

        return Reflect.get(currentTarget, property, receiver);
      },
    }
  ) as QueryMock;

  for (const method of supportedQueryMethods) {
    target[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return query;
    };
  }

  target.then = (resolve, reject) =>
    Promise.resolve(result).then(resolve, reject);

  const from = vi.fn(() => query);

  return {
    calls,
    client: {
      from,
    },
    from,
    query,
  };
}
