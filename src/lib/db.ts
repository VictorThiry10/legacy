import "server-only";
import { db } from "./supabase/server";
import type { Database, Json } from "./supabase/types";

type Err = { message: string; code?: string };

// Turns a database error into a message people can act on.
export function fail(e: Err): never {
  if (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message)) {
    throw new Error("The database needs updating: apply the files in supabase/migrations.");
  }
  throw new Error(e.message);
}

// Supabase returns at most 1000 rows per request: page through bigger reads.
export async function all<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: Err | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error) fail(error);
    out.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) return out;
  }
}

// Long id lists go in several requests (they travel in the URL).
export const chunks = <T>(xs: T[], n = 100) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

type Fns = Database["public"]["Functions"];

// Calls one of our database functions (supabase/migrations), throwing on error.
export async function rpc<F extends keyof Fns>(name: F, args: Fns[F]["Args"]): Promise<Fns[F]["Returns"]> {
  const { data, error } = await db().rpc(name, args as never);
  if (error) fail(error);
  return data as Fns[F]["Returns"];
}

export type { Json };
