-- After the auction, every free agent stays on waivers like a dropped player: settings.waiver_hours (24) and then
-- until the next 8:00 London. The last chance round signed Sunday evening (2026-10-18), so "the next 8:00" was
-- Monday morning; Victor wants the bids to run until the morning after a full day (Tuesday 8:00).
create or replace function bidding_settle(p_round uuid, p_awards jsonb, p_result jsonb, p_renounces int)
returns boolean language plpgsql set search_path = public, pg_temp as $$
declare r rounds; nxt rounds; a jsonb; c uuid; n int; h int;
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
    select waiver_hours into h from settings where id = 1;
    insert into waivers (season, player_id, dropped_by, closes_at)
      select r.season, p.id, null, waiver_closes_at(now(), coalesce(h, 24)) from players p
      where not exists (select 1 from contracts k where k.player_id = p.id and k.active)
        and not exists (select 1 from waivers w where w.player_id = p.id and w.status = 'open');
  end if;
  return true;
end $$;
