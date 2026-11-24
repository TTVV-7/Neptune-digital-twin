-- World Drive Build Pro's company logo (worker/drive/build.js): one per account, shown on the
-- equipment in its projects (src/logo.js), and on their share links. The image as uploaded after the
-- editor redrew it as a PNG or WebP of 512 px at most (no SVG: nothing in it can run).
CREATE TABLE build_logos (
	account_id INTEGER PRIMARY KEY REFERENCES accounts ( id ) ON DELETE CASCADE,
	type TEXT NOT NULL,
	data BLOB NOT NULL,
	updated_at INTEGER NOT NULL
);
