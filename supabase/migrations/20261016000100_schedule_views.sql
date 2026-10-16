-- The teams that have seen the schedule release show: the pop-up opens, once the real schedule is built, until a
-- team has.
create table if not exists schedule_views (
  season int not null,
  team_id uuid not null references teams(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (season, team_id)
);
alter table schedule_views enable row level security;
