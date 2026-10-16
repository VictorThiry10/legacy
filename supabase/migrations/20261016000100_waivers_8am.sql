-- Waivers clear at 8:00 London (Victor, 2026-10-16). A dropped player stays on waivers for settings.waiver_hours
-- (now 24) and then until the next 8:00 London. When the auction's last chance round signs, every free agent goes
-- on waivers until the next 8:00 London (Tuesday 20 Oct 2026): sealed bids only, no first come first served. Once
-- that clears, whoever is unclaimed is a normal free agent.

alter table settings alter column waiver_hours set default 24;
update settings set waiver_hours = 24 where id = 1;

-- The first 8:00 London at or after p_from + p_hours (London time, so the clocks changing is taken care of).
create or replace function waiver_closes_at(p_from timestamptz, p_hours int) returns timestamptz
language plpgsql stable set search_path = public, pg_temp as $$
declare earliest timestamptz := p_from + make_interval(hours => coalesce(p_hours, 0)); d date; t timestamptz;
begin
  d := (earliest at time zone 'Europe/London')::date;
  t := (d + time '08:00') at time zone 'Europe/London';
  if t < earliest then t := (d + 1 + time '08:00') at time zone 'Europe/London'; end if;
  return t;
end $$;

-- Releasing a player puts him on waivers until the 8:00 after his waiver_hours.
create or replace function roster_release(p_contract uuid, p_season int, p_note text) returns void
language plpgsql set search_path = public, pg_temp as $$
declare r contracts; h int;
begin
  update contracts set active = false where id = p_contract and active returning * into r;
  if r.id is null then raise exception 'That contract is not active.'; end if;
  insert into transactions (season, kind, team_id, player_id, contract_id, salary, years, note)
    values (p_season, 'release', r.team_id, r.player_id, r.id, r.salary, r.years, p_note);
  select waiver_hours into h from settings where id = 1;
  update waivers set status = 'cancelled', closed_at = now() where player_id = r.player_id and status = 'open';
  insert into waivers (season, player_id, dropped_by, closes_at)
    values (p_season, r.player_id, r.team_id, waiver_closes_at(now(), coalesce(h, 24)));
end $$;

-- As before (fa_daily), plus: once the last chance round has signed, every free agent goes on waivers until the
-- next 8:00 London, with nobody as the dropper, so every GM can bid.
create or replace function bidding_settle(p_round uuid, p_awards jsonb, p_result jsonb, p_renounces int)
returns boolean language plpgsql set search_path = public, pg_temp as $$
declare r rounds; nxt rounds; a jsonb; c uuid; n int;
begin
  select * into r from rounds where id = p_round for update;
  if r.id is null or r.status <> 'open' then return false; end if;
  if r.closes_at > now() then raise exception 'Bidding is still open.'; end if;
  if (select count(*) from renounces where round_id = p_round) <> p_renounces then raise exception 'Someone just renounced. Try again.'; end if;

  for a in select * from jsonb_array_elements(p_awards) loop
    if exists (select 1 from contracts k where k.player_id = a->>'player_id' and k.active) then continue; end if;
    insert into contracts (player_id, team_id, salary, years, season_signed, acquired_via)
      values (a->>'player_id', (a->>'team_id')::uuid, (a->>'amount')::bigint, 1, r.season, 'draft') returning id into c;
    insert into transactions (season, kind, team_id, player_id, contract_id, salary, years, note)
      values (r.season, 'sign', (a->>'team_id')::uuid, a->>'player_id', c, (a->>'amount')::bigint, 1, 'Free agency');
  end loop;
  update rounds set status = 'final', result = p_result where id = p_round;

  if r.kind = 'regular' and not exists (select 1 from rounds where season = r.season and status = 'setup') then
    insert into rounds (season, number, kind) values (r.season, r.number + 1, 'leftovers') returning * into nxt;
    insert into round_players (round_id, player_id, pos)
      select nxt.id, x.player_id, row_number() over (order by x.number, x.pos)
      from (
        select rp.player_id, r2.number, rp.pos from round_players rp join rounds r2 on r2.id = rp.round_id
        where r2.season = r.season and r2.kind = 'regular'
          and not exists (select 1 from contracts k where k.player_id = rp.player_id and k.active)
      ) x;
    get diagnostics n = row_count;
    if n = 0 then delete from rounds where id = nxt.id; end if;
  end if;

  if r.kind = 'leftovers' then
    insert into waivers (season, player_id, dropped_by, closes_at)
      select r.season, p.id, null, waiver_closes_at(now(), 0) from players p
      where not exists (select 1 from contracts k where k.player_id = p.id and k.active)
        and not exists (select 1 from waivers w where w.player_id = p.id and w.status = 'open');
  end if;
  return true;
end $$;

-- Settle in one go every waiver whose time is up that nobody bid on: he is unclaimed (a free agent now), or
-- cancelled if he joined a team some other way meanwhile. The app settles the ones with bids one by one
-- (waiver_settle). Returns how many it closed.
create or replace function waiver_clear() returns int
language plpgsql set search_path = public, pg_temp as $$
declare n int;
begin
  update waivers w set
    status = case when exists (select 1 from contracts k where k.player_id = w.player_id and k.active) then 'cancelled' else 'unclaimed' end,
    note = case when exists (select 1 from contracts k where k.player_id = w.player_id and k.active) then 'Signed elsewhere' else 'Cleared waivers, no bids' end,
    closed_at = now()
  where w.status = 'open' and w.closes_at <= now() and not exists (select 1 from waiver_bids b where b.waiver_id = w.id);
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function waiver_closes_at(timestamptz, int) from public, anon, authenticated;
revoke execute on function waiver_clear() from public, anon, authenticated;
