-- Changes the admin made to a model's structure in the twin, saved with the edit passcode (see
-- worker/model-edits.js): per model and id, a beam added or a face painted, as JSON.
CREATE TABLE model_edits (
	model TEXT NOT NULL,
	id TEXT NOT NULL,
	data TEXT NOT NULL,
	updated_at INTEGER NOT NULL,
	PRIMARY KEY ( model, id )
);
