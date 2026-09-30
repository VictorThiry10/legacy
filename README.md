# Legacy League

Our own fantasy basketball app: rosters, $150m hard cap, contracts, head to head weeks, renounce rights.

Tabs: Home (current matchup + standings), Team (ESPN style lineup), Players, Matchup, League.
The commissioner also gets Settings: League (rules, scoring), Rosters (sign, release, trade), Schedule.

## Code map (`src/lib`)
Pure rules (no database, unit tested with `npm test`):
- `rules.ts` cap, roster and contract-slot checks, scoring, draft bidding, lottery
- `lineup.ts` lineup slots and who can play where · `schedule.ts` round robin weeks · `dates.ts` US Eastern days

Database (server only):
- `supabase/server.ts` clients · `supabase/types.ts` generated table types · `db.ts` paging, errors, database functions
- `auth.ts` who is signed in, team and commissioner checks
- `league.ts` settings and team cap summaries
- `roster.ts` rosters and every roster move (checked, logged in `transactions`)
- `lineup-store.ts` saved lineups · `season.ts` matchups, frozen daily lineup points, scores, standings
- `nba.ts` games and box scores · `espn.ts` + `espn-parse.ts` the ESPN feed and the 10 minute refresh

## Database
One Supabase project. Changes live in `supabase/migrations`, applied in filename order; never edit an applied file,
add a new one. After a migration, regenerate `src/lib/supabase/types.ts`. Writes that touch several rows go through
database functions so they happen all at once.

Setup steps are in SETUP.md.
