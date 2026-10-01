-- Timers (pg_cron). The scores job runs every 2 minutes; the app decides whether there's work
-- (every couple of minutes while games are on, every 10 otherwise). A second job checks every 30 minutes
-- that scores are still updating and emails the commissioner if not.
select cron.alter_job((select jobid from cron.job where jobname = 'espn-refresh'), schedule := '*/2 * * * *');
select cron.schedule('scores-health', '*/30 * * * *',
  $$ select net.http_get(url := 'https://legacy-topaz-nine.vercel.app/api/cron/health', timeout_milliseconds := 60000) $$);
