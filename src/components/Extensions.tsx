"use client";
import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { ExtensionOffer } from "@/lib/extensions";
import { decideExtensions } from "@/app/(league)/extensions/actions";
import { headshot } from "@/lib/names";
import { money } from "@/lib/rules";
import PendingRow, { ContractIcon } from "./PendingRow";

// The one-off contract extensions pop-up: tick last season's players to keep for 1 year at last season's salary.
// It opens by itself on the first page of a visit; "Later" closes it, and the Team page's to-do row opens it again.
// Deciding (even "no extensions") closes it for good.
export default function Extensions({ offer }: { offer: ExtensionOffer }) {
  const [open, setOpen] = useState(true);
  return open ? <Sheet offer={offer} onClose={() => setOpen(false)} /> : null;
}

// The Team page's to-do row (Pending.tsx). The pop-up goes on <body>: the page slides, which would trap it.
export function ExtensionsRow({ offer }: { offer: ExtensionOffer }) {
  const [open, setOpen] = useState(false);
  const left = offer.players.filter((p) => !p.taken).length;
  return (
    <>
      <PendingRow
        onClick={() => setOpen(true)} icon={<ContractIcon />} title="Contract extensions" action="Decide"
        sub={`${left} player${left === 1 ? "" : "s"} from last season`}
      />
      {open && createPortal(<Sheet offer={offer} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function Sheet({ offer, onClose }: { offer: ExtensionOffer; onClose: () => void }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const chosen = offer.players.filter((p) => picked.has(p.id));
  const total = chosen.reduce((a, p) => a + p.salary, 0);
  const spaceAfter = offer.capSpace - total;
  const rosterAfter = offer.rosterCount + chosen.length;
  const tooMany = spaceAfter < 0 || rosterAfter > offer.rosterMax;

  const toggle = (id: string) => {
    setError(null);
    setPicked((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };

  const decide = () => {
    const ask = chosen.length
      ? `Extend ${chosen.map((p) => p.name).join(", ")} for ${money(total)}? This is final.`
      : "No extensions? You won't be able to extend these players later.";
    if (!window.confirm(ask)) return;
    start(async () => {
      const r = await decideExtensions(chosen.map((p) => p.id));
      if (r?.error) setError(r.error);
      else setDone(r?.ok ?? "Done.");
    });
  };

  const close = () => {
    onClose();
    if (done) router.refresh(); // new contracts on the roster pages, and the to-do row goes
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="ext-title">
      <button className="absolute inset-0 bg-black/50" aria-label="Decide later" onClick={close} />
      <div className="relative flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-2xl bg-card shadow-2xl sm:rounded-2xl">
        <div className="p-5 pb-3">
          <h2 id="ext-title" className="text-lg font-semibold">Contract extensions</h2>
          <p className="mt-1 text-sm text-muted">
            {done ?? "Keep any of your players from last season for 1 more year, at last season's salary. You decide once."}
          </p>
        </div>

        {!done && (
          <>
            <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3">
              {offer.players.map((p) => {
                const on = picked.has(p.id);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={!!p.taken || pending}
                      aria-pressed={on}
                      onClick={() => toggle(p.id)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition active:scale-[0.99] disabled:opacity-45 ${on ? "border-fg bg-fg/[0.04]" : "border-line"}`}
                    >
                      {p.headshot ? (
                        <img src={headshot(p.headshot, 110)!} alt="" decoding="async" className="h-9 w-9 shrink-0 rounded-full bg-line object-cover" />
                      ) : (
                        <span className="h-9 w-9 shrink-0 rounded-full bg-line" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{p.name}</span>
                        <span className="block truncate text-xs text-muted">{p.taken ?? [p.position, p.nbaTeam].filter(Boolean).join(" · ")}</span>
                      </span>
                      <span className="num text-sm font-semibold">{money(p.salary)}</span>
                      <span aria-hidden className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${on ? "border-fg bg-fg text-bg" : "border-line"}`}>
                        {on && "✓"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="space-y-3 border-t border-line p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              <div className="flex justify-between text-xs text-muted">
                <span>Cap space after <b className={`num ${spaceAfter < 0 ? "text-bad" : "text-fg"}`}>{money(spaceAfter)}</b></span>
                <span>Roster <b className={`num ${rosterAfter > offer.rosterMax ? "text-bad" : "text-fg"}`}>{rosterAfter}/{offer.rosterMax}</b></span>
              </div>
              {error && <p className="text-xs text-bad">{error}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={close} disabled={pending} className="btn-ghost">Later</button>
                <button type="button" onClick={decide} disabled={pending || tooMany} className="btn flex-1">
                  {pending ? "Saving…" : chosen.length ? `Extend ${chosen.length} · ${money(total)}` : "No extensions"}
                </button>
              </div>
            </div>
          </>
        )}

        {done && (
          <div className="p-5 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <button type="button" onClick={close} className="btn w-full">Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
