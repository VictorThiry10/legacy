-- Push notifications (trades, injury news).
-- push_subscriptions: one row per phone or browser that turned notifications on, tied to the GM's team.
create table if not exists push_subscriptions (
  endpoint text primary key,                                   -- the push service's address for that device
  team_id uuid not null references teams(id) on delete cascade,
  p256dh text not null,                                        -- the device's keys: only it can read what we send
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_team on push_subscriptions(team_id);
alter table push_subscriptions enable row level security;

-- app_secrets: keys the app makes for itself (the push signing key pair). Row level security with no policy:
-- only the server can read it.
create table if not exists app_secrets (
  key text primary key,
  value text not null
);
alter table app_secrets enable row level security;
