-- Faster reads for every page.
-- current_lineups: the lineup save that applies to each team on a day (its latest save on or before that day).
-- One index lookup per team instead of reading the whole season of saves. p_teams null means every team.
create or replace function current_lineups(p_teams uuid[], p_day date)
returns setof lineups language sql stable set search_path = public, pg_temp as $$
  select l.* from unnest(coalesce(p_teams, array(select id from teams))) t(id)
  cross join lateral (select max(day) as d from lineups where team_id = t.id and day <= p_day) m
  join lineups l on l.team_id = t.id and l.day = m.d
$$;
revoke execute on function current_lineups(uuid[], date) from public, anon, authenticated;

-- The player page lists a player's moves, newest first.
create index if not exists transactions_player on transactions(player_id, created_at desc);
