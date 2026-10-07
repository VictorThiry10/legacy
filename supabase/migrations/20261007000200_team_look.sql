-- A team's own look: a photo for its badge and a colour (behind the initials when there's no photo, a ring around
-- the photo when there is one). Each GM sets his own by tapping his badge on the Matchup page.
alter table teams add column if not exists logo_url text;
alter table teams add column if not exists color text;
alter table teams drop constraint if exists teams_color_hex;
alter table teams add constraint teams_color_hex check (color is null or color ~ '^#[0-9a-f]{6}$');

-- The photos: a public bucket (anyone with the address can see a badge), written only by the server.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-logos', 'team-logos', true, 524288, array['image/jpeg'])
on conflict (id) do nothing;
