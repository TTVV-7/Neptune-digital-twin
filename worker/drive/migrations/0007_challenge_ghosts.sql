-- Challenge ghosts and "challenge a friend" links (worker/drive/challenges.js,
-- src/drive-app/ghost-rules.js, docs/world-drive.md "Challenges"). Applied by the deploy (npm run
-- deploy:drive), after 0006. Times are milliseconds since 1970.

-- Each time's handle, what a "challenge a friend" link names it by: an HMAC of the challenge and the
-- player under a key only the Worker has, made as their first time there is written and kept with it
-- (a better time keeps it), so the same link always shows that player's best on the challenge,
-- nobody but the Worker can make one, and it says nothing of who (never the player's id, which is
-- half of their credentials). Looked up by the link, so unique on its challenge.
ALTER TABLE challenge_times ADD COLUMN handle TEXT;
CREATE UNIQUE INDEX challenge_times_handle ON challenge_times ( challenge_id, handle );

-- The best's ghost on each challenge for each player: its run (the time's run_id), its time and
-- passes (the splits a run against it is compared with), the ride and its Garage look, and the
-- path itself (ghost-rules.js's packing, as base64url text: a few kilobytes a minute, 48 KB at most).
-- Replaced with the best, and gone with it (a cheat's time deleted takes its ghost), and gone for
-- all once the challenge is finished (its final places written): nothing races a finished one.
CREATE TABLE challenge_ghosts (
	challenge_id INTEGER NOT NULL,
	player_id TEXT NOT NULL,
	run_id TEXT NOT NULL,
	ms INTEGER NOT NULL,
	passes TEXT NOT NULL,
	vehicle TEXT NOT NULL,
	look TEXT NOT NULL DEFAULT '{}',
	ghost TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	PRIMARY KEY ( challenge_id, player_id ),
	FOREIGN KEY ( challenge_id, player_id ) REFERENCES challenge_times ( challenge_id, player_id ) ON DELETE CASCADE
);

-- A ghost is fetched by its run (a run's ghost never changes, so it's kept in Cloudflare's cache by
-- it): one row on its challenge.
CREATE UNIQUE INDEX challenge_ghosts_run ON challenge_ghosts ( challenge_id, run_id );

-- How much of its ghosts' text each challenge keeps (characters), added to as one is written and
-- taken off as one is let go (replaced by a better one's, or all as the challenge finishes): a new
-- best's ghost is kept only while this is under the Worker's CHALLENGE_GHOST_BUDGET, so however many
-- are posted, the ghosts can't fill the database.
ALTER TABLE challenges ADD COLUMN ghost_bytes INTEGER NOT NULL DEFAULT 0;
