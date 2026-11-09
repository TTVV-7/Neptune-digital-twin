-- Items the admin saved for everyone with the edit passcode (see worker/shared-items.js): each
-- the JSON config the app places it from.
CREATE TABLE shared_items (
	id TEXT PRIMARY KEY,
	data TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);
