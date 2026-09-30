-- Lineups and head to head matchups (Sep 30). Adds only; changes nothing that exists.
-- Run this once in Supabase > SQL Editor BEFORE merging the tabs-rework branch:
-- box score syncing starts writing player_games.min as soon as that code is live.

alter table player_games add column if not exists min int not null default 0;

-- A team's lineup as saved on a given day (US Eastern). A day with no rows uses the latest earlier save.
create table if not exists lineups (
  team_id uuid not null references teams(id) on delete cascade,
  day date not null,
  slot text not null,                -- PG SG SF PF C G F UTIL1-3 BE1-3 IR
  player_id text not null references players(id),
  primary key (team_id, day, slot)
);

-- One row per game in a scoring week. Starters' fantasy points from starts to ends (inclusive) count.
create table if not exists matchups (
  id uuid primary key default gen_random_uuid(),
  season int not null,
  week int not null,
  starts date not null,
  ends date not null,
  home_team_id uuid not null references teams(id) on delete cascade,
  away_team_id uuid not null references teams(id) on delete cascade
);
create index if not exists matchups_week on matchups(season, week);

alter table lineups enable row level security;
alter table matchups enable row level security;
