# Token Radar — pre-token protocols ranked by implied value

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/dzaksanho11-spec/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard)
[![reward](https://make.fun/badge/token-radar-01/dzaksanho11-spec/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

A token launch radar for [make.fun](https://make.fun/bounty/token-radar-01): it reads a frozen DefiLlama snapshot of 758 protocols, ranks the ones that record no token by an implied value derived from the snapshot's own figures, and shows each one how to farm it — in a static dashboard with no network at all.

## What it does

- **Board of 198 pre-token protocols** — all 40 on the watchlist, plus every other clean pre-token protocol in the snapshot. No name is ever special-cased.
- **Implied value, model radar-3** — one function of the snapshot's own figures. Size is TVL compressed to the 0.75 power, so a token's value does not grow in step with the value its protocol secures (the snapshot's TVL spans ~550x; the 0.75 power compresses that to ~113x, so giants lead but never win by size alone). That compressed size is priced by a launch multiple of 0.05–0.50, a quality score from 7-day growth (weight 0.45, clamped to −40%…+60%, so one week's +4,448% spike can never decide the ranking), age with no token (weight 0.35, capped at 4 years), and chain breadth (weight 0.20, capped at 5 chains):
  `implied = round((TVL / 1,000,000) ^ 0.75 × 1,000,000 × (0.05 + 0.45 × quality))`
  Every row carries its full breakdown (effective TVL, each factor, quality, multiple) in `board.json` and in the detail view, so any reader can audit the number.
- **Top of the board** (snapshot 2026-11-14): Steakhouse Financial $104.6M, Sentora Curator $95.8M, Gauntlet $72.8M, Veda $67.7M, USDD $45.4M, Upshift $33.2M, Polymarket International $23.0M, CIAN Yield Layer $21.2M, RockawayX $17.0M, Nonce Capital $16.4M.
- **Clean pre-token rule** — a protocol is rankable only if it records no token and is not a wrapped, staked or bridged product of a token that already trades, not a versioned pool, and not an exchange's own product. That is the watchlist's exclusion rule, applied to the whole snapshot. Live-token protocols are set aside in their own view with their market caps.
- **Farm plans** — 9 concrete steps per protocol, each with a cost and a time, derived from its category, chains, TVL, age and 7-day change (capital $50–$250, hold 30–60 days, a second action and a second chain where it has one, and a risk step that reads the protocol's own record: a hard 7-day fall, a young listing, or a stop-loss rule).
- **Dashboard** — dark theme, sortable by implied value / TVL / growth / age / name, filterable by search, category, chain, growth direction and minimum TVL, a detail drawer for every protocol with the model's breakdown and its farm plan, and a model sandbox that re-ranks the board live when you move the size exponent or growth weight.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Node 22.18+ (24 counts), standard library only. It writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`. Open `out/dashboard/index.html` in a browser — no server, no network.

## Layout

- `main.ts` — entrypoint: reads `/input/snapshot.json`, writes the board, data and dossier
- `lib/model.ts` — model radar-3, the board builder and the farm plans
- `vendor/makefun-board.ts` — make.fun's dossier library, byte-for-byte from the kit
- `dashboard/` — `index.html`, `app.css`, `app.js` (static, no network)
- `screenshots/` — `1-board.png`, `2-detail.png`, `3-filtered.png`

## Honesty notes

- A protocol is described as recording no token when the snapshot carries no token for it — that is not proof it has none.
- Implied value is this radar's own claim, never make.fun's, and never a prediction of whether or when a token is issued.
