-- The 30 NBA teams (ESPN id -> abbreviation), so pages don't read every player to learn them.
create or replace view nba_teams with (security_invoker = true) as
  select distinct nba_team_id as id, nba_team as abbr from players where nba_team_id is not null;
