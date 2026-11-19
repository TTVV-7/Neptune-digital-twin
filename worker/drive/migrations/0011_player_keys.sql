-- One player for an account, on every device (worker/drive/accounts.js's accountPlayer,
-- docs/world-drive.md "Accounts"). Applied by the deploy (npm run deploy:drive). Times are
-- milliseconds since 1970.

-- More secrets for a player: one for each browser the account's player was handed to as it signed
-- in there. The player's own secret_hash stays the first browser's, so it carries on as it was. Only
-- the SHA-256 of each secret is kept, as for the player's own; a player deleted takes its keys
-- with it.
CREATE TABLE player_keys (
	secret_hash TEXT PRIMARY KEY,
	player_id TEXT NOT NULL REFERENCES players ( id ) ON DELETE CASCADE,
	created_at INTEGER NOT NULL
);

CREATE INDEX player_keys_by_player ON player_keys ( player_id );
