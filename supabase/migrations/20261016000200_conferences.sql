-- Conferences: Paris and London, four teams each. A team plays its conference rivals three times a season and
-- the other conference's teams once (plus one more game across, to fill 14 weeks): lib/schedule.ts.
alter table teams add column if not exists conference text check (conference in ('paris', 'london'));
update teams set conference = 'paris' where id in ('27b5d5b3-b282-44d9-9eea-d59f1dc5d9e3', '84af81f4-68b1-4803-85ed-8817f89657ea', '6d5b886f-4f6e-4ac1-a76d-3ac1e9f02f55', '3801e216-2d94-4a2f-8127-d93f23349271');
update teams set conference = 'london' where id in ('95b613dc-64b6-4d2f-8774-ba38fa257b60', '0fd155b1-6b98-4888-95ca-4c51f4a7d383', '9e6068c5-bed0-4056-b4c7-33a6bc30f26f', 'eadbbfbf-84dd-4e9a-a4bf-5ac10295035d');

-- The teams that have seen the conferences reveal: the pop-up opens until a team has.
create table if not exists conference_views (
  season int not null,
  team_id uuid not null references teams(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (season, team_id)
);
alter table conference_views enable row level security;
