// The database on Postgres (Vercel with Neon, see postgres.js): the same tables as
// worker/migrations/*.sql make in D1, in Postgres's dialect. Times are milliseconds since 1970 in
// BIGINT columns, and ids count up by themselves (identity) as SQLite's INTEGER PRIMARY KEY does.
//
// postgres.js applies these by itself, in a transaction, the first time an instance touches a
// database that doesn't have them yet, and notes each version in schema_version. Two instances
// starting at once may both try, so every statement must be safe to run twice (IF NOT EXISTS).
// A change to the tables is a new D1 migration file and a new entry here with the next version.

export const MIGRATIONS = [
	{
		version: 1,
		// worker/migrations/0001_init.sql: accounts and cloud layouts.
		sql: `
			CREATE TABLE IF NOT EXISTS users (
				id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
				google_sub TEXT NOT NULL UNIQUE,
				email TEXT NOT NULL,
				name TEXT NOT NULL DEFAULT '',
				given_name TEXT NOT NULL DEFAULT '',
				picture TEXT NOT NULL DEFAULT '',
				hosted_domain TEXT NOT NULL DEFAULT '',
				created_at BIGINT NOT NULL,
				last_login_at BIGINT NOT NULL
			);

			CREATE TABLE IF NOT EXISTS sessions (
				token_hash TEXT PRIMARY KEY,
				user_id BIGINT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
				created_at BIGINT NOT NULL,
				expires_at BIGINT NOT NULL
			);

			CREATE INDEX IF NOT EXISTS sessions_by_user ON sessions ( user_id );
			CREATE INDEX IF NOT EXISTS sessions_by_expiry ON sessions ( expires_at );

			CREATE TABLE IF NOT EXISTS layouts (
				id TEXT PRIMARY KEY,
				user_id BIGINT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
				site TEXT NOT NULL,
				name TEXT NOT NULL,
				data TEXT NOT NULL,
				share_token TEXT UNIQUE,
				created_at BIGINT NOT NULL,
				updated_at BIGINT NOT NULL
			);

			CREATE INDEX IF NOT EXISTS layouts_by_owner ON layouts ( user_id, site, updated_at DESC );
		`,
	},
	{
		version: 2,
		// worker/migrations/0002_premium.sql: premium bought through the Stripe Payment Link.
		sql: `
			CREATE TABLE IF NOT EXISTS purchases (
				checkout_session TEXT PRIMARY KEY,
				user_id BIGINT REFERENCES users ( id ) ON DELETE SET NULL,
				email TEXT NOT NULL DEFAULT '',
				payment_intent TEXT,
				created_at BIGINT NOT NULL,
				refunded_at BIGINT
			);

			CREATE INDEX IF NOT EXISTS purchases_by_user ON purchases ( user_id );
			CREATE INDEX IF NOT EXISTS purchases_by_email ON purchases ( email );
			CREATE INDEX IF NOT EXISTS purchases_by_payment ON purchases ( payment_intent );
		`,
	},
];
