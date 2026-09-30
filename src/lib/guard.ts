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
