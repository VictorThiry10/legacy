"use client";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";

// What the show (Lottery.tsx) asks of the machine.
export type MachineApi = {
  mix: (level: number) => void; // air through the drum: 0 off, 1 full
  draw: () => Promise<void>; // a ball arcs to the tube and leaves through its top; resolves as it comes out
  reset: () => void; // every ball back in the drum
};

// World units: the drum is a circle of radius 1 around (0, 0), y grows downwards. The canvas shows WIDTH x (BOTTOM - TOP).
const R = 1;
const r = 0.16; // ball radius
const MOUTH = -(R - r); // where the tube takes a ball
const EXIT = -1.34; // where a drawn ball comes out of the tube, and the page takes over (Capsule.tsx)
const TOP = -1.52;
const BOTTOM = 1.28;
const WIDTH = 2.4;
const ASPECT = WIDTH / (BOTTOM - TOP);
// For the page to pick a ball up exactly where the canvas leaves it: heights as a share of the canvas's height,
// the ball's size as a share of its width.
export const EXIT_Y = (EXIT - TOP) / (BOTTOM - TOP);
export const CENTRE_Y = -TOP / (BOTTOM - TOP);
export const BALL = (2 * r) / WIDTH;

// The air is a smooth flow, not noise: up the middle, out along the top, down the sides and back in along the floor,
// with a jet at the bottom middle that lifts the balls into it. The column sways slowly, so no two loops are alike.
// Balls are dragged towards the air's speed, fall under gravity and bounce off each other. Per second, fixed steps
// of H seconds (the same on 60 and 120 Hz screens).
const H = 1 / 180;
const G = 3.2; // gravity
const DRAG = 4; // how hard the air pulls a ball to its own speed
const WIND = 1.7; // the air's speed
const JET = 8; // lift at the bottom middle
const MAX = 3.6; // top speed
const T_CATCH = 0.7; // s for a drawn ball to arc to the tube
const T_TUBE = 0.35; // s up the tube and out
const T_LINGER = 0.12; // s it stays drawn at the exit, while the page's copy of it appears on top

type Ball = {
  x: number; y: number; vx: number; vy: number;
  spin: number; turn: number; // the angle its seam is at, and how fast it's turning
  lift: number; // how much air it catches: balls differ a little, so they don't move as one
  state: "in" | "up"; t: number; x0: number; y0: number; done?: () => void;
};

const TAU = Math.PI * 2;
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const easeOut = (k: number) => 1 - (1 - k) ** 3;
// a point on the curve from a to c, bent towards b
const bend = (a: number, b: number, c: number, k: number) => (1 - k) * (1 - k) * a + 2 * (1 - k) * k * b + k * k * c;

// Every ball somewhere in the drum, not overlapping. Gravity piles them up on the first frames.
function seed(count: number): Ball[] {
  const balls: Ball[] = [];
  for (let n = 0; n < count; n++) {
    for (let k = 0; k < 300; k++) {
      const a = Math.random() * TAU;
      const d = Math.sqrt(Math.random()) * (R - r);
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      if (k < 299 && balls.some((b) => (b.x - x) ** 2 + (b.y - y) ** 2 < 4 * r * r)) continue;
      balls.push({ x, y, vx: 0, vy: 0, spin: (Math.random() - 0.5) * 3, turn: 0, lift: 0.85 + Math.random() * 0.3, state: "in", t: 0, x0: 0, y0: 0 });
      break;
    }
  }
  return balls;
}

// One physics step for the balls in the drum: air and gravity, then ball on ball, then the glass.
function step(balls: Ball[], air: number, time: number, dt: number) {
  const live = balls.filter((b) => b.state === "in");
  const sway = 0.18 * Math.sin(0.7 * time) + 0.08 * Math.sin(1.9 * time + 1);
  const swirl = 0.25 * Math.sin(0.45 * time);
  for (const b of live) {
    const x = b.x - sway;
    const windX = WIND * (-2 * x * b.y - swirl * b.y);
    const windY = WIND * (-(1 - 3 * x * x - b.y * b.y) + swirl * x);
    const jet = JET * Math.exp(-(x * x) / 0.18) * clamp(b.y + 0.2);
    b.vx += air * b.lift * DRAG * (windX - b.vx) * dt;
    b.vy += (G + air * b.lift * (DRAG * (windY - b.vy) - jet)) * dt;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > MAX) {
      b.vx *= MAX / sp;
      b.vy *= MAX / sp;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.turn += ((b.vx / r) * 0.6 - b.turn) * Math.min(1, dt * 4); // it rolls the way it's going
    b.spin += b.turn * dt;
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
  // a ball being drawn moves through the others on its way to the tube: it pushes them aside
  for (const c of balls) {
    if (c.state !== "up" || c.t >= T_CATCH) continue;
    for (const b of live) {
      const dx = b.x - c.x;
      const dy = b.y - c.y;
      const d = Math.hypot(dx, dy);
      if (d >= 2 * r || d === 0) continue;
      const nx = dx / d;
      const ny = dy / d;
      b.x += nx * (2 * r - d);
      b.y += ny * (2 * r - d);
      const rv = (b.vx - c.vx) * nx + (b.vy - c.vy) * ny;
      if (rv < 0) {
        b.vx -= 1.5 * rv * nx;
        b.vy -= 1.5 * rv * ny;
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
      b.vx -= 1.6 * vn * nx;
      b.vy -= 1.6 * vn * ny;
    }
  }
}

// The ball being drawn: an arc to the tube, up it and out. Returns the balls still on the canvas.
function animate(balls: Ball[], dt: number) {
  for (const b of balls) {
    if (b.state !== "up") continue;
    b.spin *= 1 - Math.min(1, dt * 7); // its seam comes level
    b.t += dt;
    if (b.t < T_CATCH) {
      // from where it was, dipping under the mouth and up into it, faster and faster
      const k = (b.t / T_CATCH) ** 2;
      const x = bend(b.x0, 0, 0, k);
      const y = bend(b.y0, MOUTH + 0.5, MOUTH, k);
      if (dt > 0) {
        b.vx = (x - b.x) / dt;
        b.vy = (y - b.y) / dt;
      }
      b.x = x;
      b.y = y;
    } else {
      b.x = 0;
      b.y = MOUTH + (EXIT - MOUTH) * easeOut(clamp((b.t - T_CATCH) / T_TUBE));
      b.spin = 0;
      if (b.t >= T_CATCH + T_TUBE && b.done) {
        b.done();
        b.done = undefined;
      }
    }
  }
  return balls.filter((b) => !(b.state === "up" && b.t > T_CATCH + T_TUBE + T_LINGER));
}

// A capsule: a white ball in two halves, the lower one a shade darker, with a seam that turns as it rolls.
// Capsule.tsx draws the same ball on the page.
function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, rad: number, spin: number) {
  const g = ctx.createRadialGradient(x - rad * 0.32, y - rad * 0.38, rad * 0.05, x, y, rad);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.6, "#eeeef2");
  g.addColorStop(1, "#9c9caa");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin);
  ctx.fillStyle = "rgba(24,24,44,0.14)";
  ctx.beginPath();
  ctx.arc(0, 0, rad, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(20,20,26,0.45)";
  ctx.lineWidth = Math.max(1, rad * 0.06);
  ctx.beginPath();
  ctx.moveTo(-rad, 0);
  ctx.lineTo(rad, 0);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.beginPath();
  ctx.ellipse(x - rad * 0.4, y - rad * 0.48, rad * 0.2, rad * 0.1, -0.65, 0, TAU);
  ctx.fill();
}

function render(ctx: CanvasRenderingContext2D, w: number, balls: Ball[]) {
  const s = w / WIDTH;
  const h = (BOTTOM - TOP) * s;
  const cx = w / 2;
  const cy = -TOP * s;
  const X = (x: number) => cx + x * s;
  const Y = (y: number) => cy + y * s;
  const Rp = R * s;
  const rp = r * s;
  ctx.clearRect(0, 0, w, h);

  // a soft light behind the drum
  const halo = ctx.createRadialGradient(cx, cy, Rp * 0.3, cx, cy, Rp * 1.3);
  halo.addColorStop(0, "rgba(255,255,255,0.06)");
  halo.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);

  // stand: its shadow on the floor, a round neck, a low base
  ctx.save();
  ctx.translate(cx, Y(1.2));
  ctx.scale(1, 0.08);
  const floor = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.95 * s);
  floor.addColorStop(0, "rgba(0,0,0,0.6)");
  floor.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = floor;
  ctx.beginPath();
  ctx.arc(0, 0, 0.95 * s, 0, TAU);
  ctx.fill();
  ctx.restore();
  const neck = ctx.createLinearGradient(X(-0.34), 0, X(0.34), 0);
  neck.addColorStop(0, "#17171b");
  neck.addColorStop(0.45, "#34343d");
  neck.addColorStop(1, "#17171b");
  ctx.fillStyle = neck;
  ctx.beginPath();
  ctx.moveTo(X(-0.2), Y(0.94));
  ctx.lineTo(X(0.2), Y(0.94));
  ctx.lineTo(X(0.34), Y(1.11));
  ctx.lineTo(X(-0.34), Y(1.11));
  ctx.closePath();
  ctx.fill();
  const base = ctx.createLinearGradient(0, Y(1.09), 0, Y(1.2));
  base.addColorStop(0, "#30303a");
  base.addColorStop(1, "#131317");
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.roundRect(X(-0.6), Y(1.09), 1.2 * s, 0.11 * s, 0.055 * s);
  ctx.fill();

  // the glass: clearer in the middle, catching light at the edge
  const glass = ctx.createRadialGradient(cx, cy, Rp * 0.5, cx, cy, Rp);
  glass.addColorStop(0, "rgba(255,255,255,0.012)");
  glass.addColorStop(1, "rgba(255,255,255,0.07)");
  ctx.fillStyle = glass;
  ctx.beginPath();
  ctx.arc(cx, cy, Rp, 0, TAU);
  ctx.fill();

  // the tube, open at the top, behind the balls
  const tw = rp * 1.15;
  const tubeTop = Y(-1.2);
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fillRect(cx - tw, tubeTop, tw * 2, Y(-R) - tubeTop + 2);

  // balls: the drum's first, the one being drawn on top
  for (const b of [...balls].sort((a, c) => Number(a.state !== "in") - Number(c.state !== "in"))) drawBall(ctx, X(b.x), Y(b.y), rp, b.spin);

  // glass in front: the tube's edges, the rim, two reflections
  const edge = ctx.createLinearGradient(X(-1), Y(-1.4), X(1), Y(1));
  edge.addColorStop(0, "rgba(255,255,255,0.42)");
  edge.addColorStop(1, "rgba(255,255,255,0.1)");
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - tw, tubeTop);
  ctx.lineTo(cx - tw, Y(-R) + 2);
  ctx.moveTo(cx + tw, tubeTop);
  ctx.lineTo(cx + tw, Y(-R) + 2);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, Rp - 1, 0, TAU);
  ctx.stroke();
  ctx.lineCap = "round";
  ctx.lineWidth = Rp * 0.035;
  ctx.strokeStyle = "rgba(255,255,255,0.11)";
  ctx.beginPath();
  ctx.arc(cx, cy, Rp * 0.88, Math.PI * 1.1, Math.PI * 1.4);
  ctx.stroke();
  ctx.lineWidth = Rp * 0.018;
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.beginPath();
  ctx.arc(cx, cy, Rp * 0.9, Math.PI * 0.12, Math.PI * 0.3);
  ctx.stroke();
  ctx.lineCap = "butt";
}

// The lottery drum: one capsule per team in a glass sphere, carried round by the air. For each pick one is drawn
// up the tube and out of the top, where the page takes it over, opens it and shows the name (Capsule.tsx).
// Driven from Lottery.tsx through `ref`.
export default function Machine({ count, ref }: { count: number; ref: Ref<MachineApi> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const sim = useRef({ balls: [] as Ball[], air: 0, target: 0 });

  useImperativeHandle(ref, () => ({
    mix: (level) => void (sim.current.target = level),
    draw: () =>
      new Promise<void>((done) => {
        // the one nearest the tube
        const b = sim.current.balls.filter((b) => b.state === "in").sort((a, c) => Math.hypot(a.x, a.y - MOUTH) - Math.hypot(c.x, c.y - MOUTH))[0];
        if (!b) return done();
        Object.assign(b, { state: "up", t: 0, x0: b.x, y0: b.y, done, spin: Math.atan2(Math.sin(b.spin), Math.cos(b.spin)) });
      }),
    reset: () => Object.assign(sim.current, { balls: seed(count), air: 0, target: 0 }),
  }), [count]);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const state = sim.current;
    Object.assign(state, { balls: seed(count), air: 0, target: 0 });
    let w = 0;
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
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
    let time = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      state.air += (state.target - state.air) * Math.min(1, dt * 2);
      state.balls = animate(state.balls, dt);
      for (acc += dt; acc >= H; acc -= H) step(state.balls, state.air, (time += H), H);
      if (w) render(ctx, w, state.balls); // w is 0 while the drum is hidden (phones, before Play)
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [count]);

  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label="Lottery machine: a glass drum with one ball per team"
      className="block h-auto w-full"
      style={{ aspectRatio: ASPECT }}
    />
  );
}
