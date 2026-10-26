-- Where a live game is: "Q3 5:42", "Half", "End Q3", "OT 1:12". Null unless the game is on.
alter table games add column if not exists clock text;
