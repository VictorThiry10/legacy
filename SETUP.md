# Getting Legacy online (about 20 minutes, no code)

You need 3 free accounts: GitHub (stores the code), Supabase (the database and logins), Vercel (puts the site online).

## 1. Supabase: the database
1. Go to supabase.com, sign up, click New project. Name it `legacy`, pick a strong database password (save it), region Europe West (London). Create.
2. Left menu, SQL Editor, New query. Open `supabase/schema.sql`, copy everything, paste, click Run. You should see "Success".
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
   - `CRON_SECRET` = any long random password you make up (it stops strangers triggering the ESPN sync)
4. Click Deploy. After a minute you get a link like `legacy-xyz.vercel.app`.

## 4. Connect login emails to your site
In Supabase: Authentication, URL Configuration.
- Site URL: your Vercel link
- Redirect URLs: add your Vercel link followed by `/auth/callback`

## 5. First login
Open your Vercel link, enter your email, click the link in your inbox. You're in as commissioner.
Then in Commish: rename your team, add the 7 GMs' emails, and click Load players from ESPN.

Then click Load season schedule once (every tipoff time for the season).

## 6. Live scores every 10 minutes
Vercel's free plan refreshes rosters and injuries once a day by itself. For box scores during games,
Supabase runs a 10 minute timer. In Supabase: Database, Extensions, turn on `pg_cron` and `pg_net`.
Then SQL Editor, paste this with your Vercel link and CRON_SECRET filled in, and Run:

```sql
select cron.schedule('espn-live', '*/10 * * * *', $$
  select net.http_get(
    url := 'https://YOUR-SITE.vercel.app/api/cron/espn',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET')
  );
$$);
```

Note: Supabase's free email sender only sends a few login emails per hour. Logins last for weeks, so ask GMs to sign in over a day or two rather than all at once.
