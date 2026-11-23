-- Feature requests sent from the account panel (worker/drive/requests.js, docs/world-drive.md,
-- "Feature requests"), listed on the owner's admin page. Applied by the deploy (npm run deploy:drive).
-- Times are milliseconds since 1970.
--
-- text: what was asked for, as typed (trimmed, at most 1,000 characters). account_id: who sent it
-- (a signed-in account; deleting the account leaves the request, without it). name: the account's
-- player's nickname as it was then, or its username, for the list. done_at: when the owner marked it
-- done, or NULL.
CREATE TABLE feature_requests (
	id INTEGER PRIMARY KEY,
	account_id INTEGER REFERENCES accounts ( id ) ON DELETE SET NULL,
	name TEXT NOT NULL DEFAULT '',
	text TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	done_at INTEGER
);

CREATE INDEX feature_requests_by_time ON feature_requests ( created_at );
