# Legacy League

Our own fantasy basketball app: rosters, $150m hard cap, contracts, sealed bid draft, renounce rights.

- `src/lib/rules.ts` holds every league rule (bids, cap, ties, contract slots, lottery, scoring). Tests: `npm test`.
- `supabase/schema.sql` creates the database.
- Tabs: Home (current matchup + standings), Team (ESPN style lineup, `src/components/TeamView.tsx`), Players, Matchup, League.
- `src/lib/lineup.ts` holds lineup slots and eligibility; `src/lib/fantasy.ts` loads lineups, box scores and scores matchups.
- Player data comes from ESPN's free public feed (`src/lib/espn.ts`).

Setup steps are in SETUP.md.
