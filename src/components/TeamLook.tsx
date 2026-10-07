"use client";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { saveLook } from "@/app/(league)/look/actions";
import { LOGO_PX, TEAM_COLORS, type Look } from "@/lib/team-look";
import PhotoCrop, { openPhoto, type Source } from "./PhotoCrop";
import TeamAvatar from "./TeamAvatar";
import { useScrollLock } from "./ScrollLock";

// My team's badge on the Matchup page: tap it to give the team a photo and a colour. A new photo is placed first
// (PhotoCrop: move and zoom it under a circle). Nothing changes until Save.
export default function TeamLook({ team }: { team: Look }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Change your team's photo and colour" aria-haspopup="dialog" className="relative shrink-0 rounded-full active:opacity-70">
        <TeamAvatar team={team} size="lg" />
        <span aria-hidden className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-card text-fg shadow ring-1 ring-line">
          <CameraIcon size={11} />
        </span>
      </button>
      {open && createPortal(<Sheet team={team} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function Sheet({ team, onClose }: { team: Look; onClose: () => void }) {
  useScrollLock();
  const router = useRouter();
  const [color, setColor] = useState(team.color ?? "");
  const [photo, setPhoto] = useState<Blob | null>(null); // a new photo, cut and ready to send
  const [preview, setPreview] = useState<string | null>(team.logo_url ?? null);
  const [placing, setPlacing] = useState<Source | null>(null); // the photo just picked, being moved and zoomed
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (placing ? setPlacing(null) : onClose());
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose, placing]);
  // the preview of a new photo, and the photo being placed, are temporary addresses: let go of them once unused
  useEffect(() => () => {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
  }, [preview]);
  useEffect(() => () => {
    if (placing) URL.revokeObjectURL(placing.url);
  }, [placing]);

  const pick = async (file?: File) => {
    if (!file) return;
    setError(null);
    try {
      setPlacing(await openPhoto(file));
    } catch {
      setError("That file isn't a photo this phone can read. Try another one.");
    }
  };
  const removed = !preview && !!team.logo_url;
  const changed = !!photo || removed || color !== (team.color ?? "");
  const save = () => {
    const f = new FormData();
    f.set("color", color);
    if (photo) f.set("photo", new File([photo], "badge.jpg", { type: "image/jpeg" }));
    else if (removed) f.set("remove", "1");
    start(async () => {
      const r = await saveLook(f);
      if (r?.error) return setError(r.error);
      onClose();
      router.refresh();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Team badge">
      <button type="button" aria-label="Close" onClick={onClose} className="menu-dim absolute inset-0 cursor-default bg-black/50" />
      <div className="sheet-up relative w-full max-w-md rounded-t-2xl bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl">
        {placing ? (
          <PhotoCrop
            src={placing} px={LOGO_PX} onCancel={() => setPlacing(null)}
            onDone={(cut) => {
              setPhoto(cut);
              setPreview(URL.createObjectURL(cut));
              setPlacing(null);
            }}
          />
        ) : (
        <>
        <div className="flex flex-col items-center gap-3">
          <TeamAvatar team={{ name: team.name, color: color || null, logo_url: preview }} size="xl" />
          <div className="text-lg font-semibold">{team.name}</div>
          <div className="flex gap-2">
            <label className="btn-ghost cursor-pointer gap-1.5">
              <CameraIcon size={16} />
              {preview ? "Change photo" : "Add a photo"}
              <input type="file" accept="image/*" className="sr-only" disabled={pending} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            {preview && (
              <button type="button" disabled={pending} onClick={() => { setPhoto(null); setPreview(null); }} className="btn-ghost text-muted">Remove</button>
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-8 justify-items-center gap-y-3" role="radiogroup" aria-label="Team colour">
          {["", ...TEAM_COLORS].map((c) => (
            <button
              key={c || "auto"} type="button" role="radio" aria-checked={color === c} aria-label={c ? `Colour ${c}` : "Colour from the team's name"} disabled={pending}
              onClick={() => setColor(c)}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold text-white transition active:scale-90 ${color === c ? "ring-2 ring-fg ring-offset-2 ring-offset-card" : "ring-1 ring-fg/10"}`}
              style={{ background: c || "conic-gradient(#dc2626, #ca8a04, #16a34a, #0284c7, #9333ea, #dc2626)" }}
            >
              {!c && "A"}
            </button>
          ))}
        </div>

        {error && <p className="mt-4 text-center text-xs text-bad">{error}</p>}
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} disabled={pending} className="btn-ghost">Cancel</button>
          <button type="button" onClick={save} disabled={pending || !changed} className="btn flex-1">{pending ? "Saving…" : "Save"}</button>
        </div>
        </>
        )}
      </div>
    </div>
  );
}

const CameraIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.2" />
  </svg>
);
