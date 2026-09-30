# Legacy League

Our own fantasy basketball app: rosters, $150m hard cap, contracts, sealed bid draft, renounce rights.

- `src/lib/rules.ts` holds every league rule (bids, cap, ties, contract slots, lottery, scoring). Tests: `npm test`.
- `supabase/schema.sql` creates the database.
- `src/app/draft` is draft night, `src/app/commish` is the commissioner panel.
- Player data comes from ESPN's free public feed (`src/lib/espn.ts`).

Setup steps are in SETUP.md.
