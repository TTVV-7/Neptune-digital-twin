-- Play stats for the owner's admin page (worker/drive/stats.js, docs/world-drive.md "Play stats"):
-- counts a day, never anyone's own. Applied by the deploy (npm run deploy:drive).

-- One row a UTC day ('2026-11-08'), metric ('play', 'dropin', 'garage_edit'...) and key (a ride, a
-- start spot, a Garage part, a referring site...): `n` how many, or for a time, how many seconds or
-- milliseconds. A new count is an upsert of its row. Kept 400 days.
CREATE TABLE stats_daily (
	day TEXT NOT NULL,
	metric TEXT NOT NULL,
	key TEXT NOT NULL,
	n INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY ( day, metric, key )
) WITHOUT ROWID;
