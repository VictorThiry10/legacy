-- Pin the schema every function reads from (Supabase security advisor). Folded into the foundations file above.
alter function roster_sign(uuid,text,bigint,int,int,int,text,text) set search_path = public, pg_temp;
alter function roster_release(uuid,int,text) set search_path = public, pg_temp;
alter function roster_trade(uuid,uuid,uuid[],uuid[],int,text) set search_path = public, pg_temp;
alter function save_lineup(uuid,date,jsonb) set search_path = public, pg_temp;
alter function snapshot_lineups(date,jsonb) set search_path = public, pg_temp;
alter function score_lineup_points(date,date) set search_path = public, pg_temp;
alter function rescore_all(jsonb) set search_path = public, pg_temp;
