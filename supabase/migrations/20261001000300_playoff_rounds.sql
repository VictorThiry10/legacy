-- Playoffs: semifinals and final are matchups too, spanning two weeks, with teams filled in once known.
alter table matchups add column if not exists round text not null default 'regular' check (round in ('regular', 'semi', 'final'));
alter table matchups alter column home_team_id drop not null;
alter table matchups alter column away_team_id drop not null;
