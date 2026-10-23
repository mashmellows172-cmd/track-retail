# Guided sale and OCR readiness — 23 October 2026

Scope: implement the recommended first two improvements accepted by the user. Work in the existing feature checkout; OpenCode performs assigned implementation, Codex reviews and verifies. No alternate OCR credentials exist: do not claim an active backup or measured provider superiority.

## Design

Add a guided sale panel to the selected product detail, using current stock and existing warranty commission tables. Product price remains editable; stock is advisory, not a reservation. One unit requires checking exhibition/return state; zero/negative must warn, without claiming online availability. Show sale channel, quantity, warranty amount/type/years, total and warranty commission estimate. Unsupported categories require explicit warranty type selection. No base-product commission should be invented.

Prepare registration through a short-lived sessionStorage handoff, not a URL full of financial details. The registration page consumes and validates this handoff, shows product reference context and initial editable values in the existing confirmation form. Never overwrite an unrelated existing sale draft silently. Do not submit a sale automatically or decrease stock. Product price is unit price; confirm how existing quantity/total validation works and retain consistent semantics.

OCR work: retain current configured-provider architecture, improve readiness feedback safely (names/availability only, never keys), explain when no independent backup is active, and add a local evaluation workflow using anonymized fixtures and mocked tests. Do not send real receipts to any provider or invent keys.

## Tasks

1. OpenCode owns new guided-sale helper + tests + component, catalog integration, registration handoff + confirmation-form initialization contract. Add meaningful helper regression tests first. Run focused tests/lint/types. No commits/push/deploy/secrets/network services.
2. Codex owns OCR readiness endpoint/UI and tests, documentation. No overlapping edits with OpenCode Scanner/receipt helpers.
3. Codex reviews all diffs, tests cancellation/draft preservation/invalid amounts/stale handoff, runs full tests/lint/types/build, verifies browser manual flow without saving test sales. Publish after checks.

## Verification outcome

- OpenCode implemented the guided-sale flow and corrected storage adoption based on independent review.
- Codex added quantity-shortage advice, persistent product context, autosave-failure feedback, OCR readiness/status and an opt-in anonymized benchmark CLI.
- 98 tests pass. Full lint, TypeScript and production build pass.
- Browser checks: 390px layout, quantity>stock warning, total/commission handoff, explicit draft conflict, replacement retained without editing, reentry retaining product context. No test sales saved and no provider benchmark calls made.
- External OCR backup activation remains dependent on a server API key. No provider performance/accuracy winner claimed.
