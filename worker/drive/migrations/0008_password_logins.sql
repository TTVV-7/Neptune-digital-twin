-- Username and password accounts (worker/drive/logins.js, docs/world-drive.md "Username and
-- password accounts"): signing in with a username and a password, beside Google's sign-in, to the
-- same accounts. Applied by the deploy (npm run deploy:drive). Times are milliseconds since 1970.
--
-- An account made with a username has no Google account, but accounts.google_sub can't be made
-- nullable without building the table again, and in D1 dropping it would run its ON DELETE actions
-- (every session deleted, every purchase and player let go of). So such an account's google_sub is
-- 'none:' and a random token (logins.js's NO_GOOGLE), which no Google id looks like, and its email
-- and name are ''. Nothing else about the person is kept: no email, no address.

-- One row an account that has a username and password: the username as its owner typed it (NFKC)
-- and as usernames are compared (in lower case, unique), and the password's PBKDF2-SHA-256 with its
-- own random salt and the iterations it was made with (so the count can be raised later: a password
-- made with fewer is hashed again at its next sign-in). The hash and the salt are base64url.
CREATE TABLE logins (
	account_id INTEGER PRIMARY KEY REFERENCES accounts ( id ) ON DELETE CASCADE,
	username TEXT NOT NULL,
	username_key TEXT NOT NULL UNIQUE,
	password_hash TEXT NOT NULL,
	salt TEXT NOT NULL,
	iterations INTEGER NOT NULL,
	created_at INTEGER NOT NULL,
	-- When the password was last set (made, changed or hashed again).
	changed_at INTEGER NOT NULL
);
