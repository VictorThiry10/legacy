"use client";
import { useEffect, useRef, useState } from "react";

// A photo being placed: its address (a temporary one in the browser) and its size in pixels.
export type Source = { url: string; w: number; h: number };
type View = { z: number; cx: number; cy: number }; // zoom (1: the whole short side), and the middle of what's kept, in photo pixels
type Pt = { x: number; y: number };

const MAX_ZOOM = 5;
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// Placing a photo, the way WhatsApp does it: the photo fills a square, what will be kept shows sharp inside a
// circle and the rest is blurred and dimmed around it. Drag to move it; pinch, the slider or the mouse wheel zoom.
// onDone gets the kept square as a JPEG `px` wide.
export default function PhotoCrop({ src, px, onCancel, onDone }: { src: Source; px: number; onCancel: () => void; onDone: (cut: Blob) => void }) {
  const short = Math.min(src.w, src.h);
  const stage = useRef<HTMLDivElement>(null);
  const sharp = useRef<HTMLImageElement>(null);
  const fingers = useRef(new Map<number, Pt>());
  const [size, setSize] = useState(0); // the square's width on screen
  const [view, setView] = useState<View>({ z: 1, cx: src.w / 2, cy: src.h / 2 });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => setSize(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Never zoomed out past the photo's short side, and never dragged so far that the circle shows nothing.
  const fit = (v: View): View => {
    const z = Math.min(MAX_ZOOM, Math.max(1, v.z));
    const half = short / z / 2;
    return { z, cx: Math.min(src.w - half, Math.max(half, v.cx)), cy: Math.min(src.h - half, Math.max(half, v.cy)) };
  };
  const scale = (z: number) => (size * z) / short; // screen pixels per photo pixel
  // Zoom so that the photo point under `at` (a place in the square) stays under it.
  const zoomAt = (v: View, z: number, at: Pt, to: Pt = at): View => {
    const k = scale(v.z);
    const next = Math.min(MAX_ZOOM, Math.max(1, z));
    const x = v.cx + (at.x - size / 2) / k, y = v.cy + (at.y - size / 2) / k;
    return fit({ z: next, cx: x - (to.x - size / 2) / scale(next), cy: y - (to.y - size / 2) / scale(next) });
  };

  const place = (e: { clientX: number; clientY: number }): Pt => {
    const r = stage.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId); // keeps the drag when the finger leaves the square
    } catch {
      // not a pointer the browser can hold on to: the drag still works inside the square
    }
    fingers.current.set(e.pointerId, place(e));
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const f = fingers.current;
    if (!f.has(e.pointerId) || !size) return;
    const before = [...f.values()];
    f.set(e.pointerId, place(e));
    const after = [...f.values()];
    if (after.length === 1) {
      // one finger: drag
      const dx = after[0].x - before[0].x, dy = after[0].y - before[0].y;
      setView((v) => fit({ ...v, cx: v.cx - dx / scale(v.z), cy: v.cy - dy / scale(v.z) }));
    } else {
      // two fingers: zoom by how far apart they moved, around the point between them (which drags too)
      const d0 = dist(before[0], before[1]), d1 = dist(after[0], after[1]);
      setView((v) => zoomAt(v, v.z * (d0 ? d1 / d0 : 1), mid(before[0], before[1]), mid(after[0], after[1])));
    }
  };
  const up = (e: React.PointerEvent<HTMLDivElement>) => fingers.current.delete(e.pointerId);

  const done = () => {
    const img = sharp.current;
    if (!img) return;
    setBusy(true);
    const side = short / view.z;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = px;
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#fff"; // behind a see-through logo
    g.fillRect(0, 0, px, px);
    g.imageSmoothingQuality = "high";
    g.drawImage(img, view.cx - side / 2, view.cy - side / 2, side, side, 0, 0, px, px);
    canvas.toBlob((b) => (b ? onDone(b) : setBusy(false)), "image/jpeg", 0.86);
  };

  const k = scale(view.z);
  const at = { width: src.w * k, height: src.h * k, transform: `translate3d(${size / 2 - view.cx * k}px, ${size / 2 - view.cy * k}px, 0)` };
  const photo = "pointer-events-none absolute left-0 top-0 max-w-none select-none";
  return (
    <>
      <div
        ref={stage} role="img" aria-label="Drag the photo to move it, pinch to zoom"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onWheel={(e) => setView((v) => zoomAt(v, v.z * Math.exp(-e.deltaY * 0.0015), place(e)))}
        className="relative -mx-5 -mt-5 aspect-square cursor-grab touch-none overflow-hidden rounded-t-2xl bg-black active:cursor-grabbing sm:rounded-t-2xl"
      >
        {size > 0 && (
          <>
            {/* everything outside the circle: blurred and dimmed */}
            <img src={src.url} alt="" draggable={false} className={`${photo} opacity-60 blur-md`} style={at} />
            {/* inside the circle: the photo as it will be kept */}
            <div className="absolute inset-0" style={{ clipPath: "circle(50%)" }}>
              <img ref={sharp} src={src.url} alt="" draggable={false} className={photo} style={at} />
            </div>
            <div aria-hidden className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-inset ring-white/85" />
          </>
        )}
      </div>
      <input
        type="range" min={1} max={MAX_ZOOM} step={0.01} value={view.z} aria-label="Zoom" disabled={busy}
        onChange={(e) => setView((v) => zoomAt(v, Number(e.target.value), { x: size / 2, y: size / 2 }))}
        className="mt-5 w-full accent-fg"
      />
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className="btn-ghost">Cancel</button>
        <button type="button" onClick={done} disabled={busy || !size} className="btn flex-1">Use photo</button>
      </div>
    </>
  );
}

// A photo the phone picked, ready to place: big ones are shrunk first (a 12 megapixel photo drags badly), and a
// see-through logo gets white behind it.
export async function openPhoto(file: File, max = 1600): Promise<Source> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, w, h);
    g.imageSmoothingQuality = "high";
    g.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob>((done, no) => canvas.toBlob((b) => (b ? done(b) : no(new Error("no image"))), "image/jpeg", 0.92));
    return { url: URL.createObjectURL(blob), w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}
