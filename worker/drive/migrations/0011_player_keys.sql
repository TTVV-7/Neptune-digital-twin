-- One player for an account, on every device (worker/drive/accounts.js's accountPlayer,
-- docs/world-drive.md "Accounts"). Applied by the deploy (npm run deploy:drive). Times are
-- milliseconds since 1970.

-- More secrets for a player: one for each browser the account's player was handed to as it signed
-- in there. The player's own secret_hash stays the first browser's, so it carries on as it was. Only
-- the SHA-256 of each secret is kept, as for the player's own; a player deleted takes its keys
-- with it. A key is the account's that it was handed to (`account_id`), and goes as that browser
-- signs out (DELETE /api/session sends it), or as the account signs out everywhere, or is deleted.
--
-- The live database may already have a player_keys table without account_id: an earlier version of
-- this (a 0010_player_keys.sql deployed by hand from another branch, never merged) made one, and a
-- browser may hold a key in it. So: made if it isn't there, then rebuilt with account_id, its keys
-- kept (each its player's account, or NULL for a player with none: such a key is only ever deleted
-- with its player).
CREATE TABLE IF NOT EXISTS player_keys (
	secret_hash TEXT PRIMARY KEY,
	player_id TEXT NOT NULL REFERENCES players ( id ) ON DELETE CASCADE,
	created_at INTEGER NOT NULL
) WITHOUT ROWID;

CREATE TABLE player_keys_with_accounts (
	secret_hash TEXT PRIMARY KEY,
	player_id TEXT NOT NULL REFERENCES players ( id ) ON DELETE CASCADE,
	account_id INTEGER REFERENCES accounts ( id ) ON DELETE CASCADE,
	created_at INTEGER NOT NULL
);

INSERT INTO player_keys_with_accounts ( secret_hash, player_id, account_id, created_at )
	SELECT k.secret_hash, k.player_id, p.account_id, k.created_at FROM player_keys k JOIN players p ON p.id = k.player_id;

DROP TABLE player_keys;

ALTER TABLE player_keys_with_accounts RENAME TO player_keys;

CREATE INDEX player_keys_by_player ON player_keys ( player_id );
CREATE INDEX player_keys_by_account ON player_keys ( account_id );
