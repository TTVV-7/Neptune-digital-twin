-- The 24-hour pass beside the lifetime Supporter Pass (worker/drive/supporter.js,
-- docs/world-drive.md). Applied by the deploy (npm run deploy:drive). Times are milliseconds since
-- 1970.
--
-- pass: what a purchase bought. NULL is the pass for good (a lifetime pass, a legacy one-time pass,
-- or a subscription's, which lasts while its subscription does), as every purchase before this was.
-- 'day' is a 24-hour pass, bought through DAY_PASS_PAYMENT_LINK: it gives the pass from created_at
-- for 24 hours, then nothing.
ALTER TABLE purchases ADD COLUMN pass TEXT;
