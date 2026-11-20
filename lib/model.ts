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
// The value model, "radar-3", prices a protocol in two steps.
//
//   1. Size, compressed. A token's value does not grow in step with the
//      value its protocol secures: doubling TVL does not double what a
//      token is worth. So the size that is priced is not TVL itself but
//      TVL raised to the 0.75 power, in millions of dollars:
//
//        effective_tvl = (tvl_usd / 1,000,000) ^ 0.75 x 1,000,000
//
//      The snapshot's TVL spans about 550x from the smallest rankable
//      protocol to the largest; the 0.75 power compresses that to about
//      113x. Giants still lead — they secure the most value — but a
//      giant no longer wins by size alone: momentum and track record
//      can decide any close call.
//
//   2. A launch multiple. The token is worth a fraction of that
//      compressed size, and the fraction is a quality score built from
//      the snapshot's own figures, never from a name:
//
//        quality = 0.45 x growth_norm + 0.35 x age_norm + 0.20 x breadth_norm
//        multiple = 0.05 + 0.45 x quality          (0.05 .. 0.50)
//        implied  = max(1, round(effective_tvl x multiple))
//
//      growth_norm is the seven-day change, clamped to -40% .. +60% and
//      rescaled to 0 .. 1. One week in crypto can print +4,448% — one
//      protocol in this snapshot does — and a single week must never be
//      allowed to decide the ranking; the clamp is the guard. Growth
//      carries the largest weight (0.45) because it is the strongest
//      forward signal: it says where the TVL is heading. A protocol
//      with no reported seven-day change is scored at 0%, neutral.
//
//      age_norm is the days since the protocol was first listed,
//      capped at 1,460 days (four years), rescaled to 0 .. 1. Four years
//      of running with no token is the longest track record that
//      matters; older protocols stop gaining. A missing listing date
//      counts as 180 days, stated, not hidden. Age carries 0.35: a
//      protocol that has survived is a steadier bet than one listed
//      last month.
//
//      breadth_norm is the chain count, capped at five, rescaled to
//      0 .. 1. Each extra chain up to five widens the user base a token
//      could serve; the sixth chain adds nothing. Breadth carries 0.20:
//      reach helps, but it is the weakest of the three signals.
//
//      The multiple's floor (0.05) and ceiling (0.50) are the radar's
//      own calibration: a token at launch is worth a small fraction of
//      the value its protocol secures, and even the strongest record
//      never prices it above half. The numbers are this entry's claim,
//      never a prediction of whether or when a token is issued.
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
 *  sandbox lets a reader change the size exponent and the growth weight
 *  and watch the board move. */
export interface ModelConstants {
  size_exponent: number;
  size_unit: number;
  multiple_floor: number;
  multiple_range: number;
  growth_weight: number;
  age_weight: number;
  breadth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_chains: number;
}

export const MODEL: ModelConstants = {
  size_exponent: 0.75,
  size_unit: 1_000_000,
  multiple_floor: 0.05,
  multiple_range: 0.45,
  growth_weight: 0.45,
  age_weight: 0.35,
  breadth_weight: 0.2,
  growth_floor: -40,
  growth_cap: 60,
  maturity_days: 1460,
  unknown_age_days: 180,
  breadth_chains: 5,
};

/** The model's version label, shown by the dashboard. */
export const MODEL_VERSION = 'radar-3';

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
    size_exponent: number;
    effective_tvl_usd: number;
    growth_pct: number;
    growth_norm: number;
    age_norm: number;
    breadth_norm: number;
    quality: number;
    multiple: number;
    age_days: number | null;
  };
  model_breakdown: string;
  farm_steps: string[];
}

/** A board row in the compact form data.js carries; the page reads the
 *  farm plan from these fields, it is not derived twice. */
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
  effective_tvl_usd: number;
  growth_pct: number;
  growth_norm: number;
  age_norm: number;
  breadth_norm: number;
  quality: number;
  multiple: number;
  model_breakdown: string;
  farm_steps: string[];
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

/** Round to four decimal places, for the factors the board reports. */
function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/** A dollar figure in millions with one decimal, for the breakdown line. */
function millions(n: number): string {
  return `$${(n / 1_000_000).toFixed(1)}M`;
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

/** The model's score for one protocol: every factor, and the implied value. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
): {
  implied: number;
  effectiveTvl: number;
  growthPct: number;
  growthNorm: number;
  ageNorm: number;
  breadthNorm: number;
  quality: number;
  multiple: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const effectiveTvl = Math.pow(protocol.tvl_usd / model.size_unit, model.size_exponent) * model.size_unit;
  const growthPct = clamp(finiteNumber(protocol.change_7d, 0), model.growth_floor, model.growth_cap);
  const growthNorm = (growthPct - model.growth_floor) / (model.growth_cap - model.growth_floor);
  const ageForModel = age ?? model.unknown_age_days;
  const ageNorm = clamp(ageForModel, 0, model.maturity_days) / model.maturity_days;
  const breadthNorm = Math.min(protocol.chains.length, model.breadth_chains) / model.breadth_chains;
  const quality =
    model.growth_weight * growthNorm + model.age_weight * ageNorm + model.breadth_weight * breadthNorm;
  const multiple = model.multiple_floor + model.multiple_range * quality;
  const implied = Math.max(1, Math.round(effectiveTvl * multiple));
  return { implied, effectiveTvl, growthPct, growthNorm, ageNorm, breadthNorm, quality, multiple, age };
}

/** One row's model as a line a reader can audit without the code. */
export function modelBreakdown(
  protocol: SnapshotProtocol,
  scored: ReturnType<typeof impliedValue>,
): string {
  const growthShown = `${scored.growthPct > 0 ? '+' : ''}${scored.growthPct.toFixed(1)}%`;
  const ageShown = scored.age === null ? 'unknown (180d used)' : `${scored.age}d`;
  return (
    `eff. TVL ${millions(scored.effectiveTvl)} x multiple ${scored.multiple.toFixed(3)} = ${millions(scored.implied)} ` +
    `(growth ${scored.growthNorm.toFixed(3)} at ${growthShown}, age ${scored.ageNorm.toFixed(3)} at ${ageShown}, ` +
    `breadth ${scored.breadthNorm.toFixed(3)} on ${protocol.chains.length} chain${protocol.chains.length === 1 ? '' : 's'} -> quality ${scored.quality.toFixed(3)})`
  );
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

/**
 * The category's one qualifying action, in words a farmer can follow.
 * The branches are checked most specific first: "Indexes" contains
 * "dex", and a CDP is not a lending pool, so the order is the logic.
 */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const category = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (category.includes('cdp') || category.includes('collateral')) {
    return `Deposit $${capital} of collateral into ${name} on ${chain} and mint half that value in its stable asset.`;
  }
  if (category.includes('index')) {
    return `Buy $${capital} of ${name}'s index token on ${chain} and hold the basket.`;
  }
  if (category.includes('lend')) {
    return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  }
  if (category.includes('dex')) {
    return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  }
  if (category.includes('liquidity manager')) {
    return `Deposit $${capital} into a ${name} managed liquidity position on ${chain} and let it rebalance.`;
  }
  if (category.includes('yield aggregator') || category.includes('yield') || category.includes('leveraged farm') || category.includes('farm')) {
    return `Deposit $${capital} into ${name}'s highest-TVL vault on ${chain} and let the strategy run.`;
  }
  if (category.includes('curator') || category.includes('allocator') || category.includes('onchain capital')) {
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  }
  if (category.includes('derivative') || category.includes('basis trading') || category.includes('perpetual')) {
    return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge on ${chain}.`;
  }
  if (category.includes('rwa')) {
    return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it.`;
  }
  if (category.includes('prediction')) {
    return `Fund $${capital} and place one market position on ${name} on ${chain}.`;
  }
  if (category.includes('staking') || category.includes('restak')) {
    return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token.`;
  }
  if (category.includes('stable')) {
    return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  }
  if (category.includes('bridge') || category.includes('cross chain')) {
    return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  }
  if (category.includes('chain')) {
    return `Bridge $${capital} onto ${name} and make one transaction in its native app each week.`;
  }
  if (category.includes('insurance')) {
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  }
  if (category.includes('payment') || category.includes('crypto card')) {
    return `Pay $${capital} through ${name} on ${chain} and keep the receipt for the farm log.`;
  }
  if (category.includes('otc')) {
    return `Place a $${capital} buy order through ${name}'s OTC desk on ${chain} and settle it in full.`;
  }
  if (category.includes('governance')) {
    return `Delegate $${capital} of voting power through ${name} on ${chain} and vote in its next proposal.`;
  }
  if (category.includes('launchpad')) {
    return `Commit $${capital} to a ${name} launch allocation on ${chain} and hold the allocation.`;
  }
  if (category.includes('token locker')) {
    return `Lock $${capital} of tokens in ${name} on ${chain} for the vesting window it publishes.`;
  }
  if (category.includes('anchor btc') || category.includes('decentralized btc')) {
    return `Mint $${capital} of the BTC-backed asset through ${name} on ${chain} and hold it.`;
  }
  if (category.includes('cedefi')) {
    return `Deposit $${capital} into ${name}'s CeDeFi vault on ${chain} and keep the shares.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A second, different qualifying action, so the plan is not one action repeated. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const category = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (category.includes('cdp') || category.includes('collateral')) {
    return `Repay a quarter of the minted stable asset on ${name}, then mint it again the same week to show repeated use.`;
  }
  if (category.includes('index')) {
    return `Sell a tenth of the index position on ${name} and buy it back the next week to keep the holding active.`;
  }
  if (category.includes('lend')) {
    return `Borrow a small amount against the supplied collateral on ${name}, then repay it the same week.`;
  }
  if (category.includes('dex') || category.includes('liquidity manager')) {
    return `Swap $${Math.max(10, Math.round(capital / 5))} of USDC for another asset inside ${name} on ${chain}.`;
  }
  if (category.includes('yield aggregator') || category.includes('yield') || category.includes('leveraged farm') || category.includes('farm')) {
    return `Harvest or compound the vault yield on ${name} once a week instead of letting it sit.`;
  }
  if (category.includes('curator') || category.includes('allocator') || category.includes('onchain capital')) {
    return `Move $${Math.max(10, Math.round(capital / 2))} into a second ${name} vault on ${chain} to spread the position.`;
  }
  if (category.includes('derivative') || category.includes('basis trading') || category.includes('perpetual')) {
    return `Close the hedge on ${name} after one week and open a fresh one half the size.`;
  }
  if (category.includes('rwa') || category.includes('stable')) {
    return `Hold the minted asset for a full week, then check its redemption page before adding more.`;
  }
  if (category.includes('prediction')) {
    return `Settle one market on ${name} and open a second one on a different outcome.`;
  }
  if (category.includes('staking') || category.includes('restak')) {
    return `Restake the receipt token ${name} issued, if its app offers it, and keep the new receipt.`;
  }
  if (category.includes('bridge') || category.includes('cross chain')) {
    return `Bridge a small test amount back through ${name} to confirm the route works both ways.`;
  }
  if (category.includes('chain')) {
    return `Use a second native app on ${name} in the same week, so the activity is not a single transaction.`;
  }
  if (category.includes('insurance')) {
    return `Extend the cover on ${name} before it lapses, rather than letting it expire.`;
  }
  if (category.includes('payment') || category.includes('crypto card')) {
    return `Make a second payment through ${name} in a different week, for a different amount.`;
  }
  if (category.includes('launchpad') || category.includes('token locker')) {
    return `Check the allocation or lock on ${name} each week and record its status in the farm log.`;
  }
  if (category.includes('anchor btc') || category.includes('decentralized btc')) {
    return `Redeem a small test amount of the BTC-backed asset on ${name} to confirm the peg holds.`;
  }
  return `Vote in ${name}'s governance or community poll if one is open, or complete one quest the protocol publishes.`;
}

/**
 * The risk step: it reads the protocol's own record. A protocol whose
 * TVL fell hard in seven days gets a warning before more capital; a
 * young protocol gets a size warning; anything else gets a stop-loss
 * rule, so the plan never pretends farming is risk-free.
 */
function riskStepFor(p: SnapshotProtocol, capital: number, age: number | null): FarmStep {
  const change = p.change_7d;
  if (change !== null && change <= -10) {
    return {
      text: `TVL fell ${Math.abs(change).toFixed(1)}% in the last 7 days: open ${p.name}'s own page, find the cause, and add no more capital until the fall stops.`,
      cost: 'nothing to check',
      time: '10 minutes',
    };
  }
  if (age !== null && age < 180) {
    return {
      text: `${p.name} has only ${age} days on record: keep the position at $${capital} and add nothing until it has run a full quarter.`,
      cost: `the $${capital} stays in the position`,
      time: '5 minutes',
    };
  }
  return {
    text: `Set a stop before you continue: if the position's value falls 20% from entry, unwind it on ${p.name} and log the exit.`,
    cost: 'nothing until the stop triggers',
    time: '5 minutes',
  };
}

/** One step as a single string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let text = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (text.length > 600) text = `${text.slice(0, 596)}...`;
  if (text.length < 20) text = `${text} Hold the position and check the protocol's own page.`;
  return text;
}

/**
 * A protocol's farm plan: nine steps, each an action with a cost and a
 * time. The plan is derived from the protocol's own record (category,
 * chains, TVL, age, seven-day change), never from a hand-written list
 * of names.
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
    riskStepFor(p, capital, age),
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
    const value = impliedValue(p, snapshot.as_of, model);
    return { protocol: p, value };
  });
  scored.sort(
    (a, b) => b.value.implied - a.value.implied || (a.protocol.slug < b.protocol.slug ? -1 : a.protocol.slug > b.protocol.slug ? 1 : 0),
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
    age_days: s.value.age,
    implied_value_usd: s.value.implied,
    model: {
      size_exponent: model.size_exponent,
      effective_tvl_usd: Math.round(s.value.effectiveTvl),
      growth_pct: s.value.growthPct,
      growth_norm: round4(s.value.growthNorm),
      age_norm: round4(s.value.ageNorm),
      breadth_norm: round4(s.value.breadthNorm),
      quality: round4(s.value.quality),
      multiple: round4(s.value.multiple),
      age_days: s.value.age,
    },
    model_breakdown: modelBreakdown(s.protocol, s.value),
    farm_steps: farmSteps(s.protocol, s.value.age).map(stepText),
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

/** A board row's compact form for data.js, with the farm plan carried whole. */
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
    effective_tvl_usd: row.model.effective_tvl_usd,
    growth_pct: row.model.growth_pct,
    growth_norm: row.model.growth_norm,
    age_norm: row.model.age_norm,
    breadth_norm: row.model.breadth_norm,
    quality: row.model.quality,
    multiple: row.model.multiple,
    model_breakdown: row.model_breakdown,
    farm_steps: row.farm_steps,
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
