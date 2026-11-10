-- Next week's add, made early (Victor, 2026-11-10). On Sunday, from the first NBA tip-off, a GM who has used this
-- week's add can already make next week's. On a free agent it is a hold: a waiver nobody else can bid on, with that
-- GM's claim on it, that signs him when waivers clear (the next 8:00 London, Monday morning). First come first
-- served: one open waiver per player, so the second GM is refused. The app decides when a hold is allowed and
-- settles it like any waiver (lib/waivers.ts).

alter table waivers add column if not exists held_for uuid references teams(id) on delete set null;   -- the only team that gets him
create index if not exists waivers_held on waivers(held_for) where status = 'open' and held_for is not null;

-- Hold a free agent for a team until waivers clear, and never before p_week (the Monday next week starts, a US
-- Eastern day): he signs in the week whose add he is. p_drop is released only when he signs.
create or replace function early_add(p_team uuid, p_player text, p_amount bigint, p_drop uuid, p_season int, p_week date) returns uuid
language plpgsql set search_path = public, pg_temp as $$
declare w uuid;
begin
  if exists (select 1 from contracts where player_id = p_player and active) then raise exception 'Someone just picked him up.'; end if;
  if p_drop is not null and not exists (select 1 from contracts where id = p_drop and team_id = p_team and active) then
    raise exception 'That player is no longer on your team.';
  end if;
  insert into waivers (season, player_id, dropped_by, held_for, closes_at)
    values (p_season, p_player, null, p_team, waiver_closes_at(greatest(now(), p_week::timestamp at time zone 'America/New_York'), 0))
    returning id into w;
  insert into waiver_bids (waiver_id, team_id, amount, drop_contract) values (w, p_team, p_amount, p_drop);
  return w;
end $$;

-- The GM gives the hold up: he is a free agent again.
create or replace function early_add_cancel(p_waiver uuid, p_team uuid) returns void
language plpgsql set search_path = public, pg_temp as $$
begin
  update waivers set status = 'cancelled', closed_at = now(), note = 'Early add cancelled'
    where id = p_waiver and held_for = p_team and status = 'open';
  if not found then raise exception 'Nothing to cancel.'; end if;
end $$;

revoke execute on function early_add(uuid, text, bigint, uuid, int, date) from public, anon, authenticated;
revoke execute on function early_add_cancel(uuid, uuid) from public, anon, authenticated;
