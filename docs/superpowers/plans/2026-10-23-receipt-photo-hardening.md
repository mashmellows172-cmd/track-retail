# Receipt photo hardening implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve free on-device transcription of photographed Chilean retail receipts, including a retail receipt followed by a payment slip, with reviewable evidence and bounded mobile work.

**Architecture:** Retain self-hosted Tesseract.js and local default. Add explicit image framing/rotation and light canvas contrast preparation; use OCR layout evidence and at most one targeted retry on the same worker. Parse labeled retail sections conservatively and expose source snippets for human verification. No new cloud provider, paid API or heavy model required.

**Tech Stack:** Existing Next.js/React/TypeScript, browser Canvas, pinned Tesseract.js 7, node:test.

**Spec:** This document includes the approved autonomous design below. User explicitly requested a plan executed by OpenCode, with Codex supervising.

## Design and global constraints

- Reference layout: photographed long thermal receipt on dark background; mild skew/curl/shadow; large blank paper top; folio, CAJA and LOCAL share a header line; product description + 12/13 digit code + quantity U + right-aligned CLP price; abbreviated `Mas Protecc 3A` warranty; Subtotal Venta, I.V.A., TOTAL VENTA; FECHA/HORA; lower bank/payment slip repeats total/folio and includes card/auth/operation identifiers. Do not assume all receipts have this layout.
- All examples below are fictional. OpenCode must NOT open Downloads, original receipt images, parent work OCR result files, .env or credentials. Never send receipt bytes/text to external tools, services or model APIs. Codex alone handles the real-image local QA. Never commit personal photos/text/identifiers.
- Local OCR remains default, same-origin engine/language only. No automatic cloud switch. Keep PDF explanation and manual fallback. No sale autosave, stock mutation or changes to commissions/drafts/guided sales.
- <=4,000,000 prepared pixels, max 2 sequential recognition passes per analysis, one owned worker, same 120 s overall budget, cancellation/unmount cleanup and existing startup serialization. Free engine resources may cache; receipt content must not persist in logs/storage.
- Do not add OpenCV/PaddleOCR downloads just to name tools: Canvas + engine rotation/layout is the initial smaller solution. Full curved-paper dewarping is not promised. A second engine requires a separate measured comparison.
- Preserve existing public helper APIs or update callers/tests together. Read AGENTS.md and relevant installed Next.js guide before editing components.
- Existing clean checkout/feature branch is authorized; work in place. OpenCode implements only, no commit/push/deploy. Codex reviews/integrates/publishes.

## Review focus

1. Header folio followed by CAJA/LOCAL must not collect those numbers as additional folios.
2. A bank slip below the sale must not invent items, override retail total or promote card/authorization/operation identifiers.
3. Low confidence and inconsistent sums must remain flagged; retries must not overwrite conflicting valid amounts with a guess.
4. Cropping/rotation coordinates and evidence must reference the actual displayed/prepared image, including 90-degree turns and tiny mobile viewports.
5. Retry cancellation/timeout and missing layout output must preserve photo/manual fallback without worker overlap or stale results.

## Task 1 — Retail layout parsing and evidence

**Files:** Modify `src/lib/receiptParser.ts`; add `tests/receiptRetailLayout.test.cjs` (or focused equivalent); preserve existing tests.

**Interfaces:** Extend `ParsedPrintedReceipt` with optional typed field evidence (field key, original source line/snippet, optional normalized bounding box) and checks. `parsePrintedReceipt(text, confidence?, optionalLayout?)` must remain usable with the existing two arguments. Keep `VentaOCR` unchanged. Optional warranty years may be populated ONLY from an explicit warranty-line year token; never infer warranty type from years or brand.

- [ ] Add failing tests using FICTIONAL transcript: `FOLIO:876543210 CAJA:3 LOCAL:99`, `ARTICULO DEMO 0200012345678 1U 42000`, `Mas Protecc 3A 200009876543 18000`, `Subtotal Venta 50420`, `I.V.A. 9580`, `TOTAL VENTA 60000`, `FECHA/HORA:01/10/2026 12:34:56`, followed by `VENTA DEBITO`, repeated `TOTAL $60.000`, `BOLETA:876543210`, operation/auth/card-like numbers. Expect folio 876543210, price 42000, units1, warranty18000, total60000, date2026-10-01, caja, years3, type null.
- [ ] Add negative tests: conflicting retail totals; only payment slip (must not pretend product/warranty read); multiple product rows; negative/refund amounts; same-day repeated bank total; OCR `1U`/`IU` ambiguity (numeric correction only in a tight quantity column context, never blanket character replacements); no warranty; explicit zero warranty; header split across lines; blank/no layout; mismatched price+units+warranty vs total. Flag discrepancies without changing printed amounts or guessing a missing unit price.
- [ ] Run tests red, implement smallest parser/evidence improvements, run focused tests green. Source evidence must never associate a different receipt line with a value. No handwritten regex overfitting to personal reference numbers.

## Task 2 — Local photo preparation and bounded zonal retry

**Files:** Modify `src/lib/receiptImage.ts`, `src/lib/localReceiptOcr.ts`; create focused pure helper(s) such as `src/lib/receiptAnalysis.ts`/`receiptGeometry.ts`; add focused tests.

**Interfaces:** Add validated normalized crop coordinates and 0/90/180/270 rotation options without breaking legacy cloud preparation. Return prepared image/metadata as necessary. Extend local OCR result with optional layout/evidence and pass count. Consume real installed Tesseract API (rotateAuto/blocks/rectangle/setParameters as supported); inspect installed source/types/docs rather than assuming `words` always exists.

- [ ] Add failing tests for crop clamping/rejection, rotation/aspect, 4 MP budget on compressed images, no-canvas errors, cancellation and no new parallel workers. Keep original selection intact.
- [ ] Implement explicit framing (manual adjustable boundaries with full preview; automatic deskew only when supported safely) and light contrast/greyscale enhancement in bounded canvas. Avoid thresholding all photos destructively; allow original/optimized choice. Do not promise automatic edge detection/perspective correction unless actually implemented and tested.
- [ ] Add failing orchestration tests: baseline useful result => one pass; weak/missing critical fields with usable location => <=one targeted region retry using same worker; no layout => safe baseline/manual option; cancellation prevents retry; overall deadline includes both; contradictory fields stay pending with warning, not confidence-only winner.
- [ ] Implement staged progress and region retry only when useful. Avoid full-resolution multi-pass and guessing fixed coordinates for all receipts. Layout/TSV/blocks output must remain in memory only and tolerate missing engine metadata.
- [ ] Run focused tests green and all existing OCR/cleanup tests.

## Task 3 — Mobile review controls and transparent source data

**Files:** Modify `src/components/Scanner.tsx`; extract photo controls/result review to focused components if needed; update `src/components/ReceiptReaderStatus.tsx` only as needed; keep theme tokens.

- [ ] Add local-only easy controls: `Ajustar foto` with labelled crop boundaries or accessible equivalent, rotate, original/optimized choice, reset; at least 44px touch targets, keyboard access, no horizontal overflow at390px. Never destroy original selection. Disable adjustments during analysis and clear stale results on change.
- [ ] Keep full image preview/zoom; clearly show which image/region is analyzed. Source/evidence per field via `Ver origen` (line snippet at minimum, image crop/highlight only if coordinates actually reliable); mark uncertain/missing values. Never call heuristic checks a verified financial accuracy percentage.
- [ ] Use existing mandatory review/complete handoff; no save side effects. Support null evidence gracefully, optional warranty years, and manual correction flow.
- [ ] Verify cancel retains photo/settings, selecting a new file resets old crop/results, switching cloud never silently applies inappropriate local crops or uploads.

## Task 4 — Evaluation and delivery

**Files:** Update `docs/LECTURA_LOCAL.md` with real controls/limits. Optional generated synthetic fixture/benchmark script must contain fictitious data only and require an explicit local input for private testing.

- [ ] Test improvements on generated thermal-style fixture with header multi-labels, lower payment slip, skew/low contrast, large blank top. Add no raw real-photo fixture to Git.
- [ ] Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm audit --omit=dev --audit-level=high`, `node scripts/copy-ocr-assets.cjs --check`. Report exact evidence and unresolved limitations.
- [ ] Stop after implementation/self-review and deliver concise report to Codex: changed files, pass count, practical limits, any important findings. Do NOT commit, push, deploy, read secrets, update unrelated ledgers or create further agents.

Codex supervises via code review and local-only before/after real-photo QA, then integrates only after checks pass. One personal reference cannot establish broad OCR accuracy or Android/iPhone performance.
