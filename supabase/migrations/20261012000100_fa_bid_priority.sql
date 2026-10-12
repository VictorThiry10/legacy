-- Bid priority. A GM whose winning bids together go over the cap (or the roster) chooses which ones give way:
-- priority 1 is kept the longest. Bids without a priority give way before the ranked ones, the most recent first
-- (how it worked before). Set from the room's Priority sheet while the round is open.
alter table bids add column if not exists priority int;

create or replace function bidding_rank(p_round uuid, p_team uuid, p_players text[])
returns void language plpgsql set search_path = public, pg_temp as $$
declare r rounds;
begin
  select * into r from rounds where id = p_round;
  if r.id is null or r.status <> 'open' or r.closes_at <= now() then raise exception 'Bidding is closed for this round.'; end if;
  update bids b set priority = x.n from unnest(p_players) with ordinality as x(player_id, n)
    where b.round_id = p_round and b.team_id = p_team and b.player_id = x.player_id;
  update bids set priority = null where round_id = p_round and team_id = p_team and not (player_id = any(p_players));
end $$;

revoke execute on function bidding_rank(uuid, uuid, text[]) from public, anon, authenticated;
