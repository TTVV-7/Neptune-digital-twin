-- Repair areas the admin moved in the twin, saved with the edit passcode (see
-- worker/area-edits.js): per model and area id, its outline and normal as JSON.
CREATE TABLE area_edits (
	model TEXT NOT NULL,
	id TEXT NOT NULL,
	data TEXT NOT NULL,
	updated_at INTEGER NOT NULL,
	PRIMARY KEY ( model, id )
);
