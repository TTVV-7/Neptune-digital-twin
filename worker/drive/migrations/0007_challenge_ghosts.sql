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
-- path itself (ghost-rules.js's packing, as base64url text: about 4.8 KB a minute, 64 KB at most)
-- with its length (bytes: what it takes of the challenge's ghost_bytes, read without reading the
-- text) and the least time the route allows along its passes (least_ms: leastTime, the crow's way
-- at the game's top speed, boosted; a time near it isn't handed out as the one newcomers race).
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
	bytes INTEGER NOT NULL,
	least_ms INTEGER NOT NULL,
	created_at INTEGER NOT NULL,
	PRIMARY KEY ( challenge_id, player_id ),
	FOREIGN KEY ( challenge_id, player_id ) REFERENCES challenge_times ( challenge_id, player_id ) ON DELETE CASCADE
);

-- A ghost is fetched by its run (a run's ghost never changes, so it's kept in Cloudflare's cache by
-- it): one row on its challenge.
CREATE UNIQUE INDEX challenge_ghosts_run ON challenge_ghosts ( challenge_id, run_id );

-- The slowest kept on a challenge, found when its ghosts are at CHALLENGE_GHOST_BUDGET and a new
-- best's would go past it: they're let go, slowest first, to make room for a quicker one's.
CREATE INDEX challenge_ghosts_ms ON challenge_ghosts ( challenge_id, ms );

-- How much of its ghosts' text each challenge keeps (characters), added to as one is written and
-- taken off as one is let go (replaced by a better one's, let go for a quicker one's, or all as the
-- challenge finishes): a new best's ghost is kept only while this is under the Worker's
-- CHALLENGE_GHOST_BUDGET, slower ones let go to make room for it, so however many are posted, the
-- ghosts can't fill the database, and the quickest are the ones kept.
ALTER TABLE challenges ADD COLUMN ghost_bytes INTEGER NOT NULL DEFAULT 0;

-- Whether each time's ghost is kept, and whether it's one to race (0: none kept; 1: kept; 2: kept,
-- and its time at least the Worker's PLAUSIBLE times the least its route allows, so it's one a
-- board or the list may hand out to race). Set as the time and its ghost are written, in the same
-- statement as the time (no row more), and cleared as its ghost is let go: so a board's rows say
-- which to race without reading a ghost's row for each, and the list's one to race for newcomers is
-- one read by the index below, however many quicker times have no ghost kept.
ALTER TABLE challenge_times ADD COLUMN ghost INTEGER NOT NULL DEFAULT 0;

-- The quickest time on a challenge with a ghost to race (the list's race): only those times are in
-- it, so it's the first of them, one row, whatever's ahead of it on the board.
CREATE INDEX challenge_times_raced ON challenge_times ( challenge_id, ms, created_at, player_id ) WHERE ghost = 2 AND owner = 0;
