-- Where people drop in, for the owner's admin page (worker/drive/dropins.js, docs/world-drive.md
-- "Where people drop in"): counts a day of the cells, about a kilometre each way, that drop-ins were
-- at, never anyone's own. Applied by the deploy (npm run deploy:drive).

-- One row a UTC day ('2026-11-16'), world ('earth' or 'moon') and cell of its grid
-- (src/drive-app/dropin-cells.js: the row from the south pole, the column eastward from 180° W): `n`
-- the visitors counted there that day (each once a day at a cell). A new count is an upsert of its
-- row. Keyed by the world first, then the day, so a look at one world's period (the admin page's,
-- dropins.js's cellsQuery) reads that world's rows for those days and no others. Kept as long as
-- stats_daily keeps its rows: 730 days (admin.js, KEEP_DAYS).
CREATE TABLE dropins_daily (
	day TEXT NOT NULL,
	world TEXT NOT NULL,
	cell_row INTEGER NOT NULL,
	cell_column INTEGER NOT NULL,
	n INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY ( world, day, cell_row, cell_column )
) WITHOUT ROWID;
