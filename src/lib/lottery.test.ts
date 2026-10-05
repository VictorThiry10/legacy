import { test } from "node:test";
import assert from "node:assert/strict";
import { drawField, GMS, lotteryField } from "./lottery";

const name = (id: string) => GMS.find((g) => g.id === id)!.name;

test("lottery field: worst record first, tied teams share their odds", () => {
  const f = lotteryField();
  assert.deepEqual(f.map((t) => t.name), ["Elliot", "Ilan", "Theo", "Awad", "Benji", "Thiry", "Chomi", "Brunson"]);
  assert.deepEqual(f.slice(0, 3).map((t) => t.odds), [25, 20, 15]);
  for (const t of f.slice(3, 6)) assert.ok(Math.abs(t.odds - 25 / 3) < 1e-9); // (10 + 7.5 + 7.5) / 3
  assert.deepEqual(f.slice(6).map((t) => t.odds), [7.5, 7.5]);
  assert.ok(Math.abs(f.reduce((a, t) => a + t.odds, 0) - 100) < 1e-9);
});

test("lottery draw on the field: every team once, odds hold, the 7-7 teams are treated alike", () => {
  let seed = 11;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const first: Record<string, number> = {};
  const beforeOthers: Record<string, number> = {}; // among the 7-7 teams left out of the top 4: who picks first
  const N = 30000;
  for (let i = 0; i < N; i++) {
    const order = drawField(rand).map(name);
    assert.equal(new Set(order).size, 8);
    first[order[0]] = (first[order[0]] ?? 0) + 1;
    // nobody drops more than 4 places from the worst place his record allows
    assert.ok(order.indexOf("Elliot") <= 4 && order.indexOf("Ilan") <= 5 && order.indexOf("Theo") <= 6);
    const tied = order.slice(4).filter((n) => ["Awad", "Benji", "Thiry"].includes(n));
    if (tied.length > 1) beforeOthers[tied[0]] = (beforeOthers[tied[0]] ?? 0) + 1;
  }
  const share = (n: string) => first[n] / N;
  assert.ok(Math.abs(share("Elliot") - 0.25) < 0.01);
  assert.ok(Math.abs(share("Ilan") - 0.2) < 0.01);
  assert.ok(Math.abs(share("Theo") - 0.15) < 0.01);
  for (const n of ["Awad", "Benji", "Thiry"]) assert.ok(Math.abs(share(n) - 0.0833) < 0.008);
  for (const n of ["Chomi", "Brunson"]) assert.ok(Math.abs(share(n) - 0.075) < 0.008);
  const total = Object.values(beforeOthers).reduce((a, b) => a + b, 0);
  for (const n of ["Awad", "Benji", "Thiry"]) assert.ok(Math.abs(beforeOthers[n] / total - 1 / 3) < 0.02);
});
