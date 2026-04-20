import { test } from "node:test";
import assert from "node:assert/strict";
import { Moneyify, convert, parse, MoneyifyError } from "../dist/index.mjs";

const rates = { EUR: 1.0, GBP: 0.85, USD: 1.08, JPY: 170.0 };

test("constructor + sync convert (EUR → GBP)", () => {
  const m = new Moneyify({ base: "EUR", rates });
  assert.equal(m.convert(10, { from: "EUR", to: "GBP" }), 8.5);
});

test("cross-rate: USD → JPY via EUR base", () => {
  const m = new Moneyify({ base: "EUR", rates });
  const result = m.convert(100, { from: "USD", to: "JPY" });
  // (170 / 1.08) * 100 ≈ 15740.7
  assert.ok(Math.abs(result - (170 / 1.08) * 100) < 0.0001);
});

test("reverse: rates[from] inversion (GBP → EUR)", () => {
  const m = new Moneyify({ base: "EUR", rates });
  // 10 GBP → EUR. base=EUR, so rate = 1/rates[GBP] = 1/0.85
  assert.ok(Math.abs(m.convert(10, { from: "GBP", to: "EUR" }) - 10 / 0.85) < 1e-9);
});

test("standalone convert() works the same", () => {
  assert.equal(convert(10, { from: "EUR", to: "GBP", base: "EUR", rates }), 8.5);
});

test("parse: '10 EUR to GBP'", () => {
  assert.deepEqual(parse("10 EUR to GBP"), { amount: 10, from: "EUR", to: "GBP" });
});

test("parse: '€10 EUR'", () => {
  assert.deepEqual(parse("€10 EUR"), { amount: 10, from: "EUR" });
});

test("parse: case-insensitive and thousand separators", () => {
  assert.deepEqual(parse("1,250.5 usd in gbp"), { amount: 1250.5, from: "USD", to: "GBP" });
});

test("parse: 'in' and 'as' both work", () => {
  assert.deepEqual(parse("5 USD in EUR"), { amount: 5, from: "USD", to: "EUR" });
  assert.deepEqual(parse("5 USD as EUR"), { amount: 5, from: "USD", to: "EUR" });
});

test("convert with parsed expression", () => {
  const m = new Moneyify({ base: "EUR", rates });
  assert.equal(m.convert("10 EUR to GBP"), 8.5);
});

test("missing rate throws MoneyifyError", () => {
  const m = new Moneyify({ base: "EUR", rates });
  assert.throws(
    () => m.convert(10, { from: "EUR", to: "XYZ" }),
    (err) => err instanceof MoneyifyError && /Missing rate/.test(err.message)
  );
});

test("BigJs integration uses big.js path", () => {
  class FakeBig {
    constructor(v) { this.v = Number(v); }
    times(n) { const x = typeof n === "number" ? n : n.v; return new FakeBig(this.v * x); }
    div(n) { const x = typeof n === "number" ? n : n.v; return new FakeBig(this.v / x); }
    toNumber() { return this.v; }
    toString() { return String(this.v); }
  }
  const m = new Moneyify({ base: "EUR", rates, BigJs: FakeBig });
  assert.equal(m.convert(10, { from: "EUR", to: "GBP" }), 8.5);
});

test("Moneyify.live() requires an API key", async () => {
  const prev = process.env.ALLRATESTODAY_API_KEY;
  delete process.env.ALLRATESTODAY_API_KEY;
  try {
    await assert.rejects(
      () => Moneyify.live({ base: "USD" }),
      (err) => err instanceof MoneyifyError && /API key/.test(err.message)
    );
  } finally {
    if (prev !== undefined) process.env.ALLRATESTODAY_API_KEY = prev;
  }
});

test("Moneyify.live() wires custom fetch + produces a working instance", async () => {
  const fakeFetch = async (url) => {
    const u = String(url);
    if (u.includes("/api/v1/symbols")) {
      return new Response(JSON.stringify({ currencies: [{ code: "USD" }, { code: "EUR" }, { code: "GBP" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (u.includes("/api/v1/rates")) {
      return new Response(
        JSON.stringify([
          { source: "USD", target: "EUR", rate: 0.92 },
          { source: "USD", target: "GBP", rate: 0.79 },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response("not found", { status: 404 });
  };

  const m = await Moneyify.live({ base: "USD", apiKey: "test", fetch: fakeFetch });
  assert.equal(m.base, "USD");
  assert.equal(m.convert(100, { from: "USD", to: "EUR" }), 92);
  assert.equal(m.convert(100, { from: "USD", to: "GBP" }), 79);
});
