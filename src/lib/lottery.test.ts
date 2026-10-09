import { test } from "node:test";
import assert from "node:assert/strict";
import { drawField, GMS, lotteryField } from "./lottery";

const name = (id: string) => GMS.find((g) => g.id === id)!.name;
const FIELD = ["Jeremy", "Ilan", "Theo", "Benji", "Awad", "Thiry", "Chomi", "Brunson"];

test("lottery field: worst record first, the 7-7 teams by final ranking, the league's odds", () => {
  const f = lotteryField();
  assert.deepEqual(f.map((t) => t.name), FIELD);
  assert.deepEqual(f.map((t) => t.odds), [25, 20, 15, 10, 7.5, 7.5, 7.5, 7.5]);
  assert.equal(new Set(GMS.map((g) => g.id)).size, 8);
});

test("lottery draw on the field: every team once, odds hold, every pick is drawn", () => {
  let seed = 11;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const first: Record<string, number> = {};
  const N = 30000;
  let shuffled = 0;
  for (let i = 0; i < N; i++) {
    const order = drawField(rand).map(name);
    assert.equal(new Set(order).size, 8);
    first[order[0]] = (first[order[0]] ?? 0) + 1;
    if (order.slice(4).join() !== FIELD.filter((n) => order.slice(4).includes(n)).join()) shuffled++;
  }
  assert.ok(shuffled > N / 2); // picks 5 to 8 are drawn too: most of the time they aren't in the field's order
  const odds = [25, 20, 15, 10, 7.5, 7.5, 7.5, 7.5];
  FIELD.forEach((n, i) => assert.ok(Math.abs(first[n] / N - odds[i] / 100) < 0.01, `${n}: ${first[n] / N}`));
});
