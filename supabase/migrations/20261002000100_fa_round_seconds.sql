-- Free agency: how long each round's sealed bidding lasts, chosen by the commissioner on the Rounds page (/bidding/setup).
alter table settings add column if not exists round_seconds int not null default 180 check (round_seconds between 15 and 900);
