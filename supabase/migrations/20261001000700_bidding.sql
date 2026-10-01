-- Free agency bidding site (/bidding).
-- Sealed bid rounds of players. A round is "open" until closes_at, then revealed to everyone (status stays 'open'
-- until the commissioner moves on, so winners can renounce). Moving on writes the signings as contracts, freezes
-- the reveal in rounds.result and opens the next round. After the last regular round, every player nobody signed
-- goes into one last chance round. At the end each GM picks contract lengths for their signings.

alter table rounds add column if not exists kind text not null default 'regular' check (kind in ('regular', 'leftovers'));
alter table rounds add column if not exists result jsonb;
alter table round_players add column if not exists pos int not null default 0;
alter table settings add column if not exists fa_locked boolean not null default false;

-- Email only sign in: the cookie holds a random token that points at a team.
create table if not exists bid_sessions (
  token text primary key,
  team_id uuid not null references teams(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table bid_sessions enable row level security;

-- Place, change or (amount null) remove a bid. Bidding closes on the database clock.
create or replace function bidding_place(p_round uuid, p_team uuid, p_player text, p_amount bigint)
returns void language plpgsql set search_path = public, pg_temp as $$
declare r rounds;
begin
  select * into r from rounds where id = p_round;
  if r.id is null or r.status <> 'open' or r.closes_at <= now() then raise exception 'Bidding is closed for this round.'; end if;
  if not exists (select 1 from round_players where round_id = p_round and player_id = p_player) then
    raise exception 'That player is not in this round.';
  end if;
  if p_amount is null then
    delete from bids where round_id = p_round and team_id = p_team and player_id = p_player;
    return;
  end if;
  insert into bids (round_id, team_id, player_id, amount, years) values (p_round, p_team, p_player, p_amount, 1)
    on conflict (round_id, team_id, player_id) do update set amount = excluded.amount, created_at = now();
end $$;

-- Give up a signing after the reveal. Renounces are numbered per team per season (block 0, 1, 2...).
create or replace function bidding_renounce(p_bid uuid, p_team uuid, p_max int)
returns void language plpgsql set search_path = public, pg_temp as $$
declare b bids; r rounds; n int;
begin
  select * into b from bids where id = p_bid;
  if b.id is null or b.team_id <> p_team then raise exception 'That is not your signing.'; end if;
  select * into r from rounds where id = b.round_id for update;
  if r.status <> 'open' or r.closes_at > now() then raise exception 'You can renounce once the round is revealed.'; end if;
  if exists (select 1 from renounces where bid_id = p_bid) then return; end if;
  select count(*) into n from renounces where season = r.season and team_id = p_team;
  if n >= p_max then raise exception 'No renounce rights left.'; end if;
  insert into renounces (season, block, team_id, round_id, bid_id) values (r.season, n, p_team, r.id, p_bid);
end $$;

-- Close a revealed round: sign the winners, freeze the reveal, open the next round for p_seconds.
-- p_renounces guards against a renounce landing between the app reading the round and this call.
create or replace function bidding_finalize(p_round uuid, p_awards jsonb, p_result jsonb, p_renounces int, p_seconds int)
returns void language plpgsql set search_path = public, pg_temp as $$
declare r rounds; nxt rounds; a jsonb; c uuid; n int;
begin
  select * into r from rounds where id = p_round for update;
  if r.id is null or r.status <> 'open' then raise exception 'This round is already done.'; end if;
  if r.closes_at > now() then raise exception 'Bidding is still open.'; end if;
  if (select count(*) from renounces where round_id = p_round) <> p_renounces then raise exception 'Someone just renounced. Try again.'; end if;

  for a in select * from jsonb_array_elements(p_awards) loop
    insert into contracts (player_id, team_id, salary, years, season_signed, acquired_via)
      values (a->>'player_id', (a->>'team_id')::uuid, (a->>'amount')::bigint, 1, r.season, 'draft') returning id into c;
    insert into transactions (season, kind, team_id, player_id, contract_id, salary, years, note)
      values (r.season, 'sign', (a->>'team_id')::uuid, a->>'player_id', c, (a->>'amount')::bigint, 1, 'Free agency');
  end loop;
  update rounds set status = 'final', result = p_result where id = p_round;

  select * into nxt from rounds where season = r.season and status = 'setup' order by number limit 1;
  if nxt.id is null and r.kind = 'regular' then
    insert into rounds (season, number, kind) values (r.season, r.number + 1, 'leftovers') returning * into nxt;
    insert into round_players (round_id, player_id, pos)
      select nxt.id, x.player_id, row_number() over (order by x.number, x.pos)
      from (
        select rp.player_id, r2.number, rp.pos from round_players rp join rounds r2 on r2.id = rp.round_id
        where r2.season = r.season and r2.kind = 'regular'
          and not exists (select 1 from contracts k where k.player_id = rp.player_id and k.active)
      ) x;
    get diagnostics n = row_count;
    if n = 0 then
      delete from rounds where id = nxt.id;
      nxt := null;
    end if;
  end if;
  if nxt.id is not null then
    update rounds set status = 'open', closes_at = now() + make_interval(secs => p_seconds) where id = nxt.id;
  end if;
end $$;

-- Contract lengths for this season's free agency signings. p_rows: [{contract_id, years}], p_limits: {"4": 1, ...}.
create or replace function bidding_set_lengths(p_team uuid, p_season int, p_rows jsonb, p_limits jsonb)
returns void language plpgsql set search_path = public, pg_temp as $$
declare x jsonb; k text;
begin
  if (select fa_locked from settings where id = 1) then raise exception 'Contracts are locked.'; end if;
  for x in select * from jsonb_array_elements(p_rows) loop
    if (x->>'years')::int not between 1 and 4 then raise exception 'Contracts are 1 to 4 years.'; end if;
    update contracts set years = (x->>'years')::int
      where id = (x->>'contract_id')::uuid and team_id = p_team and season_signed = p_season and acquired_via = 'draft' and active;
  end loop;
  for k in select * from jsonb_object_keys(p_limits) loop
    if (select count(*) from contracts where team_id = p_team and season_signed = p_season and years = k::int) > (p_limits->>k)::int then
      raise exception 'Only % %-year contracts.', p_limits->>k, k;
    end if;
  end loop;
  update transactions t set years = c.years from contracts c
    where t.contract_id = c.id and t.kind = 'sign' and c.team_id = p_team and c.season_signed = p_season and c.acquired_via = 'draft';
end $$;

-- Start over (keeps the player lists): removes this season's free agency signings, bids, renounces and the last chance round.
create or replace function bidding_restart(p_season int)
returns void language plpgsql set search_path = public, pg_temp as $$
begin
  delete from transactions where contract_id in (select id from contracts where season_signed = p_season and acquired_via = 'draft');
  delete from contracts where season_signed = p_season and acquired_via = 'draft';
  delete from rounds where season = p_season and kind = 'leftovers';
  delete from bids where round_id in (select id from rounds where season = p_season);
  delete from renounces where season = p_season;
  update rounds set status = 'setup', closes_at = null, result = null where season = p_season;
  update settings set fa_locked = false where id = 1;
end $$;

revoke execute on function bidding_place(uuid, uuid, text, bigint) from public, anon, authenticated;
revoke execute on function bidding_renounce(uuid, uuid, int) from public, anon, authenticated;
revoke execute on function bidding_finalize(uuid, jsonb, jsonb, int, int) from public, anon, authenticated;
revoke execute on function bidding_set_lengths(uuid, int, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function bidding_restart(int) from public, anon, authenticated;
