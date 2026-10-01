"use client";

// Photos are decoded before a card flips over, so it never turns onto a blank face.
// One decode per address, shared by every caller. A failed one is forgotten so the next caller tries again.
const decoded = new Map<string, Promise<void>>();

function decode(src: string) {
  let p = decoded.get(src);
  if (!p) {
    const img = new Image();
    img.decoding = "async";
    img.src = src;
    p = img.decode().catch(() => {
      decoded.delete(src);
    });
    decoded.set(src, p);
  }
  return p;
}

// Starts decoding now; nobody waits.
export function preload(srcs: (string | null | undefined)[]) {
  if (typeof window === "undefined") return;
  srcs.forEach((s) => s && decode(s));
}

// Resolves once every image is decoded, or after capMs at most: a slow photo never holds the room up.
export function ready(srcs: (string | null | undefined)[], capMs: number): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const all = Promise.all(srcs.flatMap((s) => (s ? [decode(s)] : [])));
  return new Promise((done) => {
    const t = setTimeout(done, capMs);
    all.then(() => {
      clearTimeout(t);
      done();
    });
  });
}
