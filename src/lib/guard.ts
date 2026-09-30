export type ActionResult = { error?: string; ok?: string } | void;

// Turns a thrown error into a message the page can show (production hides raw errors).
export async function guard(fn: () => Promise<string | void>): Promise<ActionResult> {
  try {
    const ok = await fn();
    return ok ? { ok } : {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

// For pages: load in a try, render outside it, so a failed read shows a message instead of breaking the page.
export async function load<T>(fn: () => Promise<T>): Promise<{ ok: T } | { err: string }> {
  try {
    return { ok: await fn() };
  } catch (e) {
    return { err: e instanceof Error ? e.message : "Could not load." };
  }
}
