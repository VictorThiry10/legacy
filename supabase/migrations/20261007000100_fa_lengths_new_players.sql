-- Contract lengths after free agency: a GM sets them for this season's new players, however they came (the
-- auction, the rookie draft, a pickup). Last season's players keep theirs. The limits (1 x 4 years, 2 x 3, 3 x 2)
-- still count every active contract by the seasons it has left.
create or replace function bidding_set_lengths(p_team uuid, p_season int, p_rows jsonb, p_limits jsonb)
returns void language plpgsql set search_path = public, pg_temp as $$
declare x jsonb; k text;
begin
  if (select fa_locked from settings where id = 1) then raise exception 'Contracts are locked.'; end if;
  for x in select * from jsonb_array_elements(p_rows) loop
    if (x->>'years')::int not between 1 and 4 then raise exception 'Contracts are 1 to 4 years.'; end if;
    update contracts set years = (x->>'years')::int
      where id = (x->>'contract_id')::uuid and team_id = p_team and season_signed = p_season and active
        and acquired_via in ('draft', 'rookie', 'free_agent');
  end loop;
  for k in select * from jsonb_object_keys(p_limits) loop
    if (select count(*) from contracts where team_id = p_team and active and season_signed + years - p_season = k::int) > (p_limits->>k)::int then
      raise exception 'Only % %-year contracts, counting the ones you already have.', p_limits->>k, k;
    end if;
  end loop;
  update transactions t set years = c.years from contracts c
    where t.contract_id = c.id and t.kind = 'sign' and c.team_id = p_team and c.season_signed = p_season
      and c.acquired_via in ('draft', 'rookie', 'free_agent');
end $$;

revoke execute on function bidding_set_lengths(uuid, int, jsonb, jsonb) from public, anon, authenticated;
