-- Free agency by the clock: a round a day. The commissioner sets when the next round opens and how long the bidding
-- and the renounce window last (settings.fa_schedule); rounds then open, show their results and sign their winners
-- by themselves. The app's advance() (lib/bidding.ts) does the moving, called by every screen and by a timer.

alter table rounds add column if not exists opens_at timestamptz;   -- bidding opened
alter table rounds add column if not exists settles_at timestamptz; -- the renounce window ends and the winners sign
-- {"start": iso, "from": n, "bidMinutes": 600, "renounceMinutes": 120, "everyMinutes": 1440}, or null: nothing opens.
alter table settings add column if not exists fa_schedule jsonb;

-- Open a round on schedule. False if it isn't waiting any more or another round is still open.
create or replace function bidding_open(p_round uuid, p_opens timestamptz, p_closes timestamptz, p_settles timestamptz)
returns boolean language plpgsql set search_path = public, pg_temp as $$
declare r rounds;
begin
  select * into r from rounds where id = p_round for update;
  if r.id is null or r.status <> 'setup' then return false; end if;
  if exists (select 1 from rounds where season = r.season and status = 'open') then return false; end if;
  update rounds set status = 'open', opens_at = p_opens, closes_at = p_closes, settles_at = p_settles where id = p_round;
  return true;
end $$;

-- Give up a signing after the reveal, until the renounce window closes.
create or replace function bidding_renounce(p_bid uuid, p_team uuid, p_max int)
returns void language plpgsql set search_path = public, pg_temp as $$
declare b bids; r rounds; n int;
begin
  select * into b from bids where id = p_bid;
  if b.id is null or b.team_id <> p_team then raise exception 'That is not your signing.'; end if;
  select * into r from rounds where id = b.round_id for update;
  if r.status <> 'open' or r.closes_at > now() then raise exception 'You can renounce once the results are in.'; end if;
  if r.settles_at is not null and now() >= r.settles_at then raise exception 'The renounce window is closed.'; end if;
  if exists (select 1 from renounces where bid_id = p_bid) then return; end if;
  select count(*) into n from renounces where season = r.season and team_id = p_team;
  if n >= p_max then raise exception 'No renounce rights left.'; end if;
  insert into renounces (season, block, team_id, round_id, bid_id) values (r.season, n, p_team, r.id, p_bid);
end $$;

-- Close a round whose results are in: sign the winners and freeze the results. After the last regular round, every
-- player nobody signed goes into one last chance round, which waits for its turn like any other.
-- False if the round was already closed (two screens asking at once). A winner who joined a team some other way in
-- the meantime is skipped.
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
  return true;
end $$;

-- Start over (keeps the player lists): removes this season's free agency signings, bids, renounces, the last
-- chance round and the schedule, so nothing opens again until the commissioner sets a new one.
create or replace function bidding_restart(p_season int)
returns void language plpgsql set search_path = public, pg_temp as $$
begin
  delete from transactions where contract_id in (select id from contracts where season_signed = p_season and acquired_via = 'draft');
  delete from contracts where season_signed = p_season and acquired_via = 'draft';
  delete from rounds where season = p_season and kind = 'leftovers';
  delete from bids where round_id in (select id from rounds where season = p_season);
  delete from renounces where season = p_season;
  update rounds set status = 'setup', opens_at = null, closes_at = null, settles_at = null, result = null where season = p_season;
  update settings set fa_locked = false, fa_schedule = null where id = 1;
end $$;

revoke execute on function bidding_open(uuid, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function bidding_renounce(uuid, uuid, int) from public, anon, authenticated;
revoke execute on function bidding_settle(uuid, jsonb, jsonb, int) from public, anon, authenticated;
revoke execute on function bidding_restart(int) from public, anon, authenticated;

-- A timer every minute, so rounds open and sign on time with nobody on the site.
select cron.schedule('bidding-tick', '* * * * *',
  $$ select net.http_get(url := 'https://legacy-topaz-nine.vercel.app/api/cron/bidding', timeout_milliseconds := 30000) $$);
