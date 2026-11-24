-- How much of each purchase was tax (worker/drive/supporter.js's recordPurchase; the admin page's
-- money, stats.js). Applied by the deploy (npm run deploy:drive).
--
-- tax: the Checkout Session's total_details.amount_tax, in the currency's smallest unit (cents).
-- amount includes it: Stripe collects the sales tax or VAT as the merchant of record (Managed
-- Payments), so what's World Drive's is amount less tax. NULL when Stripe didn't say, and for
-- purchases from before this.
ALTER TABLE purchases ADD COLUMN tax INTEGER;
