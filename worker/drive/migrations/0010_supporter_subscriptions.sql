-- The Supporter Pass as a subscription (worker/drive/supporter.js, docs/world-drive.md). Applied by
-- the deploy (npm run deploy:drive). Times are milliseconds since 1970.
--
-- Passes bought before this (one-time payments, subscription NULL) are legacy passes: they keep the
-- pass for good, as they always did. A purchase made through the subscription Payment Link has the
-- subscription's id, and its pass lasts while that subscription is active.
ALTER TABLE purchases ADD COLUMN subscription TEXT;

CREATE INDEX purchases_by_subscription ON purchases ( subscription );

-- Each subscription's status as Stripe last told us (customer.subscription.created, .updated,
-- .deleted), whether or not its checkout has arrived yet: Stripe doesn't promise events in order.
-- status: Stripe's ('active', 'trialing', 'past_due', 'canceled', 'unpaid', ...). event_at: when
-- Stripe made the event that set it (ms), so an older event arriving late never undoes a newer one.
CREATE TABLE subscriptions (
	id TEXT PRIMARY KEY,
	status TEXT NOT NULL,
	event_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);
