-- Watch list: the players a GM keeps an eye on. The flag on a player's page adds or removes him; the flag chip on
-- the Players page lists them. One row per team and player.
create table if not exists watchlist (
  team_id uuid not null references teams(id) on delete cascade,
  player_id text not null references players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, player_id)
);
alter table watchlist enable row level security;
