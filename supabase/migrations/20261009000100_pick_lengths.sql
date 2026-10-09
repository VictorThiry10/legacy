-- Contracts whose length the GM still has to choose: players the commissioner assigned to a team at a set salary
-- (a new GM's first players). The Team page shows "Assign contract length" until he has.
alter table contracts add column if not exists pick_length boolean not null default false;

-- The GM chooses them all at once, and once: 1 to 4 years each, within the same limits as after free agency
-- (p_limits, {"4": 1, "3": 2, "2": 3}: every active contract on the team counts by the seasons it has left).
create or replace function contracts_pick_lengths(p_team uuid, p_season int, p_rows jsonb, p_limits jsonb)
returns void language plpgsql set search_path = public, pg_temp as $$
declare x jsonb; k text; n int;
begin
  for x in select * from jsonb_array_elements(p_rows) loop
    if (x->>'years')::int not between 1 and 4 then raise exception 'Contracts are 1 to 4 years.'; end if;
    update contracts set years = (x->>'years')::int, pick_length = false
      where id = (x->>'contract_id')::uuid and team_id = p_team and active and pick_length;
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'That contract''s length is already set.'; end if;
    update transactions set years = (x->>'years')::int where contract_id = (x->>'contract_id')::uuid and kind = 'sign';
  end loop;
  if exists (select 1 from contracts where team_id = p_team and active and pick_length) then
    raise exception 'Choose a length for every player.';
  end if;
  for k in select * from jsonb_object_keys(p_limits) loop
    if (select count(*) from contracts where team_id = p_team and active and season_signed + years - p_season = k::int) > (p_limits->>k)::int then
      raise exception 'Only % %-year contracts, counting the ones you already have.', p_limits->>k, k;
    end if;
  end loop;
end $$;

revoke execute on function contracts_pick_lengths(uuid, int, jsonb, jsonb) from public, anon, authenticated;
