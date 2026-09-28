# gold-dashboard — project context

Personal trading journal / dashboard for Lukhanyo, built while learning full-stack
engineering, eventually feeding into a company (Gold Holdings, domain
goldholdings.co.za registered via Afrihost, not yet deployed anywhere). This file
briefs any fresh Claude/Claude Code session on decisions and fixes already made so
they don't get re-litigated or re-broken.

## Stack

- **Backend**: Express + TypeScript, MongoDB (Mongoose), Redis (live gold price
  feed), JWT auth (bcrypt), Docker + docker-compose. Entry: `backend/src/server.ts`.
- **Frontend**: React + Vite + TypeScript, MUI. Entry: `frontend/src/App.tsx`.
- Broker: XM Global (MT5, account 340581635, Hedge mode — multiple simultaneous
  positions per symbol are possible, not just one open position at a time).

## Product decisions already made (don't relitigate without asking)

- **Single-user tool, on purpose.** `Account`/`Trade`/`Withdrawal` are a global
  singleton — not scoped per user — even though `User`/JWT auth exists. This was a
  deliberate choice: the app is private to Lukhanyo until the company clears
  ~$10k/month, at which point it becomes worth doing the real multi-tenant rewrite
  (add `userId` to Account/Trade/Withdrawal, filter every query by it). Until then,
  the public `/api/auth/register` endpoint should be locked down or removed —
  anyone who registers currently gets full access to the one shared account.
- **GOLD-only.** All P&L math (`(close − entry) × lotSize × 100`) assumes gold's
  100oz/lot contract. Verified exact against the broker's own reported Profit for
  GOLD trades. It is **not correct** for other instruments — this account also
  trades ETHUSD, XRPUSD, EURUSD, and those must never be run through this formula.
  The import parser filters to GOLD/XAUUSD only and reports everything else as
  skipped, on purpose — don't "fix" that by widening it without also fixing the
  P&L math for other contract sizes.
- **Tax bracket table (`taxCalculator.ts`) is SARS *individual* income tax**, not
  corporate tax or CGT. Whether trading profit run through the company should use
  individual brackets, the flat 27% corporate rate, or capital gains treatment is
  an open question for an actual accountant — don't assume the current table is
  correct once the company (not Lukhanyo personally) is the entity trading.

## MT5 broker report import (`backend/src/services/tradesIO.ts`)

The XM "Trade History Report" xlsx export has multiple sections in one sheet:
`Positions`, `Orders`, `Deals`, `Working Orders`, `Results`. Import logic:

- **Deals section is preferred and used when present.** It's the complete raw fill
  ledger since account opening; `Positions` (in this broker's export) only lists
  recently-closed positions, so Deals is the source for a full-history import.
  Both sections are never combined — that would double-count overlapping trades.
- Deals has no position ID, so closed trades are reconstructed with **FIFO
  volume-aware lot matching** (`parseMT5Deals`): an "in" deal opens exposure, a
  later "out" deal of the opposite Type closes it, splitting either leg as needed
  when volumes don't match 1:1 (common on this hedge account). This pairing is a
  best-effort inference, not ground truth from the broker — flagged in code
  comments.
- **Profit is taken directly from the broker's own reported number** (allocated
  proportionally across split lots), not recomputed from entry/close prices. This
  was a deliberate fix: recomputing drifted ~$6.50 across ~80 trades due to
  matching-order ambiguity; using the broker's actual Profit reconciles exactly.
  See `ImportedTrade.profit` and the `t.profit != null` branch in
  `routes/trades.ts` POST `/import`.
- Deals-derived trades have **no Stop Loss / Take Profit** (Deals doesn't carry
  them) — their R-multiple will show as roughly ±1, not a real risk ratio. This is
  a data-availability limit of the report format, not fixable after the fact.
- Import supports an optional **`since` date cutoff** (multipart field `since`,
  wired through `parseTradesAuto(buf, name, sinceDate)`), surfaced in the Journal
  page as an "Import from" date field. Used to exclude older history from an
  import without needing a separate file.

## Known open items (not yet fixed)

- **No duplicate-import protection.** Re-uploading the same report twice will
  insert the same trades again — nothing checks for an existing matching trade
  before inserting. Needs a dedupe check (e.g. matching open time + entry +
  direction + lotSize) before `Trade.create` in the import loop.
- **Balance baseline mismatch.** `Account.startingBalance` defaults to 285 and
  imports cascade the balance from whatever `currentBalance` is *currently*
  stored, not from a real historical starting point — so an imported balance
  curve won't match the real broker equity ($1,080.69 as of Sept 2026) unless the
  account's starting balance is deliberately set to match reality first.
- Error responses leak `(err as Error).message` to the client in `routes/trades.ts`
  and elsewhere — fine for local dev, should be genericized with server-side
  logging before this is ever public.
- No rate limiting on `/api/auth/login` or `/register`.
- CORS is hardcoded to `http://localhost:5173` — needs an env var once deployed
  to goldholdings.co.za.
- `.env.example` files in both `frontend/` and `backend/` still have leftover
  PowerShell heredoc syntax from how they were originally created — cosmetic,
  worth cleaning up.

## Working setup

- Windows machine, VS Code, dev servers via `npm run dev` in `backend/` and
  `frontend/` separately.
- Local files use CRLF line endings — preserve that when editing directly rather
  than introducing mixed line endings.
