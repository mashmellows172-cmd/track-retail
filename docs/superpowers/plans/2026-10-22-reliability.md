# Reliability and responsive usability implementation plan

**Goal:** Protect sales data, validate receipt inputs, and make existing workflows usable on small screens and with a keyboard.

**Architecture:** Keep Next.js, React and Supabase. Validate at API boundaries, keep database commission rules authoritative, and preserve pending sales until acknowledged. Work in a separate clone on `improve/reliability-responsive`.

**Authorization:** The user explicitly requested autonomous decisions and execution. No production database migration or deployment is included. Authentication requires knowing whether the app is shared; ask while progressing independently.

## Tasks

- [x] Validate sale fields and month filters. Test null bodies, impossible dates, negative/fractional amounts, invalid warranty years, and month boundaries. Return safe errors and avoid shared caching.
- [x] Preserve offline queue additions during sync; prevent overlapping runs. Test successful, failed, duplicate, and concurrent writes. Clearly distinguish pending local sales from database saves.
- [x] Validate OCR uploads and model output, limit file size, and avoid exposing upstream errors or receipt content in logs.
- [x] Restore zoom, Spanish language, associated form labels, touch targets, visible focus, safe areas, and responsive table/header layout. Prevent invalid warranty combinations.
- [x] Patch vulnerable dependencies without forced major downgrades. Run regression tests, TypeScript, lint, production build, and dependency audit. Document any remaining limitations.

## Review focus

Storage unavailable or malformed: preserve data and report failure; do not claim a save.
Network errors: keep pending receipts; do not silently discard rejected receipts.
Chile midnight/month boundaries: use civil dates rather than UTC for business dates.
Absent environment settings: show a controlled configuration error rather than crash during module loading.
Multi-user data: a seller name is not authentication; require a separate account/RLS migration before claiming private accounts.

## Execution record

Implemented in the isolated clone on the feature branch. The user confirmed that arbitrary local seller names should remain; no account or production database migration was introduced.

Regression evidence: null/invalid sale requests returned 500 before validation and 400 after; in-flight queue additions were deleted before and preserved after; duplicate conflicts were discarded before and retained after; invalid simulator years produced a commission before and zero after. Browser testing reproduced an incomplete draft losing its price, then verified its price survives reopening. Independent review caught stale seller data and stricter-than-needed draft validation; both were corrected. Draft restoration now validates shapes separately and never overwrites storage on mount.

Additional root causes confirmed during browser testing: blocked external icon fonts rendered raw icon names; local SVGs resolved them. At 390 px a seller button exceeded the viewport; min-width adjustment resolved the clipping. Both simulators now use the SQL-configured commission table instead of a separate 3% estimate. Unknown totals are hidden after an initial data-fetch failure.

Verification: 32 Node regression tests, ESLint and TypeScript pass. Production build and production dependency audit passed; final delivery records the latest run. Supabase/Gemini live behavior requires the user's configured credentials. The complete npm audit retains five development-only high alerts; incompatible forced downgrades were avoided.

Ruling: account usage exposes rolling five-hour and weekly percentages, not a daily token counter. The displayed windows changed during the session. No claim of exactly 50% daily usage can be verified; user was asked which available limit they intended. Do not generate unnecessary work to inflate consumption.
