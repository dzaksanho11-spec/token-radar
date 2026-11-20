// Token Radar — the scoring model, written for this entry.
//
// A snapshot of the protocol universe goes in; a ranked board comes out.
// The board only ever ranks protocols that record no token and are not a
// wrapped, staked or bridged product of a token that already trades. That
// exclusion rule is the watchlist's own rule, applied to the whole
// snapshot rather than only to the protocols above the $50M floor: the
// watchlist is a floor, never a ceiling, and the radar's job is the early
// protocols it leaves out. No protocol name is ever special-cased —
// everything below is derived from the ten fields the snapshot carries.
//
// The value model, "radar-2", prices a protocol at a quarter of its TVL,
// adjusted three ways:
//
//   base       TVL x 0.25
//   growth     seven-day change, clamped to -50% .. +80%, worth half its
//              face value as a multiplier (0.75 .. 1.40). The clamp is
//              there because one week in crypto can print +4,448% — one
//              protocol in this snapshot does — and a single week must
//              never be allowed to decide the ranking.
//   maturity   0.70 + min(age with no token, 1095 days) / 1095 x 0.30
//              (0.70 .. 1.00). A protocol that has run a long time
//              without issuing a token is a steadier bet than one listed
//              last month. A missing listing date counts as 365 days.
//   breadth    0.95 + 0.05 x min(chains, 4) / 4 (0.95 .. 1.00), a small
//              tie-breaker for protocols live on several chains.
//
//   implied = max(1, round(base x growth x maturity x breadth))
//
// Protocols whose token already trades are never scored: they are set
// aside for the dashboard's Live token view, shown with their market
// cap, which is a fact rather than a model. And a protocol is always
// described as one that "records no token" — the snapshot carries no
// token for it, which is not proof that it has none.

/** One protocol as the sealed snapshot records it: exactly ten fields. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole sealed snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** Every constant the model runs on. The dashboard prints these and the
 *  sandbox lets a reader change the first two and watch the board move. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_floor: number;
  breadth_range: number;
  breadth_chains: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.25,
  growth_weight: 0.5,
  growth_floor: -50,
  growth_cap: 80,
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_days: 1095,
  unknown_age_days: 365,
  breadth_floor: 0.95,
  breadth_range: 0.05,
  breadth_chains: 4,
};

/** The model's version label, shown by the dashboard. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the dashboard's Live token view carries. */
export const LIVE_ROWS = 24;

/** Categories that mark a protocol as a wrapped, staked or bridged
 *  product of a token that already trades — the watchlist rule. */
export const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** Exchange names a protocol name must not begin with (watchlist rule). */
export const EXCHANGE_PREFIXES = [
  'Binance',
  'Coinbase',
  'Bybit',
  'Kraken',
  'Bitget',
  'OKX',
  'Bitfinex',
  'Gemini',
];

/** One farm step: what to do, what it costs, how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** A board row in the compact form data.js carries; the page rebuilds
 *  the farm plan from these fields, it is not stored twice. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  watchlist: boolean;
}

/** A protocol whose token already trades: shown with its market cap. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard renders, from one snapshot. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Thrown when a snapshot file is not the shape this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** Keep `value` inside [lo, hi]. */
function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** A finite number, or `fallback` when the value is missing or not a number. */
function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Round to four decimal places, for the multipliers the board reports. */
function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/**
 * Whole days from `listedAt` to the snapshot date, never below zero;
 * null when the listing date is absent or does not parse.
 */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const asOfMs = Date.parse(`${asOf}T00:00:00Z`);
  const listedMs = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(asOfMs) || !Number.isFinite(listedMs)) return null;
  return Math.max(0, Math.floor((asOfMs - listedMs) / DAY_MS));
}

/** The four multipliers and the implied value one protocol scores under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
): {
  implied: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  breadthMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const growthPct = clamp(finiteNumber(protocol.change_7d, 0), model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor +
    (clamp(ageForModel, 0, model.maturity_days) / model.maturity_days) * model.maturity_range;
  const breadthMult =
    model.breadth_floor +
    (Math.min(protocol.chains.length, model.breadth_chains) / model.breadth_chains) * model.breadth_range;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * model.base_multiple * growthMult * maturityMult * breadthMult));
  return { implied, growthPct, growthMult, maturityMult, breadthMult, age };
}

/** A name that ends in a version marker — a pool of another protocol. */
const VERSIONED_NAME = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word `wrapped`, `staked` or `staking` in a name. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/**
 * Whether a protocol records no token at all. Say "records no token",
 * never "has no token": the record is not proof.
 */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol may be ranked: it records no token, and it is not
 * a wrapped, staked or bridged product of a token that already trades,
 * not a versioned pool, and not an exchange's own product. This is the
 * watchlist's exclusion rule, applied to the whole snapshot.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED_NAME.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIXES.some((prefix) => p.name.startsWith(prefix))) return false;
  return true;
}

/** The first chain a protocol names, or a neutral phrase when it names none. */
function primaryChain(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one qualifying action, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const category = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (category.includes('lend') || category.includes('cdp') || category.includes('collateral')) {
    return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  }
  if (category.includes('dex') || category.includes('yield') || category.includes('leveraged farm')) {
    return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  }
  if (category.includes('bridge')) {
    return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  }
  if (category.includes('staking') || category.includes('restak')) {
    return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  }
  if (category.includes('perpetual') || category.includes('derivative')) {
    return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  }
  if (category.includes('prediction')) {
    return `Fund $${capital} and place one market position on ${name}.`;
  }
  if (category.includes('curator') || category.includes('allocator')) {
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  }
  if (category.includes('stable')) {
    return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  }
  if (category.includes('rwa')) {
    return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  }
  if (category.includes('insurance')) {
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  }
  if (category.includes('payment')) {
    return `Pay $${capital} through ${name} on ${chain} and keep the receipt for the farm log.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A second, different qualifying action, so the plan is not one action repeated. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const category = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (category.includes('lend') || category.includes('cdp')) {
    return `Borrow a small amount against the supplied collateral on ${name}, then repay it the same week.`;
  }
  if (category.includes('dex') || category.includes('yield')) {
    return `Swap $${Math.max(10, Math.round(capital / 5))} of USDC for another asset inside ${name} on ${chain}.`;
  }
  if (category.includes('perpetual') || category.includes('derivative')) {
    return `Close the hedge on ${name} after one week and open a fresh one half the size.`;
  }
  if (category.includes('prediction')) {
    return `Settle one market on ${name} and open a second one on a different outcome.`;
  }
  if (category.includes('curator') || category.includes('allocator')) {
    return `Move $${Math.max(10, Math.round(capital / 2))} into a second ${name} vault on ${chain} to spread the position.`;
  }
  if (category.includes('rwa') || category.includes('stable')) {
    return `Hold the minted asset for a full week, then check its redemption page before adding more.`;
  }
  return `Vote in ${name}'s governance or community poll if one is open, or complete one quest the protocol publishes.`;
}

/** One step as a single string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let text = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (text.length > 600) text = `${text.slice(0, 596)}...`;
  if (text.length < 20) text = `${text} Hold the position and check the protocol's own page.`;
  return text;
}

/**
 * A protocol's farm plan: eight steps, each an action with a cost and a
 * time. The plan is derived from the protocol's own record (category,
 * chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = primaryChain(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const steps: FarmStep[] = [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: secondActionFor(p, capital, chain),
      cost: `about $${capital >= 150 ? 5 : 2} of gas`,
      time: '10 minutes',
    },
  ];
  if (p.chains.length > 1) {
    steps.push({
      text: `Repeat the same position on ${p.chains[1]} so the farm covers two chains instead of one.`,
      cost: `$${Math.max(25, Math.round(capital / 2))} of capital and about $3 of gas`,
      time: '15 minutes',
    });
  } else {
    steps.push({
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    });
  }
  steps.push(
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Withdraw a small test amount first, check it arrives in the farm wallet, then unwind the rest.`,
      cost: 'about $2 of gas for the test withdrawal',
      time: '15 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  );
  return steps;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const protocol = bySlug.get(slug);
    if (protocol !== undefined) chosen.set(slug, protocol);
  }
  for (const protocol of snapshot.protocols) {
    if (!chosen.has(protocol.slug) && isRankable(protocol)) chosen.set(protocol.slug, protocol);
  }
  const scored = [...chosen.values()].map((p) => {
    const scoredValue = impliedValue(p, snapshot.as_of, model);
    return { protocol: p, ...scoredValue };
  });
  scored.sort(
    (a, b) => b.implied - a.implied || (a.protocol.slug < b.protocol.slug ? -1 : a.protocol.slug > b.protocol.slug ? 1 : 0),
  );
  return scored.map((s, index) => ({
    rank: index + 1,
    slug: s.protocol.slug,
    name: s.protocol.name,
    category: s.protocol.category,
    chains: s.protocol.chains,
    tvl_usd: s.protocol.tvl_usd,
    change_7d: s.protocol.change_7d,
    mcap_usd: s.protocol.mcap_usd,
    listed_at: s.protocol.listed_at,
    gecko_id: s.protocol.gecko_id,
    symbol: s.protocol.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: model.base_multiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.protocol, s.age).map(stepText),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow, watchlist: string[] = []): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    watchlist: watchlist.includes(row.slug),
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((row) => !snapshot.watchlist.includes(row.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((row) => radarRow(row, snapshot.watchlist)),
    live,
  };
  return { board, radar };
}

/** A nullable number field out of a raw protocol object, or null. */
function optionalNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** A nullable string field out of a raw protocol object, or null. */
function optionalString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new SnapshotError('snapshot.json is not a JSON object');
  }
  const doc = raw as Record<string, unknown>;
  if (typeof doc.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(doc.as_of)) {
    throw new SnapshotError('snapshot.json has no as_of date');
  }
  if (typeof doc.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof doc.floor_usd !== 'number' || !Number.isSafeInteger(doc.floor_usd) || doc.floor_usd <= 0) {
    throw new SnapshotError('snapshot.json has no floor_usd');
  }
  if (!Array.isArray(doc.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(doc.watchlist) || doc.watchlist.some((slug) => typeof slug !== 'string')) {
    throw new SnapshotError('snapshot.json has no watchlist of slugs');
  }
  const protocols = doc.protocols.map((value, index) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new SnapshotError(`snapshot.json's protocol ${index} is not an object`);
    }
    const p = value as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${index} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: optionalNumber(p, 'change_7d'),
      mcap_usd: optionalNumber(p, 'mcap_usd'),
      listed_at: optionalString(p, 'listed_at'),
      gecko_id: optionalString(p, 'gecko_id'),
      symbol: optionalString(p, 'symbol'),
    };
  });
  return {
    as_of: doc.as_of,
    source: doc.source,
    floor_usd: doc.floor_usd,
    protocols,
    watchlist: doc.watchlist as string[],
  };
}

/**
 * Why a board is not one the gate will take, or null: coverage, ranks,
 * order, one shared implied value, and farm steps.
 */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((row) => row.slug));
  const missing = snapshot.watchlist.filter((slug) => !slugs.has(slug));
  if (missing.length > 0) {
    return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  }
  const ranks = board.map((row) => row.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  }
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) {
      return `row ${i + 1} outranks row ${i} on implied value`;
    }
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const row of board) {
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `${row.slug} has ${row.farm_steps.length} farm steps`;
    }
    for (const step of row.farm_steps) {
      if (step.length < 20 || step.length > 600) return `${row.slug} has a farm step of ${step.length} characters`;
    }
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd <= 0) {
      return `${row.slug} has implied value ${row.implied_value_usd}`;
    }
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
