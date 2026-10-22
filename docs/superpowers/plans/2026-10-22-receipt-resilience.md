# Receipt resilience and catalog coverage

User authorizes autonomous implementation. Keep the current app and data flow.

- Expand category shortcuts with consistent icons and a catch-all group; test real report categories.
- Show receipt photos entirely with an accessible enlarge dialog. Also retain full-frame product camera preview.
- Extract OCR validation and provider routing into server modules. Support Gemini, Qwen visual, DeepSeek visual and Grok vision with server-only keys, fixed provider URLs, bounded timeouts and at most two sequential providers. Never send every photo to all providers.
- Reject empty/inconsistent responses; keep manual confirmation. On 429/503/timeout/malformed output try the configured backup. No fallback for canceled requests or rejected input files.
- Preserve existing Gemini configuration; no alternate service activated without credentials. Recommend a measured Qwen visual / DeepSeek comparison, not an unproven accuracy claim.
- Add mocked regression tests before implementation, verify all tests/lint/types/build and browser preview. Publish authorized changes after checks.
