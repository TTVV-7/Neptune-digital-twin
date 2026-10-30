-- Accounts and cloud layouts (see worker/index.js). Times are milliseconds since 1970.

-- People who have signed in with Google, keyed by Google's account id (sub), which never
-- changes even if their email does.
CREATE TABLE users (
	id INTEGER PRIMARY KEY,
	google_sub TEXT NOT NULL UNIQUE,
	email TEXT NOT NULL,
	name TEXT NOT NULL DEFAULT '',
	given_name TEXT NOT NULL DEFAULT '',
	picture TEXT NOT NULL DEFAULT '',
	-- Google Workspace domain (the hd claim), used by ALLOWED_DOMAINS.
	hosted_domain TEXT NOT NULL DEFAULT '',
	created_at INTEGER NOT NULL,
	last_login_at INTEGER NOT NULL
);

-- Signed-in browsers. Only the SHA-256 of each session token is kept, so a copy of the
-- database can't be used to sign in as anyone.
CREATE TABLE sessions (
	token_hash TEXT PRIMARY KEY,
	user_id INTEGER NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
	created_at INTEGER NOT NULL,
	expires_at INTEGER NOT NULL
);

CREATE INDEX sessions_by_user ON sessions ( user_id );
CREATE INDEX sessions_by_expiry ON sessions ( expires_at );

-- Saved layouts: data is the layout JSON from layout.getData() in the app. share_token is set
-- while the layout is shared by link.
CREATE TABLE layouts (
	id TEXT PRIMARY KEY,
	user_id INTEGER NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
	site TEXT NOT NULL,
	name TEXT NOT NULL,
	data TEXT NOT NULL,
	share_token TEXT UNIQUE,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

CREATE INDEX layouts_by_owner ON layouts ( user_id, site, updated_at DESC );
