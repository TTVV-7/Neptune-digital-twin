-- World Drive Build: where each saved project is (worker/drive/build.js), so the dashboard (/build/)
-- can open it there. Taken from the layout's own lat and lon as it's saved; NULL for none.
ALTER TABLE build_layouts ADD COLUMN lat REAL;
ALTER TABLE build_layouts ADD COLUMN lon REAL;
