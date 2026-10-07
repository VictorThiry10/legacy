-- Recent moves, seen: when each GM last opened the moves log. A move by another team newer than that puts a red dot
-- on the Recent moves row of the Team page. One row per team.
create table if not exists moves_seen (
  team_id uuid primary key references teams(id) on delete cascade,
  seen_at timestamptz not null default now()
);
alter table moves_seen enable row level security;
