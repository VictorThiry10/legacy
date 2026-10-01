-- Contract extensions, a one-off: each GM keeps any of last season's expiring players at last season's salary.
-- One row per team once it has decided (an empty list means no extensions), so the pop-up only shows once.
create table if not exists extension_decisions (
  team_id uuid primary key references teams(id) on delete cascade,
  season int not null,
  players text[] not null default '{}',
  decided_at timestamptz not null default now()
);
alter table extension_decisions enable row level security;

-- Sign every chosen player (1 year, rows: [{player, salary}]) and record the decision, all at once.
create or replace function extensions_decide(p_team uuid, p_season int, p_rows jsonb, p_note text)
returns void language plpgsql set search_path = public, pg_temp as $$
declare r jsonb;
begin
  insert into extension_decisions (team_id, season, players)
    values (p_team, p_season, array(select x->>'player' from jsonb_array_elements(p_rows) x));
  for r in select * from jsonb_array_elements(p_rows) loop
    perform roster_sign(p_team, r->>'player', (r->>'salary')::bigint, 1, p_season, p_season, 'extension', p_note);
  end loop;
exception when unique_violation then
  if exists (select 1 from extension_decisions where team_id = p_team) then raise exception 'Extensions are already done for your team.'; end if;
  raise exception 'One of those players was just signed by another team.';
end $$;
revoke execute on function extensions_decide(uuid, int, jsonb, text) from public, anon, authenticated;
