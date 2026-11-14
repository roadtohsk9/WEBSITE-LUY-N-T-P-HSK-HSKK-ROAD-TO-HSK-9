# Store + PRO + Personal Learning Update

- Added `/store.html` with PRO and digital-material catalogs, persistent cart, quantity controls, and a left task rail linking store, cart, owned documents, personalization, HSK6 mock exam, and home.
- Added `/checkout.html` with server-priced order creation, per-item VAT calculation, total payable, bank details, transfer memo, dynamic VietQR image, and payment-state polling.
- Added default ROAD PRO plans (39,000 VND / 30 days; 99,000 VND / 90 days; 399,000 VND / 365 days), seeded once by slug; Admin can edit/customize products.
- Added Admin store product/document management with image upload, private document file upload, publish/unpublish controls, order monitoring, and manual reconciliation.
- Added SePay inbound webhook verification using HMAC-SHA256 or API key, transaction de-duplication, exact amount/account/memo matching, immediate PRO entitlement extension and document unlock.
- Private document downloads now require a logged-in candidate and a matching `document_access` row.
- Added configurable global/per-product VAT rates and order snapshots.
- Added top-left and floating PRO CTAs for non-PRO accounts; the upsell is hidden for active PRO accounts.
- Added daily study goals, session logging, 25-minute focus timer, daily tasks, consecutive-day streak, 7-day rhythm, and data-based revision hints to Personalization.
- Added setup documentation: `PAYMENTS_SEPAY_SETUP_VI.md` and `STORE_ADMIN_GUIDE_VI.md`.
