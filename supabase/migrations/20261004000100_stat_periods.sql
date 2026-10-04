-- Stat periods on the Players page.
-- projection: ESPN's projected stat line for the season about to be played (same shape as last_season).
alter table players add column if not exists projection jsonb;

-- player_totals: every player's totals in the games played from p_from on (a US Eastern day), added up in the
-- database rather than row by row in the app. With p_regular, preseason games are left out: the rule every other
-- stat follows once the regular season has tipped off.
create or replace function player_totals(p_from date, p_regular boolean)
returns table (player_id text, gp int, min numeric, pts numeric, fgm numeric, fga numeric, reb numeric, ast numeric,
  stl numeric, blk numeric, tov numeric, tf numeric, ej numeric, fpts numeric)
language sql stable set search_path = public, pg_temp as $$
  select pg.player_id, count(*)::int, sum(pg.min), sum(pg.pts), sum(pg.fgm), sum(pg.fga), sum(pg.reb), sum(pg.ast),
    sum(pg.stl), sum(pg.blk), sum(pg.tov), sum(pg.tf), sum(pg.ej), sum(pg.fpts)
  from player_games pg join games g on g.id = pg.game_id
  where pg.played and (g.start at time zone 'America/New_York')::date >= p_from
    and (not p_regular or g.season_type is distinct from 1)
  group by pg.player_id
$$;
revoke execute on function player_totals(date, boolean) from public, anon, authenticated;
