-- Scoring reliability and the preseason dress rehearsal.

-- Preseason (1), regular season (2) or playoffs (3), from ESPN. Preseason box scores stay out of season stats.
alter table games add column if not exists season_type int;
update games set season_type = case when (start at time zone 'America/New_York')::date < '2026-10-20' then 1 else 2 end
  where season_type is null and start >= '2026-09-01';

-- When each lineup save was made. A save made after a player's tip-off can't move his points for that day.
alter table lineups add column if not exists saved_at timestamptz not null default now();

-- Test matchups (the preseason dress rehearsal and earlier previews). Building the real schedule removes them.
alter table matchups add column if not exists is_test boolean not null default false;
update matchups set is_test = true where season = 2026;

-- current_lineups returns lineups rows: recreate it so it picks up saved_at.
create or replace function current_lineups(p_teams uuid[], p_day date)
returns setof lineups language sql stable set search_path = public, pg_temp as $$
  select l.* from unnest(coalesce(p_teams, array(select id from teams))) t(id)
  cross join lateral (select max(day) as d from lineups where team_id = t.id and day <= p_day) m
  join lineups l on l.team_id = t.id and l.day = m.d
$$;
revoke execute on function current_lineups(uuid[], date) from public, anon, authenticated;
