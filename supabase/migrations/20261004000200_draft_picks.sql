-- Rookie draft picks: each team has one pick in each draft, and picks can be traded.
create table if not exists draft_picks (
  id uuid primary key default gen_random_uuid(),
  year int not null,                                                    -- the draft's year (held before that season)
  original_team uuid not null references teams(id) on delete cascade,   -- whose pick it is to begin with
  team_id uuid not null references teams(id) on delete cascade,         -- who holds it now
  unique (year, original_team)
);
create index if not exists draft_picks_holder on draft_picks(team_id);
alter table draft_picks enable row level security;

-- Give every team its own pick in each of p_years drafts from p_first on. Safe to run again: only missing picks
-- are added (a team that just joined, a new season).
create or replace function draft_picks_fill(p_first int, p_years int) returns void
language sql set search_path = public, pg_temp as $$
  insert into draft_picks (year, original_team, team_id)
  select y, t.id, t.id from teams t cross join generate_series(p_first, p_first + p_years - 1) y
  on conflict (year, original_team) do nothing
$$;
revoke execute on function draft_picks_fill(int, int) from public, anon, authenticated;

-- A trade offer can carry picks next to contracts.
alter table trade_offers add column if not exists give_picks uuid[] not null default '{}';  -- picks from_team sends
alter table trade_offers add column if not exists get_picks uuid[] not null default '{}';   -- picks to_team sends

-- The moves log records a pick changing hands: kind 'pick', no player on the row.
alter table transactions alter column player_id drop not null;
alter table transactions add column if not exists pick_id uuid references draft_picks(id) on delete cascade;
alter table transactions drop constraint if exists transactions_kind_check;
alter table transactions add constraint transactions_kind_check check (kind in ('sign', 'release', 'trade', 'pick'));

-- Accept: lock the offer, check the picks are still held by the right teams, swap the contracts (roster_trade
-- checks those), swap the picks and log them in the same group, close the offer.
create or replace function trade_offer_accept(p_offer uuid, p_season int) returns void
language plpgsql set search_path = public, pg_temp as $$
declare o trade_offers; g uuid; n int; r draft_picks;
begin
  select * into o from trade_offers where id = p_offer for update;
  if o.id is null or o.status <> 'pending' then raise exception 'This offer is no longer open.'; end if;
  select count(*) into n from draft_picks
    where (id = any(o.give_picks) and team_id = o.from_team) or (id = any(o.get_picks) and team_id = o.to_team);
  if n <> coalesce(array_length(o.give_picks, 1), 0) + coalesce(array_length(o.get_picks, 1), 0) then
    raise exception 'Some of those draft picks have changed hands.';
  end if;
  g := roster_trade(o.from_team, o.to_team, o.give, o.get, p_season, 'Trade offer accepted');
  for r in update draft_picks set team_id = case when team_id = o.from_team then o.to_team else o.from_team end
      where id = any(o.give_picks) or id = any(o.get_picks) returning * loop
    insert into transactions (season, kind, team_id, other_team_id, pick_id, group_id, note)
      values (p_season, 'pick', r.team_id, case when r.team_id = o.from_team then o.to_team else o.from_team end, r.id, g, 'Trade offer accepted');
  end loop;
  update trade_offers set status = 'accepted', decided_at = now() where id = p_offer;
end $$;
revoke execute on function trade_offer_accept(uuid, int) from public, anon, authenticated;
