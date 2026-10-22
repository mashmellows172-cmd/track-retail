# Camera speed and capture plan

**Approved scope:** User requested faster, intuitive product barcode scanning and receipt capture, retaining the current design and manual fallbacks.

- [x] Add tested helpers for camera capabilities, code validation and owned-stream cleanup.
- [x] Use native barcode detection where supported, with a lazy ZXing fallback, rear-camera preference, continuous focus where available, bounded scan rate and no overlapping decodes.
- [x] Add large framing guide, status, retry, optional torch/zoom and manual-code fallback. Stop camera on success, close, hidden page and unmount.
- [x] Delegate independent receipt capture work: native camera/gallery selection, preview, explicit analysis, readable image optimization, cancellation, no fake progress or artificial delay.
- [x] Verify helpers and synthetic decoding, browser failure/manual paths, lint/types/build and review. No real receipt data or provider calls without a user-selected receipt.

Hardware performance depends on the phone and lighting. Do not claim actual autofocus/torch/real-camera testing without a physical device. Preserve permission boundaries and existing OCR server validation.

