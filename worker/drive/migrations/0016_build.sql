-- World Drive Build (/build/: the construction mock-up app on World Drive's accounts, worker/drive/
-- build.js, docs/build.md). Applied by the deploy (npm run deploy:drive). Times are milliseconds
-- since 1970.
--
-- Build Pro is a purchase like the Supporter Pass's, through its own Payment Link
-- (BUILD_PAYMENT_LINK_ID), kept in purchases with pass = 'build' (a kind the Supporter Pass never
-- counts: supporter.js's livePurchase takes only NULL and 'day'), its subscription's status in
-- subscriptions as the pass's is.

-- Saved projects (layouts): data is the construction app's layout JSON (layout.getData()), site the
-- place it's at. share_token is set while the project is shared by link.
CREATE TABLE build_layouts (
	id TEXT PRIMARY KEY,
	account_id INTEGER NOT NULL REFERENCES accounts ( id ) ON DELETE CASCADE,
	site TEXT NOT NULL,
	name TEXT NOT NULL,
	data TEXT NOT NULL,
	share_token TEXT UNIQUE,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

CREATE INDEX build_layouts_by_owner ON build_layouts ( account_id, site, updated_at DESC );

-- Each 3D map view (a page that was handed the Maps key: one billed Google 3D tiles session), by
-- the account it's counted against and its plan then ('free' or 'pro'; the owner's aren't kept),
-- for the monthly allowances and the day's cap on free views for everyone together.
CREATE TABLE build_views (
	account_id INTEGER NOT NULL REFERENCES accounts ( id ) ON DELETE CASCADE,
	tier TEXT NOT NULL,
	at INTEGER NOT NULL
);

CREATE INDEX build_views_by_account ON build_views ( account_id, at );
CREATE INDEX build_views_by_day ON build_views ( tier, at );
