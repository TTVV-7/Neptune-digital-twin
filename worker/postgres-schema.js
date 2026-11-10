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
	{
		version: 3,
		// worker/migrations/0003_placements.sql: models' positions saved from the live site.
		sql: `
			CREATE TABLE IF NOT EXISTS placements (
				url TEXT PRIMARY KEY,
				east DOUBLE PRECISION NOT NULL,
				north DOUBLE PRECISION NOT NULL,
				up DOUBLE PRECISION,
				heading DOUBLE PRECISION NOT NULL,
				updated_at BIGINT NOT NULL
			);
		`,
	},
	{
		version: 4,
		// worker/migrations/0004_shared_items.sql: items saved for everyone.
		sql: `
			CREATE TABLE IF NOT EXISTS shared_items (
				id TEXT PRIMARY KEY,
				data TEXT NOT NULL,
				created_at BIGINT NOT NULL,
				updated_at BIGINT NOT NULL
			);
		`,
	},
	{
		version: 5,
		// worker/migrations/0005_area_edits.sql: repair areas the admin moved in the twin.
		sql: `
			CREATE TABLE IF NOT EXISTS area_edits (
				model TEXT NOT NULL,
				id TEXT NOT NULL,
				data TEXT NOT NULL,
				updated_at BIGINT NOT NULL,
				PRIMARY KEY ( model, id )
			);
		`,
	},
	{
		version: 6,
		// worker/migrations/0006_area_photos.sql: photos of repair areas (the files are in R2, which
		// this copy of the site doesn't have, so the table stays empty here).
		sql: `
			CREATE TABLE IF NOT EXISTS area_photos (
				id TEXT PRIMARY KEY,
				model TEXT NOT NULL,
				area TEXT NOT NULL,
				stage TEXT NOT NULL DEFAULT '',
				taken TEXT NOT NULL DEFAULT '',
				caption TEXT NOT NULL DEFAULT '',
				width INTEGER NOT NULL DEFAULT 0,
				height INTEGER NOT NULL DEFAULT 0,
				size BIGINT NOT NULL DEFAULT 0,
				type TEXT NOT NULL DEFAULT '',
				ready INTEGER NOT NULL DEFAULT 0,
				created_at BIGINT NOT NULL
			);

			CREATE INDEX IF NOT EXISTS area_photos_by_area ON area_photos ( model, area, created_at );
		`,
	},
];
