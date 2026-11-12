-- Photos of a model's repair areas (see worker/area-photos.js): what each shows. The files
-- themselves are in the PHOTOS bucket (R2), under model/area/id/.
CREATE TABLE area_photos (
	id TEXT PRIMARY KEY,
	model TEXT NOT NULL,
	area TEXT NOT NULL,
	stage TEXT NOT NULL DEFAULT '',
	taken TEXT NOT NULL DEFAULT '',
	caption TEXT NOT NULL DEFAULT '',
	width INTEGER NOT NULL DEFAULT 0,
	height INTEGER NOT NULL DEFAULT 0,
	size INTEGER NOT NULL DEFAULT 0,
	type TEXT NOT NULL DEFAULT '',
	ready INTEGER NOT NULL DEFAULT 0,
	created_at INTEGER NOT NULL
);

CREATE INDEX area_photos_by_area ON area_photos ( model, area, created_at );
