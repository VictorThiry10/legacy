-- A player with games on other days (but not this one) left a lineup day unscored. Now every slot is summed directly.
create or replace function score_lineup_points(p_from date, p_to date) returns void language sql
set search_path = public, pg_temp as $$
  update lineup_points lp set (fpts, games) = (
    select coalesce(sum(pg.fpts), 0), count(*)::int
    from player_games pg join games g on g.id = pg.game_id
    where pg.player_id = lp.player_id and pg.played and (g.start at time zone 'America/New_York')::date = lp.day
  )
  where lp.day between p_from and p_to;
$$;
revoke execute on function score_lineup_points(date, date) from public, anon, authenticated;
