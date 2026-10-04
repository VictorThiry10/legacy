"use client";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { LOTTERY_BALLS } from "@/lib/rules";

// What the show (Lottery.tsx) asks of the machine.
export type MachineApi = {
  mix: (level: number) => void; // air through the drum: 0 off, 1 full
  draw: (n: number, slot: number) => Promise<void>; // ball n goes up the tube into tray slot 0 to 3; resolves once it's seated
  back: () => void; // the tray's balls drop back into the drum
};

// World units: the drum is a circle of radius 1 around (0, 0), y grows downwards. The canvas shows WIDTH x (BOTTOM - TOP).
const R = 1;
const r = 0.13; // ball radius
const BIG = 1.3; // a drawn ball grows this much in the tray
const TRAY_Y = -1.5;
const TRAY_H = r * BIG + 0.045; // half the tray's height
const SLOTS = [-0.6, -0.2, 0.2, 0.6]; // the tray's four places
const MOUTH = -(R - r); // where the tube takes a ball
const TUBE = MOUTH - (TRAY_Y + TRAY_H); // length of the tube, mouth to tray
const TOP = -1.8;
const BOTTOM = 1.28;
const WIDTH = 2.4;
const ASPECT = WIDTH / (BOTTOM - TOP);

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
const T_SEAT = 0.7; // s up the tube and round into its place
const T_BACK = 0.6; // s from its place back down the tube
const BACK_AFTER = [0.32, 0, 0.16, 0.48]; // the inner balls leave first, so none passes through another

type Ball = {
  n: number; x: number; y: number; vx: number; vy: number;
  spin: number; turn: number; // the angle its number is at, and how fast it's turning
  lift: number; // how much air it catches: balls differ a little, so they don't move as one
  state: "in" | "up" | "tray" | "back"; t: number; x0: number; y0: number; slot: number; size: number; done?: () => void;
};

type Look = { color: string; light: string; dark: string };
const WHITE: Look = { light: "#ffffff", color: "#eeeef2", dark: "#9c9caa" };

const TAU = Math.PI * 2;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const smooth = (k: number) => k * k * (3 - 2 * k);
const easeOut = (k: number) => 1 - (1 - k) ** 3;
// a point on the curve from a to c, bent towards b
const bend = (a: number, b: number, c: number, k: number) => (1 - k) * (1 - k) * a + 2 * (1 - k) * k * b + k * k * c;
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
      balls.push({ n, x, y, vx: 0, vy: 0, spin: (Math.random() - 0.5) * 2, turn: 0, lift: 0.85 + Math.random() * 0.3, state: "in", t: 0, x0: 0, y0: 0, slot: 0, size: 1 });
      break;
    }
  }
  return balls;
}

// Where a ball is on its way from the mouth of the tube to its place in the tray: k 0 to 1 along the whole way.
function seat(slot: number, k: number): { x: number; y: number; size: number } {
  const curve = Math.abs(SLOTS[slot]) + 0.15; // about the length of the bend into the tray
  const d = k * (TUBE + curve);
  if (d <= TUBE) return { x: 0, y: MOUTH - d, size: 1 };
  const j = (d - TUBE) / curve;
  return { x: bend(0, 0, SLOTS[slot], j), y: bend(MOUTH - TUBE, TRAY_Y, TRAY_Y, j), size: lerp(1, BIG, smooth(clamp(j / 0.7))) };
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

// Balls outside the air: arcing to the tube, up it and round into the tray, or on their way back down.
function animate(balls: Ball[], dt: number) {
  for (const b of balls) {
    if (b.state === "in") continue;
    b.spin *= 1 - Math.min(1, dt * 7); // its number comes upright
    b.t += dt;
    if (b.state === "up" && b.t < T_CATCH) {
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
    } else if (b.state === "up") {
      const k = clamp((b.t - T_CATCH) / T_SEAT);
      Object.assign(b, seat(b.slot, easeOut(k)));
      if (k === 1) {
        b.state = "tray";
        b.done?.();
      }
    } else if (b.state === "back" && b.t > 0) {
      const k = clamp(b.t / T_BACK);
      Object.assign(b, seat(b.slot, 1 - k * k));
      if (k === 1) Object.assign(b, { state: "in", vx: (Math.random() - 0.5) * 0.4, vy: 1.6, size: 1 });
    }
  }
}

function sphere(ctx: CanvasRenderingContext2D, x: number, y: number, rad: number, look: Look) {
  const g = ctx.createRadialGradient(x - rad * 0.32, y - rad * 0.38, rad * 0.05, x, y, rad);
  g.addColorStop(0, look.light);
  g.addColorStop(0.6, look.color);
  g.addColorStop(1, look.dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, TAU);
  ctx.fill();
}

// A white ball with its number, turned to `spin`. `mix` (0 to 1) fades it into the team's colour, in the tray.
function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, rad: number, b: Ball, team: Look | null, mix: number) {
  sphere(ctx, x, y, rad, WHITE);
  if (team && mix > 0.01) {
    ctx.globalAlpha = mix;
    sphere(ctx, x, y, rad, team);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.arc(x, y, rad * 0.64, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(b.spin);
  ctx.fillStyle = "#15151a";
  ctx.font = `800 ${rad * 0.9}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
  ctx.fillText(String(b.n), 0, rad * 0.05);
  if (b.n === 6 || b.n === 9) ctx.fillRect(-rad * 0.24, rad * 0.44, rad * 0.48, rad * 0.07); // which way up, like a pool ball
  ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.ellipse(x - rad * 0.4, y - rad * 0.48, rad * 0.2, rad * 0.1, -0.65, 0, TAU);
  ctx.fill();
}

function render(ctx: CanvasRenderingContext2D, w: number, balls: Ball[], team: Look | null, glow: number) {
  const s = w / WIDTH;
  const h = (BOTTOM - TOP) * s;
  const cx = w / 2;
  const cy = -TOP * s;
  const X = (x: number) => cx + x * s;
  const Y = (y: number) => cy + y * s;
  const Rp = R * s;
  const rp = r * s;
  ctx.clearRect(0, 0, w, h);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

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

  // tube and tray, behind the balls; the tray lights up in the team's colour
  const tw = rp * 1.18;
  const th = TRAY_H * s;
  const trayX = X(SLOTS[0]) - th;
  const trayW = X(SLOTS[3]) - X(SLOTS[0]) + th * 2;
  if (team && glow > 0.01) {
    ctx.save();
    ctx.translate(cx, Y(TRAY_Y));
    ctx.scale(1, 0.42);
    const light = ctx.createRadialGradient(0, 0, 0, 0, 0, trayW * 0.72);
    light.addColorStop(0, team.color);
    light.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = 0.4 * glow;
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.arc(0, 0, trayW * 0.72, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fillRect(cx - tw, Y(TRAY_Y) + th, tw * 2, Y(-R) - Y(TRAY_Y) - th + 2);
  ctx.fillStyle = "rgba(12,12,15,0.55)";
  ctx.beginPath();
  ctx.roundRect(trayX, Y(TRAY_Y) - th, trayW, th * 2, th);
  ctx.fill();

  // balls: the drum's first, then the ones outside it on top
  for (const b of [...balls].sort((a, c) => Number(a.state !== "in") - Number(c.state !== "in"))) {
    drawBall(ctx, X(b.x), Y(b.y), rp * b.size, b, team, b.state === "tray" ? glow : 0);
  }

  // glass in front: tray and tube edges, the rim, two reflections
  const edge = ctx.createLinearGradient(X(-1), Y(-1.7), X(1), Y(1));
  edge.addColorStop(0, "rgba(255,255,255,0.42)");
  edge.addColorStop(1, "rgba(255,255,255,0.1)");
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(trayX, Y(TRAY_Y) - th, trayW, th * 2, th);
  ctx.moveTo(cx - tw, Y(TRAY_Y) + th);
  ctx.lineTo(cx - tw, Y(-R) + 2);
  ctx.moveTo(cx + tw, Y(TRAY_Y) + th);
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

// The lottery drum, like the NBA's: 14 numbered balls in a glass sphere, carried round by the air. Four are drawn
// up a tube into a tray for each pick, then dropped back in. `tint` (a team's colour) lights the tray and its balls.
// Driven from Lottery.tsx through `ref`.
export default function Machine({ tint, ref }: { tint: string | null; ref: Ref<MachineApi> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const sim = useRef({ balls: [] as Ball[], air: 0, target: 0, team: null as Look | null, lit: false, glow: 0 });

  useEffect(() => {
    if (tint) sim.current.team = { color: tint, light: shade(tint, 0.55), dark: shade(tint, -0.45) };
    sim.current.lit = !!tint; // the colour itself stays until the light has faded
  }, [tint]);

  useImperativeHandle(ref, () => ({
    mix: (level) => void (sim.current.target = level),
    draw: (n, slot) =>
      new Promise<void>((done) => {
        const b = sim.current.balls.find((b) => b.n === n && b.state === "in");
        if (!b) return done();
        Object.assign(b, { state: "up", t: 0, x0: b.x, y0: b.y, slot, done, spin: Math.atan2(Math.sin(b.spin), Math.cos(b.spin)) });
      }),
    back: () =>
      sim.current.balls
        .filter((b) => b.state === "tray" || b.state === "up")
        .forEach((b) => Object.assign(b, { state: "back", t: -BACK_AFTER[b.slot], done: undefined })),
  }), []);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const state = sim.current;
    Object.assign(state, { balls: seed(), air: 0, target: 0 });
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
      state.glow += ((state.lit ? 1 : 0) - state.glow) * Math.min(1, dt * 6);
      animate(state.balls, dt);
      for (acc += dt; acc >= H; acc -= H) step(state.balls, state.air, (time += H), H);
      if (w) render(ctx, w, state.balls, state.team, state.glow); // w is 0 while the drum is hidden (phones, before Play)
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
