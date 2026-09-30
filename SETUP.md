# Getting Legacy online (about 20 minutes, no code)

You need 3 free accounts: GitHub (stores the code), Supabase (the database and logins), Vercel (puts the site online).

## 1. Supabase: the database
1. Go to supabase.com, sign up, click New project. Name it `legacy`, pick a strong database password (save it), region Europe West (London). Create.
2. Left menu, SQL Editor, New query. Paste each file in `supabase/migrations` in filename order, clicking Run after each. You should see "Success".
3. Left menu, Project Settings, API. Keep this tab open: you'll copy 3 values in step 3 (Project URL, anon public key, service_role secret key).

## 2. GitHub: the code
1. Go to github.com, sign up, click New repository. Name it `legacy`, set it to Private, click Create.
2. On the empty repo page click "uploading an existing file". Unzip legacy.zip and drag everything inside the folder into the page. Click Commit changes.

## 3. Vercel: the website
1. Go to vercel.com, sign up with your GitHub account.
2. Add New, Project, import `legacy`.
3. Before clicking Deploy, open Environment Variables and add these 4 (names exactly as written):
   - `NEXT_PUBLIC_SUPABASE_URL` = Supabase Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = Supabase anon public key
   - `SUPABASE_SERVICE_ROLE_KEY` = Supabase service_role key (secret: never share it)
   - `COMMISSIONER_EMAIL` = your email
4. Click Deploy. After a minute you get a link like `legacy-xyz.vercel.app`.

## 4. Connect login emails to your site
In Supabase: Authentication, URL Configuration.
- Site URL: your Vercel link
- Redirect URLs: add your Vercel link followed by `/auth/callback`

## 5. Sign ups
Anyone can join until the league has 8 teams: they enter their email, type the code Supabase emails them,
then pick a team name and GM name. The commissioner email gets commissioner rights the same way.

For the code to appear in the email, in Supabase go to Authentication, Emails, and make sure both the
"Magic Link" and "Confirm signup" templates include `{{ .Token }}`.

Once everyone has joined, the commissioner builds the head to head schedule in Settings, Schedule.

Players and the schedule load by themselves through the refresh job below.

## 6. Automatic refresh
A timer in Supabase calls the site every 10 minutes. The site then refreshes scores every time,
injuries and stats every hour, and the next two weeks of schedule once a day (it keeps track itself).
Vercel also calls it once a day as a backup. In Supabase SQL Editor, run once:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('espn-refresh', '*/10 * * * *',
  $$ select net.http_get(url := 'https://YOUR-SITE.vercel.app/api/cron/espn', timeout_milliseconds := 290000) $$);
```

Note: Supabase's free email sender only sends a few login emails per hour. Logins last for weeks, so ask GMs to sign in over a day or two rather than all at once.
