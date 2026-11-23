-- One-time links to set a new password, made by the owner for a username's account whose owner has
-- forgotten theirs and asked by email (worker/drive/logins.js, docs/world-drive.md, "Forgotten
-- passwords"). Applied by the deploy (npm run deploy:drive). Times are milliseconds since 1970.
--
-- token_hash: the SHA-256 of the link's token (the token itself is only in the link, never kept).
-- At most one a account: making a new one deletes the one before. Used, it's deleted; past
-- expires_at, it no longer works (and is deleted with the next one made, or used).
CREATE TABLE password_resets (
	token_hash TEXT PRIMARY KEY,
	account_id INTEGER NOT NULL REFERENCES accounts ( id ) ON DELETE CASCADE,
	created_at INTEGER NOT NULL,
	expires_at INTEGER NOT NULL
);

CREATE INDEX password_resets_by_account ON password_resets ( account_id );
