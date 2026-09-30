-- Legacy League database. Paste this whole file into Supabase > SQL Editor > Run.
-- All reads and writes go through the app's server (service key), so every table has
-- row level security ON with no public policies: nobody can touch data directly.

create table if not exists settings (
  id int primary key default 1 check (id = 1),
  season int not null default 2026,
  cap bigint not null default 150000000,
  roster_max int not null default 13,
  min_salary bigint not null default 1000000,
  league_name text not null default 'Legacy League'
);
insert into settings (id) values (1) on conflict do nothing;

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  manager_name text,
  manager_email text unique not null,
  user_id uuid,
  is_commish boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists players (
  id text primary key,              -- ESPN athlete id
  name text not null,
  position text,
  nba_team text,                    -- abbreviation, e.g. BOS
  nba_team_id text,
  headshot text,
  injury_status text,               -- e.g. Out, Day-To-Day
  injury_note text,
  espn_salary bigint,               -- real NBA salary, for reference only
  rank int,                         -- optional ordering for the draft board
  updated_at timestamptz not null default now()
);

create table if not exists contracts (
  id uuid primary key default gen_random_uuid(),
  player_id text not null references players(id),
  team_id uuid not null references teams(id) on delete cascade,
  salary bigint not null check (salary > 0),
  years int not null check (years between 1 and 4),
  season_signed int not null,
  acquired_via text not null default 'draft',   -- draft | waiver | trade | manual
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists one_active_contract_per_player on contracts(player_id) where active;

create table if not exists rounds (
  id uuid primary key default gen_random_uuid(),
  season int not null,
  number int not null,
  status text not null default 'setup',  -- setup | open | revealed | final
  closes_at timestamptz,
  created_at timestamptz not null default now(),
  unique (season, number)
);

create table if not exists round_players (
  round_id uuid not null references rounds(id) on delete cascade,
  player_id text not null references players(id),
  primary key (round_id, player_id)
);

create table if not exists bids (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  player_id text not null references players(id),
  amount bigint not null check (amount > 0),
  years int not null check (years between 1 and 4),
  created_at timestamptz not null default now(),
  unique (round_id, team_id, player_id)
);

create table if not exists renounces (
  id uuid primary key default gen_random_uuid(),
  season int not null,
  block int not null,                -- 0: rounds 1-4, 1: rounds 5-8, 2: rounds 9-12
  team_id uuid not null references teams(id) on delete cascade,
  round_id uuid not null references rounds(id) on delete cascade,
  bid_id uuid not null references bids(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (season, block, team_id)
);

create table if not exists cap_adjustments (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  amount bigint not null,            -- negative = extra cap space (e.g. -1000000 for an Out player)
  reason text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists activity (
  id bigint generated always as identity primary key,
  kind text not null,
  message text not null,
  created_at timestamptz not null default now()
);

alter table settings enable row level security;
alter table teams enable row level security;
alter table players enable row level security;
alter table contracts enable row level security;
alter table rounds enable row level security;
alter table round_players enable row level security;
alter table bids enable row level security;
alter table renounces enable row level security;
alter table cap_adjustments enable row level security;
alter table activity enable row level security;

-- ---------- NBA games and box scores (from ESPN) ----------
create table if not exists games (
  id text primary key,               -- ESPN event id
  start timestamptz not null,        -- tipoff: lineups lock per player at this time
  state text not null,               -- pre | in | post
  final boolean not null default false,
  home_team_id text not null,
  away_team_id text not null,
  home_score int,
  away_score int,
  updated_at timestamptz not null default now()
);
create index if not exists games_start on games(start);

create table if not exists player_games (
  game_id text not null references games(id) on delete cascade,
  player_id text not null,           -- ESPN athlete id (may not be in players yet)
  nba_team_id text not null,
  played boolean not null,
  pts int not null default 0, fgm int not null default 0, fga int not null default 0,
  reb int not null default 0, ast int not null default 0, stl int not null default 0,
  blk int not null default 0, tov int not null default 0, tf int not null default 0,
  ej int not null default 0, win int not null default 0,
  fpts numeric(6,1) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (game_id, player_id)
);
create index if not exists player_games_player on player_games(player_id);

alter table games enable row level security;
alter table player_games enable row level security;

-- ---------- added Sep 30: last season's stat line per player ----------
alter table players add column if not exists last_season jsonb;

-- ---------- added Sep 30: automatic refresh ----------
-- When each part of the ESPN refresh last ran (so it never runs more often than it should).
create table if not exists sync_log (
  name text primary key,
  last_run timestamptz not null
);
alter table sync_log enable row level security;

-- The 10 minute timer (run once, in the SQL Editor):
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
-- select cron.schedule('espn-refresh', '*/10 * * * *',
--   $$ select net.http_get(url := 'https://legacy-topaz-nine.vercel.app/api/cron/espn', timeout_milliseconds := 290000) $$);
