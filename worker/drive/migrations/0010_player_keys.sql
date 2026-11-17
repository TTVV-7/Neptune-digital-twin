-- One player an account, on every device (worker/drive/accounts.js's accountPlayer,
-- docs/world-drive.md "One player on every device"). Applied by the deploy (npm run deploy:drive).
-- Times are milliseconds since 1970.
--
-- A player's secret is kept only as its SHA-256 (players.secret_hash), so it can't be handed to
-- another browser. Instead, a browser signed in to the account the player is linked to is given a
-- key of its own: another secret for the same player, kept the same way. Each works as the
-- player's secret does, everywhere it's checked (players.js's secretMatches); the newest
-- KEYS_MOST a player are kept, the older ones dropped as new ones are made, and a player removed
-- takes its keys with it.
CREATE TABLE player_keys (
	secret_hash TEXT PRIMARY KEY,
	player_id TEXT NOT NULL REFERENCES players ( id ) ON DELETE CASCADE,
	created_at INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX player_keys_player ON player_keys ( player_id, created_at );
