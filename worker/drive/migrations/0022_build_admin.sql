-- The owner's numbers for World Drive Build (the admin page's Build tab: GET /api/admin/build,
-- worker/drive/build-stats.js). Applied by the deploy (npm run deploy:drive). Only indexes: what the
-- tab asks for is read by time, a period at a time, so each of these lets a period be read without
-- reading the table through. Nothing new is kept.

-- New accounts a day (and the game's admin page's, stats.js).
CREATE INDEX accounts_by_created ON accounts ( created_at );

-- 3D map views a day, both plans together (build_views_by_day starts with the plan).
CREATE INDEX build_views_by_time ON build_views ( at );

-- MCP tool calls a day, and who's been active (mcp_calls_by_account starts with the account).
CREATE INDEX mcp_calls_by_time ON mcp_calls ( at );

-- Who's been active: projects saved in the last 30 days.
CREATE INDEX build_layouts_by_updated ON build_layouts ( updated_at );

-- Build Pro's invoices paid a day: new subscriptions, renewals and their money.
CREATE INDEX invoices_by_time ON invoices ( created_at );

-- Build Pro refunded or charged back a day.
CREATE INDEX purchases_by_refund ON purchases ( refunded_at );
