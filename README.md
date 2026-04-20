# 💱 moneyify

[![npm version](https://img.shields.io/npm/v/moneyify)](https://www.npmjs.com/package/moneyify)
[![npm downloads](https://img.shields.io/npm/dm/moneyify)](https://www.npmjs.com/package/moneyify)
[![license](https://img.shields.io/npm/l/moneyify)](./LICENSE)

Lightweight currency conversion library. **Cashify-compatible API** — bring your own rates and convert synchronously — plus **one extra superpower**: `Moneyify.live()` auto-fetches mid-market rates from the [AllRatesToday API](https://allratestoday.com) so you never need to maintain a rate table yourself.

- 💡 Drop-in replacement for `cashify` (sync `convert`, expression parsing, big.js support)
- 🌍 Auto-fetch 160+ currencies from Refinitiv (Reuters) + interbank feeds
- 📦 **Zero runtime dependencies**
- 🧮 Optional `big.js` integration for arbitrary-precision math
- 💬 Parses expressions: `"10 USD to EUR"`, `"€10 EUR in GBP"`, `"1,250.5 usd in gbp"`
- 🟦 Written in TypeScript, ships ESM + CJS + `.d.ts`
- ⚡ Node 18+

---

## 📦 Installation

```bash
npm install moneyify
```

```bash
yarn add moneyify
pnpm add moneyify
```

---

## 🚀 Usage

### 1. Bring your own rates (identical to cashify)

```js
import { Moneyify } from "moneyify";

const rates = { EUR: 1.00, GBP: 0.85, USD: 1.08 };
const m = new Moneyify({ base: "EUR", rates });

m.convert(10, { from: "EUR", to: "GBP" }); // 8.5
m.convert("10 EUR to GBP");                // 8.5
m.convert("€10 EUR in USD");               // 10.8
```

### 2. Auto-fetch from AllRatesToday (the moneyify moat)

```js
import { Moneyify } from "moneyify";

// Rates are fetched and cached on construction.
const m = await Moneyify.live({
  base: "USD",
  apiKey: process.env.ALLRATESTODAY_API_KEY,
});

m.convert(100, { from: "USD", to: "INR" });  // e.g. 8320.5
m.convert("50 USD to EUR");                   // e.g. 46.17
```

Get a free API key at **[allratestoday.com/register](https://allratestoday.com/register/)** — no credit card required.

### 3. Functional (no constructor, also matches cashify)

```js
import { convert } from "moneyify";

convert(10, {
  from: "EUR",
  to: "GBP",
  base: "EUR",
  rates: { GBP: 0.85, EUR: 1.0 },
}); // 8.5
```

### 4. Parse expressions without converting

```js
import { parse } from "moneyify";

parse("10 EUR to GBP");    // { amount: 10, from: "EUR", to: "GBP" }
parse("€10 EUR");          // { amount: 10, from: "EUR" }
parse("1,250.5 usd in gbp"); // { amount: 1250.5, from: "USD", to: "GBP" }
```

Supported separators: `to`, `in`, `as` (case-insensitive).
Supported symbols: `$`, `€`, `£`, `¥`, `₹`, `₽`, `₺`, `₩`, `₪`, `R$`, `A$`, `C$`, `HK$`, `NZ$`, `S$`.

### 5. Precision math with `big.js`

```js
import Big from "big.js";
import { Moneyify } from "moneyify";

const m = new Moneyify({
  base: "USD",
  rates: { EUR: 0.923456789 },
  BigJs: Big,
});

m.convert(100, { from: "USD", to: "EUR" }); // 92.3456789 (no float drift)
```

---

## 📚 API

### `new Moneyify({ base, rates?, BigJs? })`

| Option  | Type                           | Description |
|---------|--------------------------------|-------------|
| `base`  | `string`                       | Base currency (`"USD"`, `"EUR"`, …). Required. |
| `rates` | `Record<string, number>`       | Rate table where each value is "1 base = X of this currency". Default: `{}`. |
| `BigJs` | `BigJsConstructor`             | Optional big.js-compatible constructor for arbitrary-precision math. |

### `instance.convert(amount, options?)`

Sync. Returns a `number` (or big.js-backed `number` if `BigJs` was passed).

- `amount`: `number` or a parseable expression string (`"10 USD to EUR"`)
- `options.from?`: source currency (defaults to `base`)
- `options.to?`: target currency (required unless embedded in the expression)

### `Moneyify.live(options)` — static async factory

```ts
Moneyify.live({
  base: string;
  apiKey?: string;       // defaults to process.env.ALLRATESTODAY_API_KEY
  baseUrl?: string;      // default: "https://allratestoday.com"
  fetch?: typeof fetch;
  timeoutMs?: number;    // default 15000
  symbols?: string[];    // pre-fetch only these codes (default: all 160+)
  BigJs?: BigJsConstructor;
}): Promise<Moneyify>
```

Pre-fetches rates against `base` and returns a ready-to-use instance. Once resolved, `.convert(...)` is fully synchronous.

### `convert(amount, { from, to, base, rates, BigJs? })` — functional

Same as `instance.convert()` but bring your own `base` and `rates` each call. Cashify parity.

### `parse(expression)` — string parser

Returns `{ amount, from?, to? }`. Throws `MoneyifyError` if unparseable.

### `MoneyifyError`

All errors thrown by moneyify are instances of `MoneyifyError`. Network/API errors include a `.status` field with the HTTP status code.

```js
import { MoneyifyError } from "moneyify";

try {
  m.convert(10, { from: "USD", to: "XYZ" });
} catch (err) {
  if (err instanceof MoneyifyError) {
    console.error(err.status, err.message);
  }
}
```

---

## 🔄 Migrating from cashify

The public API is identical. Drop-in swap:

```diff
- import { Cashify, convert, parse } from "cashify";
+ import { Moneyify as Cashify, convert, parse } from "moneyify";
```

Everything else works the same. If you want to stop maintaining your rate table, switch from `new Cashify({ base, rates })` to `await Moneyify.live({ base, apiKey })`.

---

## 🌍 Supported currencies

160+ currencies including majors (USD, EUR, GBP, JPY, CHF, CAD, AUD, NZD), emerging-market (INR, CNY, BRL, MXN, TRY, ZAR, SGD, HKD, KRW, THB, PHP, PKR, BDT, LKR, NGN, GHS, KES, AED, SAR, EGP), and precious metals (XAU, XAG).

Full list: [`allratestoday.com/api/v1/symbols`](https://allratestoday.com/api/v1/symbols).

---

## 🔗 Related projects

- [`cashify`](https://github.com/xxczaki/cashify) – The library this package's API is modelled on. If you only need offline conversion math and don't want a network call, use cashify.
- [`fx-rates`](https://www.npmjs.com/package/fx-rates) – Even lighter companion: a one-function library + `fx-rates` CLI for real-time rates.
- [`@allratestoday/sdk`](https://www.npmjs.com/package/@allratestoday/sdk) – Full-featured SDK with historical data, batch requests, and webhooks.
- [`react-currency-localizer-realtime`](https://www.npmjs.com/package/react-currency-localizer-realtime) – React hooks and components for auto-localized pricing.
- [`allratestoday`](https://allratestoday.com) – The REST API that powers `Moneyify.live()`.

---

## 🤖 AI disclosure

This project contains code generated by Large Language Models (LLMs), under human supervision and proofreading. All published versions are reviewed, tested, and released by a human maintainer.

---

## 📄 License

[MIT](./LICENSE) © [AllRatesToday](https://allratestoday.com) — maintained by [Chathuranga Basnayaka](https://github.com/cahthuranag).
