-- An email a username's account gives for its receipts (worker/drive/logins.js, docs/world-drive.md).
-- Applied by the deploy (npm run deploy:drive).
--
-- contact_email: typed in by the account's owner and never checked, so it's kept apart from email
-- (Google's, which Google has checked is theirs): it's only put on the Stripe checkout so the
-- receipt goes there, and never makes a purchase anyone's (purchases follow the account named on
-- the link, or a Google email). '' for none.
ALTER TABLE accounts ADD COLUMN contact_email TEXT NOT NULL DEFAULT '';
