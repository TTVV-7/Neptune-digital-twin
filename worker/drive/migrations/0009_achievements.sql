-- Achievements and the construction rides they unlock (worker/drive/achievements.js,
-- src/drive-app/achievement-rules.js, docs/world-drive.md "Achievements and rewards"). Applied by
-- the deploy (npm run deploy:drive). Times are milliseconds since 1970.

-- The counts the page reports that achievements need and nothing else keeps (achievement-rules.js's
-- readTallies, JSON): km driven, Moon drives, Garage changes, the rides tried, the most days in a
-- row, and what of each the UTC day so far has taken (each held to a day's worth, TALLY_DAY). Read
-- and written with the player's row as each progress report is, so it costs no row of its own.
ALTER TABLE players ADD COLUMN tallies TEXT NOT NULL DEFAULT '{}';
-- Parties driven in with someone else, as the party's room counts them (live.js), and the last
-- party's code, so the same party isn't counted again as its page reconnects.
ALTER TABLE players ADD COLUMN parties INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN last_party TEXT NOT NULL DEFAULT '';

-- Each achievement a player has earned (an id in achievement-rules.js's ACHIEVEMENTS), and when:
-- 25 at most a player. The construction rides follow from these (RIDE_FEATS): this is the record of
-- what's unlocked, checked wherever a ride shows to others (rooms, boards, challenge times and their
-- ghosts). Keyed by the player, so a player's (and an account's players') are one look by key; the
-- owner's counts by achievement read the table whole (the admin page, rarely), so no index for that.
CREATE TABLE achievements (
	player_id TEXT NOT NULL REFERENCES players ( id ) ON DELETE CASCADE,
	achievement TEXT NOT NULL,
	earned_at INTEGER NOT NULL,
	PRIMARY KEY ( player_id, achievement )
) WITHOUT ROWID;
