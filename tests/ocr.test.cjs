const { test } = require('node:test');
const assert = require('node:assert/strict');
const { POST } = require('../src/app/api/ocr/route.ts');
test('OCR rejects a text field disguised as an upload', async () => {
  const form = new FormData(); form.set('image', 'not a file');
  assert.equal((await POST(new Request('http://localhost/api/ocr', { method: 'POST', body: form }))).status, 400);
});
test('OCR rejects an unsupported executable type', async () => {
  const form = new FormData(); form.set('image', new File(['MZ'], 'receipt.exe', { type: 'application/octet-stream' }));
  assert.equal((await POST(new Request('http://localhost/api/ocr', { method: 'POST', body: form }))).status, 415);
});
test('OCR rejects files exceeding 8 MB before contacting the provider', async () => {
  const form = new FormData(); form.set('image', new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'large.jpg', { type: 'image/jpeg' }));
  assert.equal((await POST(new Request('http://localhost/api/ocr', { method: 'POST', body: form }))).status, 413);
});
test('OCR reports missing configuration without exposing provider credentials', async () => {
  const key = process.env.GEMINI_API_KEY; delete process.env.GEMINI_API_KEY;
  try {
    const form = new FormData(); form.set('image', new File([new Uint8Array([255,216,255,0])], 'small.jpg', { type: 'image/jpeg' }));
    const response = await POST(new Request('http://localhost/api/ocr', { method: 'POST', body: form }));
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /manualmente/);
  } finally { if (key !== undefined) process.env.GEMINI_API_KEY = key; }
});
test('OCR rejects declared image types whose bytes are a different format', async () => {
  const form = new FormData(); form.set('image', new File(['<html>wrong format</html>'], 'fake.jpg', { type: 'image/jpeg' }));
  assert.equal((await POST(new Request('http://localhost/api/ocr', { method: 'POST', body: form }))).status, 415);
});
