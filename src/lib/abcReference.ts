export function extractProductImage(html: string, plu: string): string | null {
  if (!/^\d{8}$/.test(plu)) return null;
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    if (!/\bproperty\s*=\s*["']og:image["']/i.test(tag)) continue;
    const raw = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1];
    if (!raw) continue;
    try {
      const url = new URL(raw.replace(/&amp;/g,'&'));
      if (url.protocol === 'https:' && url.hostname === 'www.abc.cl' && !url.username && !url.password && !url.port && new RegExp(`(?:^|/)${plu}(?:[._/-]|$)`).test(url.pathname)) return url.href;
    } catch { /* Keep the generic icon when the reference image is invalid. */ }
  }
  return null;
}
