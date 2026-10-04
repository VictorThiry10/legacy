"use client";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";

export type DrumTeam = { id: string; name: string; color: string; balls: number[] };

// What the show (Lottery.tsx) asks of the machine.
export type MachineApi = {
  mix: (level: number) => void; // air through the drum: 0 off, 1 full
  draw: (teamId: string) => Promise<number>; // one of the team's balls goes up the tube; resolves with its number once it's in the cup
  drain: (teamId: string) => void; // the team's balls still in the drum leave it
  clearCup: () => void;
};

// World units: the drum is a circle of radius 1 around (0, 0), y grows downwards. The canvas shows WIDTH x (BOTTOM - TOP).
const R = 1;
const r = 0.09; // ball radius
const BIG = 2.4; // a drawn ball grows this much in the cup
const CUP_Y = -1.5;
const TUBE_TOP = CUP_Y + r * BIG;
const TOP = -1.8;
const BOTTOM = 1.25;
const WIDTH = 2.4;
export const ASPECT = WIDTH / (BOTTOM - TOP);

// Physics, per second, tuned so the balls tumble all over the drum (not round the wall). Fixed steps of H seconds,
// so the turbulence feels the same on 60 and 120 Hz screens.
const H = 1 / 180;
const G = 3.2; // gravity
const JET = 5.5; // air from the floor, strongest at the bottom middle
const SWIRL = 0.4; // air going round
const NOISE = 200; // turbulence
const DAMP = 0.6;
const MAX = 3.4; // top speed
const T_SUCK = 0.5; // s for a drawn ball to reach the top of the drum
const T_RISE = 0.7; // s up the tube into the cup
const T_POP = 0.32; // s for a ball leaving to pop and fade

type Ball = {
  n: number; team: number; x: number; y: number; vx: number; vy: number;
  state: "in" | "up" | "cup" | "out"; t: number; x0: number; y0: number; size: number; done?: (n: number) => void;
};

type Look = { color: string; light: string; dark: string };

const TAU = Math.PI * 2;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const easeIn = (k: number) => k * k * k;
const easeOutBack = (k: number) => 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2;
// #rrggbb mixed with white (amount > 0) or black (amount < 0)
const shade = (hex: string, amount: number) => {
  const to = amount > 0 ? 255 : 0;
  const c = [1, 3, 5].map((i) => Math.round(lerp(parseInt(hex.slice(i, i + 2), 16), to, Math.abs(amount))));
  return `rgb(${c.join(",")})`;
};

// Every ball somewhere in the drum, not overlapping. Gravity piles them up on the first frames.
function seed(teams: DrumTeam[]): Ball[] {
  const balls: Ball[] = [];
  teams.forEach((tm, team) =>
    tm.balls.forEach((n) => {
      for (let k = 0; k < 300; k++) {
        const a = Math.random() * TAU;
        const d = Math.sqrt(Math.random()) * (R - r);
        const x = Math.cos(a) * d;
        const y = Math.sin(a) * d;
        if (k < 299 && balls.some((b) => (b.x - x) ** 2 + (b.y - y) ** 2 < 4 * r * r)) continue;
        balls.push({ n, team, x, y, vx: 0, vy: 0, state: "in", t: 0, x0: 0, y0: 0, size: 1 });
        break;
      }
    }),
  );
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

// Balls on their way out: up the tube, sitting in the cup, or popping.
function animate(balls: Ball[], dt: number) {
  for (const b of balls) {
    if (b.state === "up") {
      b.t += dt;
      if (b.t < T_SUCK) {
        const k = easeIn(b.t / T_SUCK);
        b.x = lerp(b.x0, 0, k);
        b.y = lerp(b.y0, -(R - r), k);
      } else {
        const k = clamp((b.t - T_SUCK) / T_RISE);
        b.x = 0;
        b.y = lerp(-(R - r), CUP_Y, easeOutBack(k));
        b.size = 1 + (BIG - 1) * clamp((TUBE_TOP - b.y) / (TUBE_TOP - CUP_Y));
        if (k === 1) {
          b.state = "cup";
          b.t = 0;
          b.done?.(b.n);
        }
      }
    } else if (b.state === "cup") b.t += dt;
    else if (b.state === "out") b.t += dt;
  }
  return balls.filter((b) => !(b.state === "out" && b.t > T_POP));
}

function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, rad: number, look: Look, n: number, alpha: number) {
  ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(x - rad * 0.35, y - rad * 0.4, rad * 0.05, x, y, rad);
  g.addColorStop(0, look.light);
  g.addColorStop(0.5, look.color);
  g.addColorStop(1, look.dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.beginPath();
  ctx.arc(x, y, rad * 0.56, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#111114";
  ctx.font = `700 ${rad * (n > 9 ? 0.56 : 0.66)}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
  ctx.fillText(String(n), x, y + rad * 0.04);
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.beginPath();
  ctx.ellipse(x - rad * 0.42, y - rad * 0.5, rad * 0.22, rad * 0.12, -0.6, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function render(ctx: CanvasRenderingContext2D, w: number, balls: Ball[], looks: Look[], teamIds: string[], hi: string | null) {
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

  // tube from the top of the drum up to the cup
  const tw = rp * 1.3;
  ctx.fillStyle = "rgba(255,255,255,0.045)";
  ctx.fillRect(cx - tw, Y(TUBE_TOP), tw * 2, Y(-R + 0.02) - Y(TUBE_TOP));

  // cup ring, glowing in the colour of the ball sitting in it
  const inCup = balls.find((b) => b.state === "cup" || (b.state === "up" && b.size > 1.6));
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  if (inCup) {
    ctx.shadowColor = looks[inCup.team].color;
    ctx.shadowBlur = 28;
  }
  ctx.beginPath();
  ctx.arc(cx, Y(CUP_Y), rp * BIG + 0.035 * s, 0, TAU);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // balls: the drum's first, then the ones leaving on top
  const order = { in: 0, out: 1, up: 2, cup: 2 };
  for (const b of [...balls].sort((a, c) => order[a.state] - order[c.state])) {
    let rad = rp * b.size;
    let alpha = hi === null || teamIds[b.team] === hi || b.state !== "in" ? 1 : 0.16;
    if (b.state === "out") {
      const k = clamp(b.t / T_POP);
      rad *= 1 + 0.35 * k;
      alpha = 1 - k;
    }
    const bob = b.state === "cup" ? Math.sin(b.t * 2.4) * 0.012 * s : 0;
    drawBall(ctx, X(b.x), Y(b.y) + bob, rad, looks[b.team], b.n, alpha);
  }

  // glass in front: tube walls, rim, a reflection
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - tw, Y(TUBE_TOP));
  ctx.lineTo(cx - tw, Y(-R + 0.02));
  ctx.moveTo(cx + tw, Y(TUBE_TOP));
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
  ctx.lineWidth = Rp * 0.025;
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.beginPath();
  ctx.arc(cx, cy, Rp * 0.86, Math.PI * 1.5, Math.PI * 1.56);
  ctx.stroke();
  ctx.lineCap = "butt";
}

// The lottery drum: every team's balls bouncing in a glass sphere, blown around when the air is on,
// drawn balls going up a tube into a cup on top. Driven from Lottery.tsx through `ref`.
export default function Machine({ teams, highlight, ref }: { teams: DrumTeam[]; highlight: string | null; ref: Ref<MachineApi> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const sim = useRef({ balls: [] as Ball[], air: 0, target: 0, hi: null as string | null });

  useEffect(() => {
    sim.current.hi = highlight;
  }, [highlight]);

  useImperativeHandle(ref, () => ({
    mix: (level) => void (sim.current.target = level),
    draw: (teamId) =>
      new Promise<number>((done) => {
        const team = teams.findIndex((t) => t.id === teamId);
        // the suction grabs the team's ball nearest the top
        const b = sim.current.balls.filter((b) => b.team === team && b.state === "in").sort((a, c) => a.y - c.y)[0];
        if (!b) return done(0);
        Object.assign(b, { state: "up", t: 0, x0: b.x, y0: b.y, done });
      }),
    drain: (teamId) => {
      const team = teams.findIndex((t) => t.id === teamId);
      sim.current.balls
        .filter((b) => b.team === team && b.state === "in")
        .forEach((b, k) => Object.assign(b, { state: "out", t: -k * 0.05 }));
    },
    clearCup: () => sim.current.balls.filter((b) => b.state === "cup").forEach((b) => Object.assign(b, { state: "out", t: 0 })),
  }), [teams]);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const looks = teams.map((t) => ({ color: t.color, light: shade(t.color, 0.55), dark: shade(t.color, -0.45) }));
    const ids = teams.map((t) => t.id);
    const state = sim.current;
    Object.assign(state, { balls: seed(teams), air: 0, target: 0 }); // a new set of teams refills the drum
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
      state.balls = animate(state.balls, dt);
      if (w) render(ctx, w, state.balls, looks, ids, state.hi); // w is 0 while the drum is hidden (phones, before Play)
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [teams]);

  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label="Lottery machine: a glass drum of numbered balls, one colour per team"
      className="block h-auto w-full"
      style={{ aspectRatio: ASPECT }}
    />
  );
}
