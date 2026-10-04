"use client";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { LOTTERY_BALLS } from "@/lib/rules";

// What the show (Lottery.tsx) asks of the machine.
export type MachineApi = {
  mix: (level: number) => void; // air through the drum: 0 off, 1 full
  draw: (n: number, slot: number) => Promise<void>; // ball n goes up the tube into tray slot 0 to 3; resolves once it's there
  back: () => void; // the tray's balls drop back into the drum
};

// World units: the drum is a circle of radius 1 around (0, 0), y grows downwards. The canvas shows WIDTH x (BOTTOM - TOP).
const R = 1;
const r = 0.13; // ball radius
const BIG = 1.3; // a drawn ball grows this much in the tray
const TRAY_Y = -1.5;
const SLOTS = [-0.6, -0.2, 0.2, 0.6]; // the tray's four places
const MOUTH = -(R - r); // where the tube takes a ball
const TOP = -1.8;
const BOTTOM = 1.25;
const WIDTH = 2.4;
const ASPECT = WIDTH / (BOTTOM - TOP);

// Physics, per second, tuned so the balls tumble all over the drum (not round the wall). Fixed steps of H seconds,
// so the turbulence feels the same on 60 and 120 Hz screens.
const H = 1 / 180;
const G = 3.2; // gravity
const JET = 5.5; // air from the floor, strongest at the bottom middle
const SWIRL = 0.4; // air going round
const NOISE = 200; // turbulence
const DAMP = 0.6;
const MAX = 3.4; // top speed
const T_SUCK = 0.35; // s for a drawn ball to reach the top of the drum
const T_RISE = 0.4; // s up the tube
const T_SLIDE = 0.25; // s along the tray to its place
const T_BACK = 0.45; // s from the tray back into the drum

type Ball = {
  n: number; x: number; y: number; vx: number; vy: number;
  state: "in" | "up" | "tray" | "back"; t: number; x0: number; y0: number; slot: number; size: number; done?: () => void;
};

type Look = { color: string; light: string; dark: string };

const TAU = Math.PI * 2;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const easeIn = (k: number) => k * k * k;
const easeOut = (k: number) => 1 - (1 - k) ** 3;
// #rrggbb mixed with white (amount > 0) or black (amount < 0)
const shade = (hex: string, amount: number) => {
  const to = amount > 0 ? 255 : 0;
  const c = [1, 3, 5].map((i) => Math.round(lerp(parseInt(hex.slice(i, i + 2), 16), to, Math.abs(amount))));
  return `rgb(${c.join(",")})`;
};

// Every ball somewhere in the drum, not overlapping. Gravity piles them up on the first frames.
function seed(): Ball[] {
  const balls: Ball[] = [];
  for (let n = 1; n <= LOTTERY_BALLS; n++) {
    for (let k = 0; k < 300; k++) {
      const a = Math.random() * TAU;
      const d = Math.sqrt(Math.random()) * (R - r);
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      if (k < 299 && balls.some((b) => (b.x - x) ** 2 + (b.y - y) ** 2 < 4 * r * r)) continue;
      balls.push({ n, x, y, vx: 0, vy: 0, state: "in", t: 0, x0: 0, y0: 0, slot: 0, size: 1 });
      break;
    }
  }
  return balls;
}

// One physics step for the balls in the drum: forces, then ball on ball, then the glass.
function step(balls: Ball[], air: number, dt: number) {
  const live = balls.filter((b) => b.state === "in");
  for (const b of live) {
    let ax = 0;
    let ay = G;
    if (air > 0) {
      const low = clamp((b.y + 0.3) / 1.3);
      const middle = 1 - 0.6 * clamp(Math.abs(b.x) / 0.7);
      ay -= air * JET * (0.2 + low) * middle;
      ax += air * SWIRL * -b.y + air * (Math.random() - 0.5) * NOISE;
      ay += air * SWIRL * b.x + air * (Math.random() - 0.5) * NOISE;
    }
    b.vx = (b.vx + ax * dt) * (1 - DAMP * dt);
    b.vy = (b.vy + ay * dt) * (1 - DAMP * dt);
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > MAX) {
      b.vx *= MAX / sp;
      b.vy *= MAX / sp;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= 4 * r * r || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const push = (2 * r - d) / 2;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rv < 0) {
        const j2 = (-(1 + 0.85) * rv) / 2;
        a.vx -= j2 * nx;
        a.vy -= j2 * ny;
        b.vx += j2 * nx;
        b.vy += j2 * ny;
      }
    }
  }
  for (const b of live) {
    const d = Math.hypot(b.x, b.y);
    if (d <= R - r) continue;
    const nx = b.x / d;
    const ny = b.y / d;
    b.x = nx * (R - r);
    b.y = ny * (R - r);
    const vn = b.vx * nx + b.vy * ny;
    if (vn > 0) {
      b.vx = (b.vx - 1.6 * vn * nx) * 0.98;
      b.vy = (b.vy - 1.6 * vn * ny) * 0.98;
    }
  }
}

// Balls outside the drum: on their way up the tube and along the tray, or on their way back.
function animate(balls: Ball[], dt: number) {
  for (const b of balls) {
    if (b.state === "up") {
      b.t += dt;
      if (b.t < T_SUCK) {
        const k = easeIn(b.t / T_SUCK);
        b.x = lerp(b.x0, 0, k);
        b.y = lerp(b.y0, MOUTH, k);
      } else if (b.t < T_SUCK + T_RISE) {
        const k = easeOut((b.t - T_SUCK) / T_RISE);
        b.x = 0;
        b.y = lerp(MOUTH, TRAY_Y, k);
        b.size = 1 + (BIG - 1) * clamp((k - 0.6) / 0.4);
      } else {
        const k = clamp((b.t - T_SUCK - T_RISE) / T_SLIDE);
        b.x = lerp(0, SLOTS[b.slot], easeOut(k));
        b.y = TRAY_Y;
        b.size = BIG;
        if (k === 1) {
          b.state = "tray";
          b.done?.();
        }
      }
    } else if (b.state === "back") {
      b.t += dt; // starts below 0: the four leave one after the other
      const k = clamp(b.t / T_BACK);
      b.x = lerp(b.x0, 0, easeOut(clamp(k / 0.4)));
      b.y = lerp(TRAY_Y, MOUTH, easeIn(clamp((k - 0.4) / 0.6)));
      b.size = lerp(BIG, 1, clamp((k - 0.4) / 0.3));
      if (k === 1) Object.assign(b, { state: "in", vx: (Math.random() - 0.5) * 0.6, vy: 1.2, size: 1 });
    }
  }
}

// A white ping-pong ball with its number; in `tint` (the tray, once the team is known) a ball in the team's colour.
function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, rad: number, n: number, tint: Look | null) {
  const g = ctx.createRadialGradient(x - rad * 0.35, y - rad * 0.4, rad * 0.05, x, y, rad);
  g.addColorStop(0, tint ? tint.light : "#ffffff");
  g.addColorStop(0.55, tint ? tint.color : "#e6e6ea");
  g.addColorStop(1, tint ? tint.dark : "#8d8d98");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, TAU);
  ctx.fill();
  if (tint) {
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    ctx.beginPath();
    ctx.arc(x, y, rad * 0.6, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = "#111114";
  ctx.font = `700 ${rad * (tint ? 0.7 : 0.9)}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
  ctx.fillText(String(n), x, y + rad * 0.05);
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath();
  ctx.ellipse(x - rad * 0.42, y - rad * 0.5, rad * 0.2, rad * 0.11, -0.6, 0, TAU);
  ctx.fill();
}

function render(ctx: CanvasRenderingContext2D, w: number, balls: Ball[], tint: Look | null) {
  const s = w / WIDTH;
  const cx = w / 2;
  const cy = -TOP * s;
  const X = (x: number) => cx + x * s;
  const Y = (y: number) => cy + y * s;
  const Rp = R * s;
  const rp = r * s;
  ctx.clearRect(0, 0, w, (BOTTOM - TOP) * s);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // stand: a neck under the drum on a wide base
  const metal = ctx.createLinearGradient(0, Y(0.85), 0, Y(BOTTOM));
  metal.addColorStop(0, "#2a2a31");
  metal.addColorStop(1, "#15151a");
  ctx.fillStyle = metal;
  ctx.beginPath();
  ctx.moveTo(X(-0.3), Y(0.9));
  ctx.lineTo(X(0.3), Y(0.9));
  ctx.lineTo(X(0.62), Y(1.16));
  ctx.lineTo(X(-0.62), Y(1.16));
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(X(-0.78), Y(1.14), 1.56 * s, 0.09 * s, 0.03 * s);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // the drum's back: a faint glow so the glass reads as a volume
  const back = ctx.createRadialGradient(cx, cy - Rp * 0.35, Rp * 0.1, cx, cy, Rp);
  back.addColorStop(0, "rgba(255,255,255,0.075)");
  back.addColorStop(1, "rgba(255,255,255,0.02)");
  ctx.fillStyle = back;
  ctx.beginPath();
  ctx.arc(cx, cy, Rp, 0, TAU);
  ctx.fill();

  // tube from the top of the drum up to the tray; the tray glows in the team's colour once it's known
  const tw = rp * 1.2;
  const trayH = rp * BIG + 0.045 * s;
  ctx.fillStyle = "rgba(255,255,255,0.045)";
  ctx.fillRect(cx - tw, Y(TRAY_Y) + trayH, tw * 2, Y(-R + 0.02) - Y(TRAY_Y) - trayH);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  if (tint) {
    ctx.shadowColor = tint.color;
    ctx.shadowBlur = 26;
  }
  ctx.beginPath();
  ctx.roundRect(X(SLOTS[0]) - trayH, Y(TRAY_Y) - trayH, X(SLOTS[3]) - X(SLOTS[0]) + trayH * 2, trayH * 2, trayH);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;

  // balls: the drum's first, then the ones outside it on top
  for (const b of [...balls].sort((a, c) => Number(a.state !== "in") - Number(c.state !== "in"))) {
    drawBall(ctx, X(b.x), Y(b.y), rp * b.size, b.n, b.state === "tray" ? tint : null);
  }

  // glass in front: tube walls, rim, a reflection
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - tw, Y(TRAY_Y) + trayH);
  ctx.lineTo(cx - tw, Y(-R + 0.02));
  ctx.moveTo(cx + tw, Y(TRAY_Y) + trayH);
  ctx.lineTo(cx + tw, Y(-R + 0.02));
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.beginPath();
  ctx.arc(cx, cy, Rp, 0, TAU);
  ctx.stroke();
  ctx.lineCap = "round";
  ctx.lineWidth = Rp * 0.05;
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.beginPath();
  ctx.arc(cx, cy, Rp * 0.86, Math.PI * 1.08, Math.PI * 1.42);
  ctx.stroke();
  ctx.lineCap = "butt";
}

// The lottery drum, like the NBA's: 14 numbered balls in a glass sphere, blown around when the air is on. Four are
// drawn up a tube into a tray for each pick, then dropped back in. Driven from Lottery.tsx through `ref`.
export default function Machine({ tint, ref }: { tint: string | null; ref: Ref<MachineApi> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const sim = useRef({ balls: [] as Ball[], air: 0, target: 0, tint: null as Look | null });

  useEffect(() => {
    sim.current.tint = tint ? { color: tint, light: shade(tint, 0.55), dark: shade(tint, -0.45) } : null;
  }, [tint]);

  useImperativeHandle(ref, () => ({
    mix: (level) => void (sim.current.target = level),
    draw: (n, slot) =>
      new Promise<void>((done) => {
        const b = sim.current.balls.find((b) => b.n === n && b.state === "in");
        if (!b) return done();
        Object.assign(b, { state: "up", t: 0, x0: b.x, y0: b.y, slot, done });
      }),
    back: () =>
      sim.current.balls
        .filter((b) => b.state === "tray" || b.state === "up")
        .forEach((b) => Object.assign(b, { state: "back", t: -b.slot * 0.07, x0: b.x, done: undefined })),
  }), []);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const state = sim.current;
    Object.assign(state, { balls: seed(), air: 0, target: 0 });
    let w = 0;
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = el.clientWidth;
      el.width = Math.round(w * dpr);
      el.height = Math.round((w / ASPECT) * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(el);
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      state.air += (state.target - state.air) * Math.min(1, dt * 2.5);
      for (acc += dt; acc >= H; acc -= H) step(state.balls, state.air, H);
      animate(state.balls, dt);
      if (w) render(ctx, w, state.balls, state.tint); // w is 0 while the drum is hidden (phones, before Play)
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label="Lottery machine: a glass drum of 14 numbered balls"
      className="block h-auto w-full"
      style={{ aspectRatio: ASPECT }}
    />
  );
}
