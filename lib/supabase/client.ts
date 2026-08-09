import "server-only";

import { createLocalSupabaseClient } from "@/lib/supabase/local-client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseRow = Record<string, any>;
type LooseError = { message: string; code?: string };
type LooseResult<T> = { data: T; error: LooseError | null; count?: number | null };

interface StorageQuery<T = LooseRow[]> extends PromiseLike<LooseResult<T>> {
  select<R = LooseRow[]>(columns?: string, options?: { count?: string; head?: boolean }): StorageQuery<R>;
  insert(values: LooseRow | LooseRow[]): StorageQuery;
  upsert(values: LooseRow | LooseRow[], options?: { onConflict?: string }): StorageQuery;
  update(values: LooseRow): StorageQuery;
  delete(): StorageQuery;
  eq(column: string, value: unknown): StorageQuery<T>;
  neq(column: string, value: unknown): StorageQuery<T>;
  gt(column: string, value: unknown): StorageQuery<T>;
  gte(column: string, value: unknown): StorageQuery<T>;
  lt(column: string, value: unknown): StorageQuery<T>;
  lte(column: string, value: unknown): StorageQuery<T>;
  in(column: string, values: unknown[]): StorageQuery<T>;
  is(column: string, value: unknown): StorageQuery<T>;
  not(column: string, operator: string, value: unknown): StorageQuery<T>;
  like(column: string, pattern: string): StorageQuery<T>;
  or(expression: string): StorageQuery<T>;
  order(column: string, options?: { ascending?: boolean }): StorageQuery<T>;
  limit(value: number): StorageQuery<T>;
  single<R = LooseRow>(): PromiseLike<LooseResult<R>>;
  maybeSingle<R = LooseRow>(): PromiseLike<LooseResult<R | null>>;
  returns<R>(): PromiseLike<LooseResult<R>>;
}

interface StorageClient {
  from(table: string): StorageQuery;
  rpc(name: string, args?: Record<string, unknown>): Promise<LooseResult<unknown>>;
}

export function createSupabaseServerClient(): StorageClient {
  // Runtime is deliberately local-first. Remote Supabase access is isolated in
  // the explicit backup sync module and can never block operational workflows.
  return createLocalSupabaseClient() as unknown as StorageClient;
}
