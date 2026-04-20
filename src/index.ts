/**
 * moneyify — lightweight currency conversion library.
 *
 * Drop-in compatible with cashify's public API (sync `convert`, `parse`,
 * constructor + functional style, optional big.js integration), with one
 * extra superpower: `Moneyify.live()` auto-fetches rates from the
 * AllRatesToday API so you never need to maintain a rate table yourself.
 *
 * Examples
 * --------
 *
 * Classic (bring your own rates — identical to cashify):
 *
 *   const m = new Moneyify({ base: 'USD', rates: { EUR: 0.92, GBP: 0.79 } });
 *   m.convert(10, { from: 'USD', to: 'EUR' }); // 9.2
 *   m.convert('10 USD to EUR');                // 9.2
 *
 * Auto-fetch (the moneyify moat):
 *
 *   const m = await Moneyify.live({ base: 'USD', apiKey: process.env.ALLRATESTODAY_API_KEY });
 *   m.convert(100, { from: 'USD', to: 'INR' }); // mid-market rate, fetched for you
 */

/* ---------- types ---------- */

export type Rates = Record<string, number>;

export interface ConvertOptions {
  from?: string;
  to?: string;
  base?: string;
  rates?: Rates;
  BigJs?: BigJsConstructor;
}

export interface MoneyifyOptions {
  base: string;
  rates?: Rates;
  BigJs?: BigJsConstructor;
}

export interface MoneyifyLiveOptions extends Omit<MoneyifyOptions, "rates"> {
  /** AllRatesToday API key. Falls back to process.env.ALLRATESTODAY_API_KEY. */
  apiKey?: string;
  /** Override the base URL. */
  baseUrl?: string;
  /** Optional fetch implementation. */
  fetch?: typeof fetch;
  /** Timeout in milliseconds (default 15000). */
  timeoutMs?: number;
  /** Pre-fetch rates for only this subset of currency codes. Default: all. */
  symbols?: string[];
}

export interface ParseResult {
  amount: number;
  from?: string;
  to?: string;
}

/** Minimal shape of big.js-like libraries (for optional precision math). */
export interface BigJsInstance {
  times(n: number | string | BigJsInstance): BigJsInstance;
  div(n: number | string | BigJsInstance): BigJsInstance;
  toNumber(): number;
  toString(): string;
}
export interface BigJsConstructor {
  new (value: number | string): BigJsInstance;
}

/* ---------- errors ---------- */

export class MoneyifyError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "MoneyifyError";
    this.status = status;
  }
}

/* ---------- parse ---------- */

const SYMBOL_TO_CODE: Record<string, string> = {
  "$": "USD",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "₹": "INR",
  "₽": "RUB",
  "₺": "TRY",
  "₩": "KRW",
  "₪": "ILS",
  "R$": "BRL",
  "A$": "AUD",
  "C$": "CAD",
  "HK$": "HKD",
  "NZ$": "NZD",
  "S$": "SGD",
};

const FULL_EXPR = /^\s*([A-Z]{2}\$|R\$|[\$€£¥₹₽₺₩₪])?\s*(-?[0-9][0-9_,]*(?:\.[0-9]+)?)\s*([A-Za-z]{3})?\s+(?:to|in|as)\s+([A-Za-z]{3})\s*$/i;
const PARTIAL_EXPR = /^\s*([A-Z]{2}\$|R\$|[\$€£¥₹₽₺₩₪])?\s*(-?[0-9][0-9_,]*(?:\.[0-9]+)?)\s*([A-Za-z]{3})?\s*$/i;

/**
 * Parse an expression like "10 EUR to GBP", "12.5 GBP in EUR", "€10 EUR" or
 * plain "10 USD". Returns { amount, from?, to? }.
 */
export function parse(expression: string): ParseResult {
  if (typeof expression !== "string") {
    throw new MoneyifyError("parse() requires a string expression");
  }

  const full = FULL_EXPR.exec(expression);
  if (full) {
    const [, symbol, amountStr, fromCode, toCode] = full;
    const fromSymbolCode = symbol ? SYMBOL_TO_CODE[symbol.toUpperCase()] : undefined;
    return {
      amount: parseAmount(amountStr!),
      from: (fromCode ?? fromSymbolCode)?.toUpperCase(),
      to: toCode!.toUpperCase(),
    };
  }

  const partial = PARTIAL_EXPR.exec(expression);
  if (partial) {
    const [, symbol, amountStr, fromCode] = partial;
    const fromSymbolCode = symbol ? SYMBOL_TO_CODE[symbol.toUpperCase()] : undefined;
    return {
      amount: parseAmount(amountStr!),
      from: (fromCode ?? fromSymbolCode)?.toUpperCase(),
    };
  }

  throw new MoneyifyError(`Unable to parse expression: "${expression}"`);
}

function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[_,]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) {
    throw new MoneyifyError(`Invalid amount: "${raw}"`);
  }
  return n;
}

/* ---------- core conversion ---------- */

function computeRate(from: string, to: string, base: string, rates: Rates): number {
  if (from === to) return 1;

  // from === base: rate is directly rates[to]
  if (from === base) {
    const r = rates[to];
    if (r === undefined) {
      throw new MoneyifyError(`Missing rate for ${to} (base: ${base})`);
    }
    return r;
  }

  // to === base: rate is 1 / rates[from]
  if (to === base) {
    const r = rates[from];
    if (r === undefined) {
      throw new MoneyifyError(`Missing rate for ${from} (base: ${base})`);
    }
    return 1 / r;
  }

  // Cross rate: triangulate via base.
  const rFrom = rates[from];
  const rTo = rates[to];
  if (rFrom === undefined) {
    throw new MoneyifyError(`Missing rate for ${from} (base: ${base})`);
  }
  if (rTo === undefined) {
    throw new MoneyifyError(`Missing rate for ${to} (base: ${base})`);
  }
  return rTo / rFrom;
}

/* ---------- standalone convert() ---------- */

/**
 * Convert an amount using explicit rates (cashify-compatible signature).
 *
 * `amount` can be a number or an expression parseable by `parse()`.
 */
export function convert(
  amount: number | string,
  options: ConvertOptions
): number {
  if (!options.base) {
    throw new MoneyifyError("convert() requires options.base");
  }
  if (!options.rates) {
    throw new MoneyifyError("convert() requires options.rates (use Moneyify.live() for auto-fetch)");
  }

  let numericAmount: number;
  let from = options.from;
  let to = options.to;

  if (typeof amount === "string") {
    const parsed = parse(amount);
    numericAmount = parsed.amount;
    from = from ?? parsed.from;
    to = to ?? parsed.to;
  } else if (typeof amount === "number" && Number.isFinite(amount)) {
    numericAmount = amount;
  } else {
    throw new MoneyifyError("convert() amount must be a number or parseable string");
  }

  const fromCode = (from ?? options.base).toUpperCase();
  const toCode = to?.toUpperCase();
  if (!toCode) {
    throw new MoneyifyError("convert() requires a 'to' currency (via options.to or expression)");
  }

  const rate = computeRate(fromCode, toCode, options.base.toUpperCase(), options.rates);

  if (options.BigJs) {
    const Big = options.BigJs;
    return new Big(numericAmount).times(rate).toNumber();
  }
  return numericAmount * rate;
}

/* ---------- Moneyify class ---------- */

export class Moneyify {
  public base: string;
  public rates: Rates;
  private BigJs?: BigJsConstructor;

  constructor(options: MoneyifyOptions) {
    if (!options?.base) {
      throw new MoneyifyError("Moneyify constructor requires a 'base' currency");
    }
    this.base = options.base.toUpperCase();
    this.rates = options.rates ?? {};
    this.BigJs = options.BigJs;
  }

  /** Cashify-compatible sync convert. */
  convert(amount: number | string, options: Omit<ConvertOptions, "base" | "rates"> = {}): number {
    return convert(amount, {
      ...options,
      base: this.base,
      rates: this.rates,
      BigJs: options.BigJs ?? this.BigJs,
    });
  }

  /** Replace the internal rate table. */
  setRates(rates: Rates): void {
    this.rates = rates;
  }

  /**
   * Create a Moneyify instance with rates pre-fetched from the AllRatesToday API.
   *
   * @example
   *   const m = await Moneyify.live({ base: 'USD', apiKey: 'art_live_...' });
   *   m.convert(100, { to: 'INR' });
   */
  static async live(options: MoneyifyLiveOptions): Promise<Moneyify> {
    const apiKey =
      options.apiKey ??
      (typeof process !== "undefined" ? process.env?.ALLRATESTODAY_API_KEY : undefined);
    if (!apiKey) {
      throw new MoneyifyError(
        "Moneyify.live() requires an API key. Pass options.apiKey or set ALLRATESTODAY_API_KEY env var. " +
          "Get a free key at https://allratestoday.com/register/"
      );
    }

    const fetchImpl = options.fetch ?? (globalThis.fetch as typeof fetch | undefined);
    if (!fetchImpl) {
      throw new MoneyifyError(
        "fetch is not available in this runtime. Use Node 18+ or pass options.fetch."
      );
    }

    const baseUrl = (options.baseUrl ?? "https://allratestoday.com").replace(/\/$/, "");
    const base = options.base.toUpperCase();

    // Decide which target symbols to fetch.
    let symbols = options.symbols;
    if (!symbols || symbols.length === 0) {
      symbols = await fetchSymbols(baseUrl, fetchImpl, options.timeoutMs ?? 15_000);
    }
    const targets = symbols
      .map((s) => s.toUpperCase())
      .filter((s) => s !== base);

    const rates = await fetchRates(baseUrl, base, targets, apiKey, fetchImpl, options.timeoutMs ?? 15_000);

    return new Moneyify({ base, rates, BigJs: options.BigJs });
  }
}

/* ---------- AllRatesToday fetchers ---------- */

async function fetchSymbols(baseUrl: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${baseUrl}/api/v1/symbols`, {
      headers: { Accept: "application/json", "User-Agent": "moneyify-node/1.0" },
      signal: controller.signal,
    });
    if (!res.ok) throw new MoneyifyError(`Failed to fetch symbols: HTTP ${res.status}`, res.status);
    const json: any = await res.json();
    const list: any[] = json?.currencies ?? json ?? [];
    return list.map((c) => (typeof c === "string" ? c : c.code)).filter(Boolean);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRates(
  baseUrl: string,
  base: string,
  targets: string[],
  apiKey: string,
  fetchImpl: typeof fetch,
  timeoutMs: number
): Promise<Rates> {
  if (targets.length === 0) return {};

  // URL can get long; chunk conservatively.
  const CHUNK = 50;
  const rates: Rates = {};

  for (let i = 0; i < targets.length; i += CHUNK) {
    const chunk = targets.slice(i, i + CHUNK);
    const url = `${baseUrl}/api/v1/rates?source=${base}&target=${chunk.join(",")}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetchImpl(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
          "User-Agent": "moneyify-node/1.0",
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new MoneyifyError(
        `AllRatesToday API error ${res.status}: ${body.slice(0, 300) || res.statusText}`,
        res.status
      );
    }

    const json: any = await res.json();
    const items: any[] = Array.isArray(json) ? json : (json?.rates ?? []);
    for (const item of items) {
      const code = (item.target ?? item.code)?.toUpperCase();
      const rate = typeof item.rate === "number" ? item.rate : Number(item.rate);
      if (code && Number.isFinite(rate)) rates[code] = rate;
    }
  }

  return rates;
}

/* ---------- default export ---------- */

export default Moneyify;
