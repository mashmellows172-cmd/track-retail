# Stock catalog implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement task by task.

**Goal:** Import the original stock report, find products by barcode, and distinguish store availability from online references.
**Architecture:** Local XLSX parsing in a worker; validated snapshots stored atomically in IndexedDB. Catalog is separate from sales. Camera decoding is local and lazy loaded.
**Tech Stack:** Next.js, React, TypeScript, SheetJS, ZXing, IndexedDB, existing design tokens.
**Spec:** User-approved design in this chat: stock, scanning, ABC references, and independent card commission categories.

## Global constraints
- Never upload or commit the stock file, its cost column, or extracted private records.
- Preserve PLU/barcode strings and alternate barcodes. Never add duplicate stock counts.
- Available quantity determines channel suggestion; online stock is unconfirmed.
- One unit means verify condition, never automatically unsellable.
- Keep existing commission tables and sales unchanged.
- Missing brand, warranty and web price remain unconfirmed, never invented.

## Review focus
- Repeated report headings and a product split across spreadsheet cells.
- Conflicting duplicate PLUs must reject the import rather than silently overwrite.
- Failed storage must preserve the previous snapshot.
- EAN-13 scans must match zero-padded report codes.
- Camera must stop on close/navigation; manual lookup remains available.

## Tasks
- [x] Test then implement report parser, aliases, dates, duplicates, stock rules and search.
- [x] Add worker import, preview and IndexedDB storage with prior-price comparison.
- [x] Add responsive catalog, filters, barcode scanner, product detail and ABC link.
- [x] Test then implement independent editable card base and activated totals.
- [x] Verify with the real workbook locally, tests, lint, types, build and browser. Review branch before publishing.

## Design decisions
UI/UX Pro Max flat-design recommendations fit a work catalog: semantic stock badges, large touch targets, visible labels, restrained decoration and pagination. Keep existing typography/colors for consistency; marketing showcase recommendations do not fit this internal workflow.
Local storage is a first increment, explicitly labeled per device. Sharing stock between devices requires a later authenticated store boundary.

## Verification and review ledger
- Real report parsed locally: unique products, split-cell product, repeated PLUs and alternate barcodes reconciled to independent Python extraction. No source records are committed.
- OpenCode performed a limited read-only parser review with a free model; no workbook or credentials were supplied. Reproduced malformed-row issues in tests before fixing.
- Independent review reproduced ambiguous barcode selection and worker-after-unmount creation; corrected both. Later review found a card append race between tabs; writes now use vendor-scoped Web Locks and reject stale data.
- User clarified activation counts only on the same date as opening. Each card stores the applied base and activated total. Monthly calculation never adds both complete amounts.
- User requested ThinQ-inspired styling. Light neutral surfaces, burgundy accents, rounded cards, large scanner CTA, and existing saved theme preferences are retained.
- User requested category icons and real photos. Added standardized icon classes and explicit per-product photo retrieval from the fixed ABC HTTPS host with validated redirects and matching PLU image paths. Verified a real product photo in the browser.
- Remaining: real-phone camera hardware test; full price/card-price/warranty enrichment; linking catalog selections to sale line items; combined monthly export; cross-device stock sharing. Current photo enrichment does not claim those features.
