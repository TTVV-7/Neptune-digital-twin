-- Premium equipment bought through the Stripe Payment Link (see worker/premium.js), recorded by
-- Stripe's webhook. One row per Checkout Session, so the same event arriving twice changes nothing.
CREATE TABLE purchases (
	checkout_session TEXT PRIMARY KEY,
	-- Whose it is: the account the app named on the link, else the account with the email paid
	-- with. NULL until someone signs in with that email, who then has it.
	user_id INTEGER REFERENCES users ( id ) ON DELETE SET NULL,
	email TEXT NOT NULL DEFAULT '',
	-- How a refund (charge.refunded) finds the purchase.
	payment_intent TEXT,
	created_at INTEGER NOT NULL,
	-- Set by a full refund, which takes premium away again.
	refunded_at INTEGER
);

CREATE INDEX purchases_by_user ON purchases ( user_id );
CREATE INDEX purchases_by_email ON purchases ( email );
CREATE INDEX purchases_by_payment ON purchases ( payment_intent );
