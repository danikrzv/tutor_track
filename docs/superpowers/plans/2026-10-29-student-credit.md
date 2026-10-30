# Student credit implementation plan

**Goal:** Apply received money to past and future lessons at recorded prices, as explicitly selected by the user; the reported USD 330 has been received.
**Approach:** One student account per currency, with completed lessons as charges and payments as credit. Pack names/quantities describe a top-up, not a different lesson type. Pending top-ups are tracked separately from lesson debt. Preserve direct payments; allocate pooled credit oldest-first. Do not convert money between currencies.
**Migration:** Back up existing database; preserve payment IDs and references. Former pack lessons have no recorded price, so assign their agreed pack price divided by quantity (currency rounding), keep provenance separately, and remove scheduling restrictions. Existing paid packs become credit without a second receipt. Unpaid packs do not become received money.
**Execution:** Inline in current workspace; preserve unrelated edits. User's explicit selection authorizes this behavior; no additional design approval needed.

- [x] Add regression tests for USD 330 credit, oldest-first/partial allocation, future lessons, undo, currency isolation, migration idempotence, and export.
- [x] Implement billing.py account calculation and server migration/payment endpoints; reject obsolete pack lesson scheduling.
- [x] Update forms, balance labels, lesson status, accounts and pack/top-up screens to use server ledger.
- [x] Run Python/frontend suites, inspect actual pack/payment records read-only, and apply the authorized receipt only if missing and uniquely identified.
- [x] Review, update docs, restart local app safely, verify data and hand off.

## Verification
- All 37 Python tests pass, including desktop host integration outside the socket-restricted sandbox. JavaScript syntax and frontend rendering/form tests pass. Diff whitespace check passes.
- Independent review found no blocking issues. Added mixed legacy pack/direct-payment migration regression and updated README per review.
- Live app launched updated server and migrated the original database with backup. Existing USD 330 receipt was already present: no additional receipt entered. Student 2 account: USD 150 completed lessons, USD 330 received, USD 180 credit, zero due. SQLite integrity check: ok.
- Native UI verified Packs & credit balance, payment-received form, normal lesson rate and automatic-credit hint. Test forms cancelled without saving. App left open on Packs & credit.
- No native wrapper rebuild needed: installed wrapper loads the project server and static assets. No student/lesson/payment data manually edited; migration preserves receipts.
