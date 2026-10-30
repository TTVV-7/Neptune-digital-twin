-- World Drive's leaderboard (worker/drive/players.js and scores.js, docs/world-drive.md). Applied
-- by the deploy (npm run deploy:drive). Times are milliseconds since 1970.

-- Players: a nickname, no account. The page keeps the id and the secret; only the secret's
-- SHA-256 is kept here, so a copy of the database can't be used to post as anyone.
CREATE TABLE players (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	-- The name as names are compared: lower case, no accents, look-alike letters as one, spaces, _
	-- and - alike (nameKey in worker/drive/names.js).
	name_key TEXT NOT NULL UNIQUE,
	secret_hash TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	last_seen_at INTEGER NOT NULL,
	-- When their last score was taken: one every 10 s at most.
	last_score_at INTEGER NOT NULL DEFAULT 0
);

-- Each player's best on each board. period: 'all', 'day:2026-10-30' or 'week:2026-10-26' (the
-- Monday it starts), both UTC. place_key: '' for anywhere, else the place's name in lower case,
-- for the board of that one place. The day and week rows go after 35 days.
CREATE TABLE best_scores (
	player_id TEXT NOT NULL REFERENCES players ( id ) ON DELETE CASCADE,
	period TEXT NOT NULL,
	place_key TEXT NOT NULL,
	score INTEGER NOT NULL,
	-- The tricks of the run's best jump, as the game names them: "Backflip! + 360 Spin!".
	tricks TEXT NOT NULL,
	place TEXT NOT NULL,
	vehicle TEXT NOT NULL,
	-- The run's longest air (s).
	air_time REAL NOT NULL,
	created_at INTEGER NOT NULL,
	PRIMARY KEY ( player_id, period, place_key )
);

CREATE INDEX best_scores_board ON best_scores ( period, place_key, score DESC, created_at );
CREATE INDEX best_scores_by_age ON best_scores ( created_at ) WHERE period <> 'all';

-- Every score that changed a board, for 35 days: what to look through for a cheat, and what a
-- board can be rebuilt from once one is deleted (docs/world-drive.md).
CREATE TABLE scores (
	id INTEGER PRIMARY KEY,
	player_id TEXT NOT NULL REFERENCES players ( id ) ON DELETE CASCADE,
	score INTEGER NOT NULL,
	tricks TEXT NOT NULL,
	place TEXT NOT NULL,
	vehicle TEXT NOT NULL,
	air_time REAL NOT NULL,
	run_seconds INTEGER NOT NULL,
	-- The visit it came with (the id in its token).
	visit TEXT NOT NULL,
	created_at INTEGER NOT NULL
);

CREATE INDEX scores_by_player ON scores ( player_id, created_at );
CREATE INDEX scores_by_age ON scores ( created_at );

-- Which player each visit has made or posted for: one visit, one player. Gone once the visit's
-- token has run out.
CREATE TABLE visits (
	id TEXT PRIMARY KEY,
	player_id TEXT NOT NULL REFERENCES players ( id ) ON DELETE CASCADE,
	expires_at INTEGER NOT NULL
);

CREATE INDEX visits_by_expiry ON visits ( expires_at );
