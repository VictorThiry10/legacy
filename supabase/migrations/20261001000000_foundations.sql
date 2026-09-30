-- Foundations: league rules in the database, a log of roster moves, frozen daily lineups with points,
-- and one-step database functions for every write that touches more than one row.

-- League rules that used to live in code.
alter table settings add column if not exists league_size int not null default 8 check (league_size between 2 and 20);
alter table settings add column if not exists scoring jsonb not null default
  '{"pts":1,"fgm":1,"fgmi":-1,"reb":1,"ast":1.5,"stl":2.5,"blk":2.5,"to":-1.5,"tf":-1,"ej":-2,"win":1}';

-- Every roster move, in order. Contracts hold the current state; this is the history.
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  season int not null,
  kind text not null check (kind in ('sign', 'release', 'trade')),
  team_id uuid not null references teams(id) on delete cascade,        -- team the player joins (sign, trade) or leaves (release)
  other_team_id uuid references teams(id) on delete set null,          -- trade: the team the player left
  player_id text not null references players(id),
  contract_id uuid references contracts(id) on delete set null,
  salary bigint,
  years int,
  group_id uuid,                                                        -- all rows of one trade share it
  note text,
  created_at timestamptz not null default now()
);
create index if not exists transactions_recent on transactions(created_at desc);
alter table transactions enable row level security;

-- Each team's lineup as it stood each day, with the fantasy points each player scored that day.
create table if not exists lineup_points (
  team_id uuid not null references teams(id) on delete cascade,
  day date not null,
  slot text not null,
  player_id text not null references players(id),
  fpts numeric(7,1) not null default 0,
  games int not null default 0,
  primary key (team_id, day, slot)
);
create index if not exists lineup_points_day on lineup_points(day);
alter table lineup_points enable row level security;

-- Starters' points per team per day (bench and IR don't count).
create or replace view team_day_points with (security_invoker = true) as
  select team_id, day, coalesce(sum(fpts) filter (where slot not like 'BE%' and slot <> 'IR'), 0) as pts
  from lineup_points group by team_id, day;

-- ---------- functions (server only) ----------
create or replace function roster_sign(p_team uuid, p_player text, p_salary bigint, p_years int, p_season_signed int,
  p_season int, p_via text, p_note text) returns uuid language plpgsql set search_path = public, pg_temp as $$
declare c uuid;
begin
  insert into contracts (player_id, team_id, salary, years, season_signed, acquired_via)
    values (p_player, p_team, p_salary, p_years, p_season_signed, p_via) returning id into c;
  insert into transactions (season, kind, team_id, player_id, contract_id, salary, years, note)
    values (p_season, 'sign', p_team, p_player, c, p_salary, p_years, p_note);
  return c;
end $$;

create or replace function roster_release(p_contract uuid, p_season int, p_note text) returns void
language plpgsql set search_path = public, pg_temp as $$
declare r contracts;
begin
  update contracts set active = false where id = p_contract and active returning * into r;
  if r.id is null then raise exception 'That contract is not active.'; end if;
  insert into transactions (season, kind, team_id, player_id, contract_id, salary, years, note)
    values (p_season, 'release', r.team_id, r.player_id, r.id, r.salary, r.years, p_note);
end $$;

-- Swap contracts between two teams in one step.
create or replace function roster_trade(p_team_a uuid, p_team_b uuid, p_from_a uuid[], p_from_b uuid[], p_season int, p_note text)
returns uuid language plpgsql set search_path = public, pg_temp as $$
declare g uuid := gen_random_uuid(); r contracts; n int;
begin
  select count(*) into n from contracts where active and ((id = any(p_from_a) and team_id = p_team_a) or (id = any(p_from_b) and team_id = p_team_b));
  if n <> coalesce(array_length(p_from_a, 1), 0) + coalesce(array_length(p_from_b, 1), 0) then
    raise exception 'Some of those contracts are not on the right team anymore.';
  end if;
  for r in update contracts set team_id = case when team_id = p_team_a then p_team_b else p_team_a end
      where id = any(p_from_a) or id = any(p_from_b) returning * loop
    insert into transactions (season, kind, team_id, other_team_id, player_id, contract_id, salary, years, group_id, note)
      values (p_season, 'trade', r.team_id, case when r.team_id = p_team_a then p_team_b else p_team_a end,
              r.player_id, r.id, r.salary, r.years, g, p_note);
  end loop;
  return g;
end $$;

-- Replace a team's saved lineup for one day in one step.
create or replace function save_lineup(p_team uuid, p_day date, p_rows jsonb) returns void
language plpgsql set search_path = public, pg_temp as $$
begin
  delete from lineups where team_id = p_team and day = p_day;
  insert into lineups (team_id, day, slot, player_id)
    select p_team, p_day, r->>'slot', r->>'player_id' from jsonb_array_elements(p_rows) r;
end $$;

-- Each lineup slot's points = that player's box scores from games on that US Eastern day (0 if none).
-- (Replaced in 20261001000200_fix_score_lineup_points with this final version.)
create or replace function score_lineup_points(p_from date, p_to date) returns void language sql
set search_path = public, pg_temp as $$
  update lineup_points lp set (fpts, games) = (
    select coalesce(sum(pg.fpts), 0), count(*)::int
    from player_games pg join games g on g.id = pg.game_id
    where pg.player_id = lp.player_id and pg.played and (g.start at time zone 'America/New_York')::date = lp.day
  )
  where lp.day between p_from and p_to;
$$;

-- Freeze every team's lineup for one day (rows: [{team_id, slot, player_id}]) and score it.
create or replace function snapshot_lineups(p_day date, p_rows jsonb) returns void
language plpgsql set search_path = public, pg_temp as $$
begin
  delete from lineup_points where day = p_day;
  insert into lineup_points (team_id, day, slot, player_id)
    select (r->>'team_id')::uuid, p_day, r->>'slot', r->>'player_id' from jsonb_array_elements(p_rows) r;
  perform score_lineup_points(p_day, p_day);
end $$;

-- New scoring weights: recompute every stored box score line, then every lineup day.
create or replace function rescore_all(w jsonb) returns void language plpgsql set search_path = public, pg_temp as $$
begin
  update player_games set fpts = case when played then round((
      pts * (w->>'pts')::numeric + fgm * (w->>'fgm')::numeric + (fga - fgm) * (w->>'fgmi')::numeric
    + reb * (w->>'reb')::numeric + ast * (w->>'ast')::numeric + stl * (w->>'stl')::numeric
    + blk * (w->>'blk')::numeric + tov * (w->>'to')::numeric + tf * (w->>'tf')::numeric
    + ej * (w->>'ej')::numeric + win * (w->>'win')::numeric), 1) else 0 end;
  perform score_lineup_points('1900-01-01', '2999-12-31');
end $$;

-- Only the server (service role) may call these.
do $$ declare f text; begin
  foreach f in array array['roster_sign(uuid,text,bigint,int,int,int,text,text)', 'roster_release(uuid,int,text)',
    'roster_trade(uuid,uuid,uuid[],uuid[],int,text)', 'save_lineup(uuid,date,jsonb)', 'snapshot_lineups(date,jsonb)',
    'score_lineup_points(date,date)', 'rescore_all(jsonb)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;
