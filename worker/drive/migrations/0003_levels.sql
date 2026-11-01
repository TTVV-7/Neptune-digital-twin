-- Levels (worker/drive/progress.js, src/drive-app/levels.js, docs/world-drive.md): each player's
-- XP, kept with the leaderboard player, and the areas and start spots they've driven. Applied by
-- the deploy (npm run deploy:drive). Times are milliseconds since 1970.

-- The player's XP (their own: a player linked to an account shows the level of the account's best).
ALTER TABLE players ADD COLUMN xp INTEGER NOT NULL DEFAULT 0;
-- The title picked for the nametag (an id in levels.js's TITLES), '' for the newest they have.
ALTER TABLE players ADD COLUMN title TEXT NOT NULL DEFAULT '';
-- When their last report of what they drove was taken: the next counts the time since (0: none
-- yet, so the first claims what was driven before the nickname). And that report's id (the
-- page's), so the same report sent again, its answer having been lost, is counted once.
ALTER TABLE players ADD COLUMN progress_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN progress_id TEXT NOT NULL DEFAULT '';
-- The UTC day of their last daily bonus ('2026-11-01'), and how many days in a row that was.
ALTER TABLE players ADD COLUMN streak_day TEXT NOT NULL DEFAULT '';
ALTER TABLE players ADD COLUMN streak INTEGER NOT NULL DEFAULT 0;
-- How many areas and spots they've discovered (the rows below), kept so the cap needs no count.
ALTER TABLE players ADD COLUMN discoveries INTEGER NOT NULL DEFAULT 0;

-- The areas ('near:1277.1088', live-protocol.js's cellOf) and start spots ('spot:furka') each
-- player has driven, each once: its XP comes only the first time. At most 2,000 a player. Without
-- a rowid, the key is the table, so a new one is one row written.
CREATE TABLE discoveries (
	player_id TEXT NOT NULL REFERENCES players ( id ) ON DELETE CASCADE,
	place TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	PRIMARY KEY ( player_id, place )
) WITHOUT ROWID;
