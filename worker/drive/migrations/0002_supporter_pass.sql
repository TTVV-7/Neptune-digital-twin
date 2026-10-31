-- The Supporter Pass (worker/drive/accounts.js and supporter.js, docs/world-drive.md): Google
-- sign-in, and the passes bought through the Stripe Payment Link, recorded by Stripe's webhook.
-- Applied by the deploy (npm run deploy:drive). Times are milliseconds since 1970.

-- Who has signed in with Google. sub is Google's id for the account, which never changes; the email
-- (in lower case, checked by Google) and the name are as Google last gave them.
CREATE TABLE accounts (
	id INTEGER PRIMARY KEY,
	google_sub TEXT NOT NULL UNIQUE,
	email TEXT NOT NULL,
	name TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	last_login_at INTEGER NOT NULL
);

CREATE INDEX accounts_by_email ON accounts ( email );

-- Signed-in browsers: only the SHA-256 of each session cookie's token is kept, so a copy of the
-- database can't be used to sign in as anyone. 30 days each.
CREATE TABLE sessions (
	token_hash TEXT PRIMARY KEY,
	account_id INTEGER NOT NULL REFERENCES accounts ( id ) ON DELETE CASCADE,
	created_at INTEGER NOT NULL,
	expires_at INTEGER NOT NULL
);

CREATE INDEX sessions_by_account ON sessions ( account_id );
CREATE INDEX sessions_by_expiry ON sessions ( expires_at );

-- Passes bought, one row per Stripe Checkout Session, so the same event arriving twice changes
-- nothing. The owner can add one by hand to give someone the pass (docs/world-drive.md).
CREATE TABLE purchases (
	checkout_session TEXT PRIMARY KEY,
	-- Whose it is: the account the page named on the link (client_reference_id). NULL when it
	-- didn't: then it's whoever signs in with the email paid with, which Google has checked is theirs.
	account_id INTEGER REFERENCES accounts ( id ) ON DELETE SET NULL,
	email TEXT NOT NULL DEFAULT '',
	-- What was paid, in the currency's smallest unit (cents), and the currency ('cad').
	amount INTEGER,
	currency TEXT,
	-- How a refund or a chargeback finds the purchase.
	payment_intent TEXT,
	-- 'paid', 'refunded', 'disputed' (charged back), or what the owner wrote by hand ('granted').
	status TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	-- Set when the money is taken back (refunded in full, or charged back), which takes the pass
	-- away again; cleared if a chargeback is won.
	refunded_at INTEGER
);

CREATE INDEX purchases_by_account ON purchases ( account_id );
CREATE INDEX purchases_by_email ON purchases ( email );
CREATE INDEX purchases_by_payment ON purchases ( payment_intent );

-- Every payment taken back, by its PaymentIntent, whether or not its purchase is here yet: Stripe
-- doesn't promise to deliver events in order, and a checkout retried after its refund arrived must
-- come in already taken back. status: 'refunded', or 'disputed' while a chargeback has the money.
CREATE TABLE reversals (
	payment_intent TEXT PRIMARY KEY,
	status TEXT NOT NULL,
	created_at INTEGER NOT NULL
);

-- The account a leaderboard player belongs to, once someone signed in links this browser's player
-- (POST /api/player/link): a supporter's players have a ⭐ by their name.
ALTER TABLE players ADD COLUMN account_id INTEGER REFERENCES accounts ( id ) ON DELETE SET NULL;

CREATE INDEX players_by_account ON players ( account_id );
