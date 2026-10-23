# Free local receipt OCR — 23 October 2026

## Decision

User requests a useful free AI reader, strategy executed by OpenCode and final verified report. No new API keys exist. Choose Tesseract.js neural OCR in the browser as default: no per-reading API fee, no required cloud account, no receipt photo sent to a provider. This is OCR plus conservative field extraction, not an LLM and not a measured accuracy winner. Cloud free tiers remain quota-limited and key-dependent; don't silently call them under a free-local label.

## Design and acceptance

1. Lazy-load Tesseract.js only on explicit local analysis. Use browser worker/WASM and Spanish language data, all self-hosted same origin with pinned package versions, license and reproducible asset-copy script in build. Never send receipt bytes/text to remote hosts. No CDN runtime dependencies or service fallback.
2. Local recognition cancellable on cancel/unmount/time limit. Terminate owned workers including late startup; do not create overlapping workers or retain receipts in caches/logs. Cache engine/language resources only using supported engine mechanisms. Show actual download/loading/recognition progress with a first-load explanation, no fake percent. Mobile memory bound: safe image dimensions and avoid full-resolution multipass OCR.
3. Parse printed Chilean retail receipts conservatively. Folio/date/product price/units/warranty/total/channel/order with null unknowns. Exclude IVA, subtotal, RUT, barcode and card/account/payment numbers from amounts or folio candidates. Require explicit labels/context, preserve ambiguity as null and never claim an empty receipt was read. Prefer leaving a product price unknown over guessing from total/IVA. Manual confirmation is mandatory. Do not infer detailed warranty type/years without evidence.
4. Local is default. Optional existing cloud flow may remain as a separately selected, clearly labeled mode whose free tier/cost cannot be guaranteed. No automatic switch to cloud on local failure. PDF unsupported locally must explain using an image or manual entry; no hidden upload. Preserve selected photo on failure/cancel and full preview/zoom.
5. Focused tests before code: Chilean pesos/date labels, ambiguity, false totals/identifiers, unsupported/blank inputs, abort/late worker cleanup, repeated analysis. Parent will verify actual synthetic printed receipt recognition in browser, full tests/lint/types/build, review and publish. No personal receipt data or provider billing calls.

## Ownership

OpenCode owns all implementation for local OCR: parser/helper/tests, engine wrapper/tests, Scanner integration and ReceiptReaderStatus wording, package files and build asset generation/config if necessary. May add a new local-only control component. Don't edit guided sale/registration/draft logic. Don't read .env, credentials, personal spreadsheets/receipts. No commits/push/deploy.

Codex coordinates, reviews, verifies actual browser OCR using a generated fictitious receipt, updates public docs and integrates/publishes after checks. Existing branch checkout used with prior autonomous-work authorization.
