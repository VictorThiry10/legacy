-- A player in a round still to come who joins a team some other way first (a contract extension, a free agent
-- pickup) is replaced by the best free agent not already in a round, by last season's fantasy points per game
-- (10 games or more; rookies have none and go through their own draft). He keeps the slot's position. Rounds
-- already open or done are left alone. Returns how many were replaced. Called by the app's advance() (every
-- poll and the minute timer), so it happens within a minute of the extension.
create or replace function bidding_replace_taken(p_season int)
returns int language plpgsql set search_path = public, pg_temp as $$
declare gone record; pick text; n int := 0;
begin
  for gone in
    select rp.round_id, rp.player_id from round_players rp join rounds r on r.id = rp.round_id
    where r.season = p_season and r.status = 'setup'
      and exists (select 1 from contracts c where c.player_id = rp.player_id and c.active)
    order by r.number, rp.pos
  loop
    select p.id into pick from players p
    where not exists (select 1 from contracts c where c.player_id = p.id and c.active)
      and not exists (select 1 from round_players x join rounds r2 on r2.id = x.round_id where r2.season = p_season and x.player_id = p.id)
      and coalesce((p.last_season->>'gp')::numeric, 0) >= 10
    order by (p.last_season->>'fpts')::numeric / (p.last_season->>'gp')::numeric desc
    limit 1;
    if pick is null then exit; end if;
    update round_players set player_id = pick where round_id = gone.round_id and player_id = gone.player_id;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function bidding_replace_taken(int) from public, anon, authenticated;
