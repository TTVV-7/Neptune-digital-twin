-- Challenges (worker/drive/challenges.js, src/drive-app/challenge-rules.js, docs/world-drive.md
-- "Challenges"): a daily, a weekly and a monthly challenge on the Earth and on the Moon, each with its
-- own board of the best times. Applied by the deploy (npm run deploy:drive). Times are milliseconds
-- since 1970.

-- Each period's challenge on each world, fixed here the first time it's asked for in its period, so
-- a later change to the rotation or its places never changes a live one. period: 'day:2026-11-16',
-- 'week:2026-11-16' (the Monday it starts) or 'month:2026-11', UTC. One live row a period and world;
-- one the owner changed while it was live is kept, with replaced_at, and its board with it, apart
-- from the new one's.
CREATE TABLE challenges (
	id INTEGER PRIMARY KEY,
	period TEXT NOT NULL,
	world TEXT NOT NULL,
	-- 'sprint', 'collect' or 'landmark'.
	kind TEXT NOT NULL,
	-- Where: the place's name and region as the list shows them.
	place TEXT NOT NULL,
	region TEXT NOT NULL DEFAULT '',
	-- The route: { start: { lat, lon, heading }, points: [ [ lat, lon ] ], radius, goal } (JSON).
	route TEXT NOT NULL,
	-- 'rotation', or 'owner' for one the owner chose (challenge_picks).
	source TEXT NOT NULL,
	starts_at INTEGER NOT NULL,
	ends_at INTEGER NOT NULL,
	-- How many players have a time on it (the owner's runs aren't counted: they're kept off boards).
	drivers INTEGER NOT NULL DEFAULT 0,
	created_at INTEGER NOT NULL,
	replaced_at INTEGER,
	-- When its final places were written into challenge_times (its period over, or replaced).
	final_at INTEGER
);

CREATE UNIQUE INDEX challenges_live ON challenges ( period, world ) WHERE replaced_at IS NULL;
CREATE INDEX challenges_by_period ON challenges ( period, world );
CREATE INDEX challenges_unfinished ON challenges ( ends_at ) WHERE final_at IS NULL;

-- Each player's best time on each challenge: the board, and what achievements can read (each
-- player's challenges finished, and once a challenge is over, the place they finished in).
CREATE TABLE challenge_times (
	challenge_id INTEGER NOT NULL REFERENCES challenges ( id ) ON DELETE CASCADE,
	player_id TEXT NOT NULL REFERENCES players ( id ) ON DELETE CASCADE,
	-- The best run's time, and when each point was passed in it, in the order passed: [ [ index, ms ] ].
	ms INTEGER NOT NULL,
	passes TEXT NOT NULL,
	vehicle TEXT NOT NULL,
	-- The page's own id for the run, so a recording of it (a ghost) can be tied to this time, and the
	-- visit it came with (the id in its token).
	run_id TEXT NOT NULL,
	visit TEXT NOT NULL,
	-- 1 when a run of the owner's visits (ADMIN_EMAILS) set it: kept off the boards.
	owner INTEGER NOT NULL DEFAULT 0,
	-- When the best was set, and when the player first finished it.
	created_at INTEGER NOT NULL,
	first_at INTEGER NOT NULL,
	-- Their place on the board once the challenge is over (its final_at), 1 the fastest; NULL before,
	-- and for the owner's.
	final_rank INTEGER,
	PRIMARY KEY ( challenge_id, player_id )
) WITHOUT ROWID;

CREATE INDEX challenge_times_board ON challenge_times ( challenge_id, owner, ms, created_at );
CREATE INDEX challenge_times_by_player ON challenge_times ( player_id, created_at );

-- The owner's choice of a period's challenge on a world, made ahead of it or for the live one:
-- the place (a featured place's id, an approved drop-in place's cell, or coordinates and a name)
-- and the kind. Used when the period's challenge is fixed; for a live one, it replaces it.
CREATE TABLE challenge_picks (
	period TEXT NOT NULL,
	world TEXT NOT NULL,
	kind TEXT NOT NULL,
	place TEXT NOT NULL,
	region TEXT NOT NULL DEFAULT '',
	lat REAL NOT NULL,
	lon REAL NOT NULL,
	heading REAL,
	created_at INTEGER NOT NULL,
	PRIMARY KEY ( period, world )
) WITHOUT ROWID;

-- Busy drop-in places (worker/drive/dropins.js) the owner has approved for the rotation, by their
-- cell (src/drive-app/dropin-cells.js), at the cell's middle and named as the admin page named it.
CREATE TABLE challenge_places (
	world TEXT NOT NULL,
	cell_row INTEGER NOT NULL,
	cell_column INTEGER NOT NULL,
	name TEXT NOT NULL,
	region TEXT NOT NULL DEFAULT '',
	lat REAL NOT NULL,
	lon REAL NOT NULL,
	created_at INTEGER NOT NULL,
	PRIMARY KEY ( world, cell_row, cell_column )
) WITHOUT ROWID;

-- When each player's last challenge time was taken: one every 10 s at most (as last_score_at is
-- for scores, kept apart so a time never holds up a stunt score or the other way round).
ALTER TABLE players ADD COLUMN last_time_at INTEGER NOT NULL DEFAULT 0;
