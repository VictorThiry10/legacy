-- Waivers. Every dropped player goes on waivers for 48 hours (settings.waiver_hours). Until then any GM except the
-- one who dropped him can send a sealed bid: the salary he'd get on a 1 year contract. Nobody sees anyone else's bid.
-- When the clock runs out the best legal bid signs him. No bids: he is unclaimed and becomes a normal free agent,
-- first come first served.

alter table settings add column if not exists waiver_hours int not null default 48 check (waiver_hours between 1 and 168);

create table if not exists waivers (
  id uuid primary key default gen_random_uuid(),
  season int not null,
  player_id text not null references players(id),
  dropped_by uuid references teams(id) on delete set null,          -- can't bid on him
  closes_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'claimed', 'unclaimed', 'cancelled')),
  contract_id uuid references contracts(id) on delete set null,     -- claimed: the contract the winner got
  note text,                                                         -- how it ended, e.g. "3 sealed bids"
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create unique index if not exists one_open_waiver_per_player on waivers(player_id) where status = 'open';
create index if not exists waivers_due on waivers(closes_at) where status = 'open';
alter table waivers enable row level security;

create table if not exists waiver_bids (
  id uuid primary key default gen_random_uuid(),
  waiver_id uuid not null references waivers(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  amount bigint not null check (amount > 0),
  drop_contract uuid references contracts(id) on delete set null,   -- released only if this bid wins
  created_at timestamptz not null default now(),                    -- changing a bid resets it: ties go to the earlier bid
  unique (waiver_id, team_id)
);
alter table waiver_bids enable row level security;

-- Releasing a player now puts him on waivers (this covers drops on pickup, waiver claims and the commissioner).
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
    values (p_season, r.player_id, r.team_id, now() + make_interval(hours => coalesce(h, 48)));
end $$;

-- Signing a player who is on waivers some other way (the commissioner) ends his waiver; the bids are dropped.
create or replace function roster_sign(p_team uuid, p_player text, p_salary bigint, p_years int, p_season_signed int,
  p_season int, p_via text, p_note text) returns uuid language plpgsql set search_path = public, pg_temp as $$
declare c uuid;
begin
  update waivers set status = 'cancelled', closed_at = now() where player_id = p_player and status = 'open';
  insert into contracts (player_id, team_id, salary, years, season_signed, acquired_via)
    values (p_player, p_team, p_salary, p_years, p_season_signed, p_via) returning id into c;
  insert into transactions (season, kind, team_id, player_id, contract_id, salary, years, note)
    values (p_season, 'sign', p_team, p_player, c, p_salary, p_years, p_note);
  return c;
end $$;

-- Free agent pickup, as before, but never for a player still on waivers.
create or replace function roster_pickup(p_team uuid, p_player text, p_salary bigint, p_season int, p_drop uuid, p_note text)
returns uuid language plpgsql set search_path = public, pg_temp as $$
begin
  if exists (select 1 from waivers where player_id = p_player and status = 'open') then
    raise exception 'He is on waivers: place a bid instead.';
  end if;
  if p_drop is not null then
    if not exists (select 1 from contracts where id = p_drop and team_id = p_team and active) then
      raise exception 'That player is no longer on your team.';
    end if;
    perform roster_release(p_drop, p_season, p_note);
  end if;
  return roster_sign(p_team, p_player, p_salary, 1, p_season, p_season, 'free_agent', p_note);
end $$;

-- Place, change or (amount null) withdraw a sealed bid. Bidding closes on the database clock.
create or replace function waiver_bid(p_waiver uuid, p_team uuid, p_amount bigint, p_drop uuid)
returns void language plpgsql set search_path = public, pg_temp as $$
declare w waivers;
begin
  select * into w from waivers where id = p_waiver for share;
  if w.id is null or w.status <> 'open' or w.closes_at <= now() then raise exception 'Bidding on him has closed.'; end if;
  if w.dropped_by = p_team then raise exception 'You dropped him, so you can''t bid on him until he clears waivers.'; end if;
  if p_amount is null then
    delete from waiver_bids where waiver_id = p_waiver and team_id = p_team;
    return;
  end if;
  if p_drop is not null and not exists (select 1 from contracts where id = p_drop and team_id = p_team and active) then
    raise exception 'That player is no longer on your team.';
  end if;
  insert into waiver_bids (waiver_id, team_id, amount, drop_contract) values (p_waiver, p_team, p_amount, p_drop)
    on conflict (waiver_id, team_id) do update set amount = excluded.amount, drop_contract = excluded.drop_contract, created_at = now();
end $$;

-- Settle a waiver once its clock has run out. p_bid is the winning bid (the app picks the best legal one): it
-- releases the player that bid named to drop (if he's still on that team), then signs him for 1 year at the bid.
-- p_bid null: nobody gets him and he is a free agent. p_bids guards against a bid landing after the app read them.
create or replace function waiver_settle(p_waiver uuid, p_bid uuid, p_bids int, p_season int, p_note text)
returns void language plpgsql set search_path = public, pg_temp as $$
declare w waivers; b waiver_bids; c uuid;
begin
  select * into w from waivers where id = p_waiver for update;
  if w.id is null or w.status <> 'open' then raise exception 'This waiver is already settled.'; end if;
  if w.closes_at > now() then raise exception 'Bidding on him is still open.'; end if;
  if (select count(*) from waiver_bids where waiver_id = p_waiver) <> p_bids then raise exception 'A bid just came in. Try again.'; end if;
  if exists (select 1 from contracts where player_id = w.player_id and active) then
    -- someone signed him another way meanwhile (e.g. free agency rounds write contracts directly)
    update waivers set status = 'cancelled', closed_at = now(), note = 'Signed elsewhere' where id = p_waiver;
    return;
  end if;
  if p_bid is null then
    update waivers set status = 'unclaimed', closed_at = now(), note = p_note where id = p_waiver;
    return;
  end if;
  select * into b from waiver_bids where id = p_bid and waiver_id = p_waiver;
  if b.id is null then raise exception 'That bid is not on this waiver.'; end if;
  update waivers set status = 'claimed', closed_at = now(), note = p_note where id = p_waiver;
  if exists (select 1 from contracts where id = b.drop_contract and team_id = b.team_id and active) then
    perform roster_release(b.drop_contract, p_season, 'Dropped for a waiver claim');
  end if;
  c := roster_sign(b.team_id, w.player_id, b.amount, 1, p_season, p_season, 'waiver', p_note);
  update waivers set contract_id = c where id = p_waiver;
end $$;

revoke execute on function roster_release(uuid, int, text) from public, anon, authenticated;
revoke execute on function roster_sign(uuid, text, bigint, int, int, int, text, text) from public, anon, authenticated;
revoke execute on function roster_pickup(uuid, text, bigint, int, uuid, text) from public, anon, authenticated;
revoke execute on function waiver_bid(uuid, uuid, bigint, uuid) from public, anon, authenticated;
revoke execute on function waiver_settle(uuid, uuid, int, int, text) from public, anon, authenticated;
