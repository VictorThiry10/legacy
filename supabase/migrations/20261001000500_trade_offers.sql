-- Trade offers: one GM proposes, the other accepts or declines. Accepting swaps the contracts in one step.
create table if not exists trade_offers (
  id uuid primary key default gen_random_uuid(),
  season int not null,
  from_team uuid not null references teams(id) on delete cascade,   -- proposes
  to_team uuid not null references teams(id) on delete cascade,     -- decides
  give uuid[] not null default '{}',                                 -- contracts from_team sends
  get uuid[] not null default '{}',                                  -- contracts to_team sends
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists trade_offers_open on trade_offers(to_team, from_team) where status = 'pending';
alter table trade_offers enable row level security;

-- Accept: lock the offer, swap the contracts (roster_trade checks they are still on the right teams), close it.
create or replace function trade_offer_accept(p_offer uuid, p_season int) returns void
language plpgsql set search_path = public, pg_temp as $$
declare o trade_offers;
begin
  select * into o from trade_offers where id = p_offer for update;
  if o.id is null or o.status <> 'pending' then raise exception 'This offer is no longer open.'; end if;
  perform roster_trade(o.from_team, o.to_team, o.give, o.get, p_season, 'Trade offer accepted');
  update trade_offers set status = 'accepted', decided_at = now() where id = p_offer;
end $$;
revoke execute on function trade_offer_accept(uuid, int) from public, anon, authenticated;
