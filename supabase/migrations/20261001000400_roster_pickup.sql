-- Free agent pickup: optional drop, then a 1 year contract, all in one step (both or neither).
create or replace function roster_pickup(p_team uuid, p_player text, p_salary bigint, p_season int, p_drop uuid, p_note text)
returns uuid language plpgsql set search_path = public, pg_temp as $$
begin
  if p_drop is not null then
    if not exists (select 1 from contracts where id = p_drop and team_id = p_team and active) then
      raise exception 'That player is no longer on your team.';
    end if;
    perform roster_release(p_drop, p_season, p_note);
  end if;
  return roster_sign(p_team, p_player, p_salary, 1, p_season, p_season, 'free_agent', p_note);
end $$;
revoke execute on function roster_pickup(uuid, text, bigint, int, uuid, text) from public, anon, authenticated;
