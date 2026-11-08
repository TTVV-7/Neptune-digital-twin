-- Where models from MODELS in src/config.js stand, saved from the live site with the edit
-- passcode (see worker/placements.js). One row per model file; up is NULL for "on the ground".
CREATE TABLE placements (
	url TEXT PRIMARY KEY,
	east REAL NOT NULL,
	north REAL NOT NULL,
	up REAL,
	heading REAL NOT NULL,
	updated_at INTEGER NOT NULL
);
