# Token Radar — pre-token protocols ranked by implied value

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/dzaksanho11-spec/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard)
[![reward](https://make.fun/badge/token-radar-01/dzaksanho11-spec/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

A token launch radar for [make.fun](https://make.fun/bounty/token-radar-01): it reads a frozen DefiLlama snapshot of 758 protocols, ranks the ones that record no token by an implied value derived from the snapshot's own figures, and shows each one how to farm it — in a static dashboard with no network at all.

## What it does

- **Board of 198 pre-token protocols** — all 40 on the watchlist, plus every other clean pre-token protocol in the snapshot. No name is ever special-cased.
- **Implied value, model radar-2** — one function of TVL, 7-day growth (clamped to −50%…+80%, so one week's +4,448% spike can never decide the ranking), age with no token, and chain breadth:
  `implied = round(TVL × 0.25 × growth × maturity × breadth)`
- **Clean pre-token rule** — a protocol is rankable only if it records no token and is not a wrapped, staked or bridged product of a token that already trades, not a versioned pool, and not an exchange's own product. That is the watchlist's exclusion rule, applied to the whole snapshot. Live-token protocols are set aside in their own view with their market caps.
- **Farm plans** — 8 concrete steps per protocol, each with a cost and a time, derived from its category, chains, TVL and age (capital $50–$250, hold 30–60 days, a second action and a second chain where it has one).
- **Dashboard** — dark theme, sortable by implied value / TVL / growth / age / name, filterable by search, category, chain, growth direction and minimum TVL, a detail drawer for every protocol with the model's breakdown and its farm plan, and a model sandbox that re-ranks the board live when you move the base multiple or growth weight.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Node 22.18+ (24 counts), standard library only. It writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`. Open `out/dashboard/index.html` in a browser — no server, no network.

## Layout

- `main.ts` — entrypoint: reads `/input/snapshot.json`, writes the board, data and dossier
- `lib/model.ts` — model radar-2, the board builder and the farm plans
- `vendor/makefun-board.ts` — make.fun's dossier library, byte-for-byte from the kit
- `dashboard/` — `index.html`, `app.css`, `app.js` (static, no network)
- `screenshots/` — `1-board.png`, `2-detail.png`, `3-filtered.png`

## Honesty notes

- A protocol is described as recording no token when the snapshot carries no token for it — that is not proof it has none.
- Implied value is this radar's own claim, never make.fun's, and never a prediction of whether or when a token is issued.
