-- The rookie draft. The lottery is drawn once per draft year and every GM then watches the same order. Each pick
-- of that year gets its place (slot), and is used up when its holder takes a rookie.
create table if not exists rookie_lotteries (
  year int primary key,                        -- the draft's year, as in draft_picks.year
  odds jsonb not null,                         -- [{team, odds}] as shown before the draw, worst record first
  drawn_at timestamptz not null default now()
);
alter table rookie_lotteries enable row level security;

-- The teams that have watched the lottery: the pop-up opens until a team has.
create table if not exists rookie_lottery_views (
  year int not null,
  team_id uuid not null references teams(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (year, team_id)
);
alter table rookie_lottery_views enable row level security;

alter table draft_picks add column if not exists slot int;                                -- its place in the draft, set by the lottery
alter table draft_picks add column if not exists player_id text references players(id);   -- the rookie taken with it
alter table draft_picks add column if not exists picked_at timestamptz;
create unique index if not exists draft_picks_slot on draft_picks(year, slot) where slot is not null;
create unique index if not exists draft_picks_player on draft_picks(player_id) where player_id is not null;

-- Save the lottery's result. p_order: the picks' original teams, #1 first. Only the first call for a year counts
-- (two GMs pressing Play together get the same draw); returns whether this call was the one.
create or replace function rookie_lottery_save(p_year int, p_order uuid[], p_odds jsonb) returns boolean
language plpgsql set search_path = public, pg_temp as $$
begin
  insert into rookie_lotteries (year, odds) values (p_year, p_odds) on conflict (year) do nothing;
  if not found then return false; end if;
  update draft_picks d set slot = o.n from unnest(p_order) with ordinality as o(team, n)
    where d.year = p_year and d.original_team = o.team;
  if (select count(*) from draft_picks where year = p_year and slot is not null) <> coalesce(array_length(p_order, 1), 0) then
    raise exception 'Every team in the lottery needs a pick in the % draft.', p_year;
  end if;
  return true;
end $$;
revoke execute on function rookie_lottery_save(int, uuid[], jsonb) from public, anon, authenticated;

-- Use the pick on the clock: every earlier pick must be made, and p_team must hold it. The rookie is signed in the
-- same step. One pick at a time (the year's lottery row is the lock). Returns the pick's slot.
create or replace function rookie_pick(p_year int, p_team uuid, p_player text, p_salary bigint, p_years int, p_season int, p_note text)
returns int language plpgsql set search_path = public, pg_temp as $$
declare p draft_picks;
begin
  perform 1 from rookie_lotteries where year = p_year for update;
  if not found then raise exception 'The lottery has not been drawn yet.'; end if;
  select * into p from draft_picks where year = p_year and slot is not null and player_id is null order by slot limit 1;
  if p.id is null then raise exception 'The draft is over.'; end if;
  if p.team_id <> p_team then raise exception 'It is not your pick yet.'; end if;
  update draft_picks set player_id = p_player, picked_at = now() where id = p.id;
  perform roster_sign(p_team, p_player, p_salary, p_years, p_season, p_season, 'rookie', p_note);
  return p.slot;
exception when unique_violation then
  raise exception 'That player has just been taken.';
end $$;
revoke execute on function rookie_pick(int, uuid, text, bigint, int, int, text) from public, anon, authenticated;
