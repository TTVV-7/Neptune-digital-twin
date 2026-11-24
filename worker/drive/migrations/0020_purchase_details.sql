-- Who paid and how much of it was tax, for each purchase (worker/drive/supporter.js,
-- docs/world-drive.md). Applied by the deploy (npm run deploy:drive).
--
-- customer: the Stripe Customer the checkout made or found (cus_...), or NULL for a purchase from
-- before this, one added by hand, or a checkout Stripe sent without one. It's how a refund of a
-- monthly pass finds its purchase: a subscription's Checkout Session has no PaymentIntent, and each
-- renewal is paid by a new one, so the refunded Charge's payment_intent matches no purchase; the
-- Charge still names its customer, and so does the purchase now.
ALTER TABLE purchases ADD COLUMN customer TEXT;

-- tax: the tax in amount (total_details.amount_tax), in the currency's smallest unit (cents).
-- amount includes it: Stripe collects the sales tax as the merchant of record, so what's ours is
-- amount less tax. NULL when Stripe didn't say (and for purchases from before this).
ALTER TABLE purchases ADD COLUMN tax INTEGER;

-- taken_back_by: for a monthly pass (or Build's Pro plan) taken back by its customer, the
-- PaymentIntent of the refunded charge that did it, else NULL. That match is a best guess (the
-- Charge doesn't say which subscription it paid, if any), and the guess is wrong when the charge
-- was a one-time purchase's whose checkout Stripe hasn't delivered yet: when that checkout does
-- arrive, the purchases this names are given back, as the refund was never theirs.
ALTER TABLE purchases ADD COLUMN taken_back_by TEXT;

CREATE INDEX purchases_by_customer ON purchases ( customer );
CREATE INDEX purchases_by_taken_back_by ON purchases ( taken_back_by ) WHERE taken_back_by IS NOT NULL;
