import "server-only";

import { mutateLocalTable, readLocalTable, type LocalRow } from "@/lib/leadgen/local-database";

type QueryError = { message: string; code?: string };
type QueryResult<T = unknown> = { data: T; error: QueryError | null; count?: number | null };
type Filter = (row: LocalRow) => boolean;
type Order = { column: string; ascending: boolean };

function clone<T>(value: T): T {
  return structuredClone(value);
}

function project(row: LocalRow, columns: string) {
  if (!columns || columns.trim() === "*") return clone(row);
  const selected: LocalRow = {};
  for (const token of columns.split(",")) {
    const column = token.trim();
    if (column && !column.includes("(")) selected[column] = clone(row[column]);
  }
  return selected;
}

function comparable(value: unknown) {
  if (value === null || value === undefined) return value;
  return typeof value === "number" ? value : String(value);
}

class LocalQueryBuilder implements PromiseLike<QueryResult<unknown>> {
  private operation: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private payload: LocalRow[] = [];
  private filters: Filter[] = [];
  private columns = "*";
  private head = false;
  private countRequested = false;
  private orders: Order[] = [];
  private maximum: number | null = null;
  private singular: "single" | "maybe" | null = null;
  private conflictColumns: string[] = ["id"];

  constructor(private readonly table: string) {}

  select(columns = "*", options?: { count?: string; head?: boolean }) {
    this.columns = columns;
    this.head = options?.head === true;
    this.countRequested = options?.count === "exact";
    return this;
  }

  insert(values: LocalRow | LocalRow[]) {
    this.operation = "insert";
    this.payload = clone(Array.isArray(values) ? values : [values]);
    return this;
  }

  upsert(values: LocalRow | LocalRow[], options?: { onConflict?: string }) {
    this.operation = "upsert";
    this.payload = clone(Array.isArray(values) ? values : [values]);
    this.conflictColumns = (options?.onConflict ?? "id").split(",").map((item) => item.trim());
    return this;
  }

  update(values: LocalRow) {
    this.operation = "update";
    this.payload = [clone(values)];
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  eq(column: string, value: unknown) { this.filters.push((row) => row[column] === value); return this; }
  neq(column: string, value: unknown) { this.filters.push((row) => row[column] !== value); return this; }
  gt(column: string, value: unknown) { this.filters.push((row) => comparable(row[column])! > comparable(value)!); return this; }
  gte(column: string, value: unknown) { this.filters.push((row) => comparable(row[column])! >= comparable(value)!); return this; }
  lt(column: string, value: unknown) { this.filters.push((row) => comparable(row[column])! < comparable(value)!); return this; }
  lte(column: string, value: unknown) { this.filters.push((row) => comparable(row[column])! <= comparable(value)!); return this; }
  in(column: string, values: unknown[]) { const set = new Set(values); this.filters.push((row) => set.has(row[column])); return this; }
  is(column: string, value: unknown) { this.filters.push((row) => value === null ? row[column] == null : row[column] === value); return this; }
  not(column: string, operator: string, value: unknown) {
    if (operator === "is") this.filters.push((row) => value === null ? row[column] != null : row[column] !== value);
    else this.filters.push((row) => row[column] !== value);
    return this;
  }
  like(column: string, pattern: string) {
    const expression = new RegExp(`^${pattern.split("%").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`, "i");
    this.filters.push((row) => expression.test(String(row[column] ?? "")));
    return this;
  }
  or(expression: string) {
    const alternatives = expression.split(",").map((condition) => {
      const [column, operator, ...rawParts] = condition.split(".");
      const raw = rawParts.join(".");
      const value = raw === "null" ? null : raw;
      if (operator === "is") return (row: LocalRow) => value === null ? row[column] == null : row[column] === value;
      if (operator === "lt") return (row: LocalRow) => comparable(row[column])! < comparable(value)!;
      if (operator === "not" && rawParts[0] === "is") {
        const nested = rawParts.slice(1).join(".");
        return (row: LocalRow) => nested === "null" ? row[column] != null : row[column] !== nested;
      }
      return () => false;
    });
    this.filters.push((row) => alternatives.some((filter) => filter(row)));
    return this;
  }
  order(column: string, options?: { ascending?: boolean }) { this.orders.push({ column, ascending: options?.ascending !== false }); return this; }
  limit(value: number) { this.maximum = Math.max(0, value); return this; }
  single<T = unknown>() { this.singular = "single"; return this as unknown as PromiseLike<QueryResult<T>>; }
  maybeSingle<T = unknown>() { this.singular = "maybe"; return this as unknown as PromiseLike<QueryResult<T | null>>; }
  returns<T>() { return this as unknown as PromiseLike<QueryResult<T>>; }

  private matches(row: LocalRow) { return this.filters.every((filter) => filter(row)); }

  private format(rows: LocalRow[]): QueryResult<unknown> {
    const sorted = [...rows];
    if (this.orders.length) {
      sorted.sort((left, right) => {
        for (const order of this.orders) {
          const a = comparable(left[order.column]);
          const b = comparable(right[order.column]);
          if (a === b) continue;
          const direction = a == null ? -1 : b == null ? 1 : a < b ? -1 : 1;
          return order.ascending ? direction : -direction;
        }
        return 0;
      });
    }
    const limited = this.maximum === null ? sorted : sorted.slice(0, this.maximum);
    const count = this.countRequested ? sorted.length : null;
    if (this.head) return { data: null, error: null, count };
    const data = limited.map((row) => project(row, this.columns));
    if (this.singular === "single" && data.length !== 1) {
      return {
        data: null,
        error: { message: "JSON object requested, but the result contains zero or multiple rows", code: "PGRST116" },
        count,
      };
    }
    if (this.singular === "single") return { data: data[0], error: null, count };
    if (this.singular === "maybe") return { data: data[0] ?? null, error: null, count };
    return { data, error: null, count };
  }

  private async execute(): Promise<QueryResult<unknown>> {
    if (this.operation === "select") {
      return this.format((await readLocalTable(this.table)).filter((row) => this.matches(row)));
    }
    return mutateLocalTable(this.table, (rows) => {
      const affected: LocalRow[] = [];
      if (this.operation === "insert") {
        for (const item of this.payload) {
          if (item.id != null && rows.some((row) => row.id === item.id)) continue;
          rows.push(item);
          affected.push(item);
        }
      } else if (this.operation === "upsert") {
        for (const item of this.payload) {
          const index = rows.findIndex((row) => this.conflictColumns.every((key) => row[key] === item[key]));
          if (index >= 0) rows[index] = { ...rows[index], ...item };
          else rows.push(item);
          affected.push(index >= 0 ? rows[index] : item);
        }
      } else if (this.operation === "update") {
        for (let index = 0; index < rows.length; index += 1) {
          if (!this.matches(rows[index])) continue;
          rows[index] = { ...rows[index], ...this.payload[0] };
          affected.push(rows[index]);
        }
      } else if (this.operation === "delete") {
        const kept: LocalRow[] = [];
        for (const row of rows) {
          if (this.matches(row)) affected.push(row);
          else kept.push(row);
        }
        rows.splice(0, rows.length, ...kept);
      }
      return this.format(affected);
    });
  }

  then<TResult1 = QueryResult<unknown>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<unknown>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

export function createLocalSupabaseClient() {
  return {
    from(table: string) { return new LocalQueryBuilder(table); },
    async rpc(name: string, args: Record<string, unknown> = {}) {
      if (name === "claim_followup_reply_scan") {
        const now = Date.now();
        const lockSeconds = Number(args.lock_seconds ?? 180);
        return mutateLocalTable("leadgen_followup_scan_lock", (rows) => {
          const current = rows[0];
          if (current && Date.parse(String(current.updated_at ?? "")) > now - lockSeconds * 1000) return { data: false, error: null };
          rows.splice(0, rows.length, { id: "global", worker_id: args.worker_id, updated_at: new Date(now).toISOString() });
          return { data: true, error: null };
        });
      }
      if (name === "release_followup_reply_scan") {
        return mutateLocalTable("leadgen_followup_scan_lock", (rows) => {
          const kept = rows.filter((row) => row.worker_id !== args.worker_id);
          rows.splice(0, rows.length, ...kept);
          return { data: true, error: null };
        });
      }
      if (name === "claim_due_outreach_item") {
        return mutateLocalTable("leadgen_outreach_queue", (rows) => {
          const now = new Date();
          const due = rows.filter((row) => row.status === "queued" && Date.parse(String(row.next_attempt_at ?? row.scheduled_at ?? row.created_at)) <= now.getTime())
            .sort((left, right) => Date.parse(String(left.next_attempt_at ?? left.created_at)) - Date.parse(String(right.next_attempt_at ?? right.created_at)))[0];
          if (!due) return { data: [], error: null };
          due.status = "sending";
          due.sending_started_at = now.toISOString();
          due.attempt_count = Number(due.attempt_count ?? 0) + 1;
          due.provider = args.worker_id;
          due.updated_at = now.toISOString();
          return { data: [clone(due)], error: null };
        });
      }
      return { data: null, error: { message: `Unsupported local RPC: ${name}` } };
    },
  };
}
