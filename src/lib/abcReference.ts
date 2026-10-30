export interface AbcPriceInfo {
  price?: number | null;
  currency?: string | null;
  priceValidUntil?: string | null;
  url?: string | null;
  offerCount?: number;
  cardPrice?: boolean | null;
  warranty?: boolean | null;
  matchedIdentity: boolean;
  acquisitionTimestamp: string;
}

export interface AbcReferenceInfo {
  image?: string | null;
  prices: AbcPriceInfo[];
  hasAmbiguousPrice: boolean;
  error?: string;
}

function isValidPlu(plu: string): boolean {
  return /^\d{8}$/.test(plu);
}

function extractMetaContent(tag: string): string | null {
  const raw = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1];
  if (!raw) return null;
  return raw.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}

export function extractProductImage(html: string, plu: string): string | null {
  if (!isValidPlu(plu)) return null;
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    if (!/\bproperty\s*=\s*["']og:image["']/i.test(tag)) continue;
    const raw = extractMetaContent(tag);
    if (!raw) continue;
    try {
      const url = new URL(raw);
      if (url.protocol === 'https:' && url.hostname === 'www.abc.cl' && !url.username && !url.password && !url.port && new RegExp(`(?:^|/)${plu}(?:[._/-]|$)`).test(url.pathname)) return url.href;
    } catch { /* Keep the generic icon when the reference image is invalid. */ }
  }
  return null;
}

function isSameHostUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && url.hostname === 'www.abc.cl' && !url.username && !url.password && !url.port;
  } catch {
    return false;
  }
}

function parseAmountStrict(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) return null;
    if (value > 10_000_000) return null;
    return value;
  }
  if (typeof value === 'string') {
    const s = value.trim();
    if (/[eE+\-]/.test(s)) return null;
    if (/^\d+$/.test(s)) {
      const num = Number(s);
      if (!Number.isSafeInteger(num) || num < 0 || num > 10_000_000) return null;
      return num;
    }
    if (/^\d+\.00$/.test(s)) {
      const num = Number(s);
      if (!Number.isSafeInteger(num) || num < 0 || num > 10_000_000) return null;
      return num;
    }
    return null;
  }
  return null;
}

function exactProductMatch(node: unknown, plu: string): boolean {
  if (!node || typeof node !== 'object') return false;
  const obj = node as Record<string, unknown>;
  const candidates = [obj.sku, obj.productID, obj.mpn];
  for (const c of candidates) {
    if (typeof c === 'string' && c === plu) return true;
  }
  return false;
}

function isProductType(obj: Record<string, unknown>): boolean {
  const type = obj['@type'];
  if (type === 'Product') return true;
  if (Array.isArray(type) && type.includes('Product')) return true;
  return false;
}

type JsonLd = Record<string, unknown>;

function collectProductNodesFromJson(json: unknown, plu: string): Array<{ node: JsonLd }> {
  const results: Array<{ node: JsonLd }> = [];
  const seen = new Set<object>();
  
  const walk = (value: unknown, depth: number) => {
    if (depth > 10) return;
    if (!value || typeof value !== 'object') return;
    if (seen.has(value as object)) return;
    seen.add(value as object);
    
    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item, depth + 1);
      }
      return;
    }
    
    const obj = value as JsonLd;
    if (isProductType(obj) && exactProductMatch(obj, plu)) {
      results.push({ node: obj });
      // Don't stop traversal - but we only collect Product nodes with exact match
    }
    
    if (obj['@graph'] && Array.isArray(obj['@graph'])) {
      for (const g of obj['@graph']) {
        walk(g, depth + 1);
      }
      return;
    }
    
    // Traverse other nested structures
    if (obj.itemOffered) walk(obj.itemOffered, depth + 1);
    if (obj.offers) walk(obj.offers, depth + 1);
    if (obj.hasOfferCatalog) walk(obj.hasOfferCatalog, depth + 1);
  };
  
  walk(json, 0);
  return results;
}

function collectOffersFromNode(node: JsonLd): unknown[] {
  const offers: unknown[] = [];
  const add = (o: unknown) => {
    if (!o) return;
    if (Array.isArray(o)) {
      for (const item of o) add(item);
      return;
    }
    if (typeof o === 'object') offers.push(o);
  };
  add(node.offers);
  add(node.hasOfferCatalog);
  return offers;
}

export function extractAbcReference(html: string, plu: string): AbcReferenceInfo {
  const acquisitionTimestamp = new Date().toISOString();
  if (!isValidPlu(plu)) {
    return { prices: [], hasAmbiguousPrice: false, error: 'PLU inválido.' };
  }
  const image = extractProductImage(html, plu);
  
  const prices: AbcPriceInfo[] = [];
  const jsonLdMatches = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  
  for (const scriptTag of jsonLdMatches) {
    const contentMatch = scriptTag.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!contentMatch) continue;
    try {
      const jsonText = contentMatch[1].trim();
      const json = JSON.parse(jsonText);
      const productNodes = collectProductNodesFromJson(json, plu);
      for (const { node } of productNodes) {
        const offers = collectOffersFromNode(node);
        for (const offer of offers) {
          if (!offer || typeof offer !== 'object') continue;
          const offerObj = offer as Record<string, unknown>;
          if (offerObj.priceCurrency !== 'CLP') {
            continue;
          }
          const price = parseAmountStrict(offerObj.price);
          if (price === null) {
            prices.push({
              price: null,
              currency: 'CLP',
              priceValidUntil: typeof offerObj.priceValidUntil === 'string' ? offerObj.priceValidUntil : null,
              url: (typeof offerObj.url === 'string' && isSameHostUrl(offerObj.url)) ? offerObj.url : null,
              matchedIdentity: true,
              acquisitionTimestamp,
              cardPrice: null,
              warranty: null,
            });
            continue;
          }
          let url: string | null = null;
          if (typeof offerObj.url === 'string' && isSameHostUrl(offerObj.url)) {
            url = offerObj.url;
          }
          prices.push({
            price,
            currency: 'CLP',
            priceValidUntil: typeof offerObj.priceValidUntil === 'string' ? offerObj.priceValidUntil : null,
            url,
            matchedIdentity: true,
            acquisitionTimestamp,
            cardPrice: null,
            warranty: null,
            offerCount: offers.length,
          });
        }
      }
    } catch {
      continue;
    }
  }
  
  const validPrices = prices.filter(p => typeof p.price === 'number');
  const hasAmbiguousPrice = validPrices.length > 1 || prices.some(p => (p.offerCount && p.offerCount > 1 && validPrices.length > 0));
  
  return {
    image,
    prices,
    hasAmbiguousPrice,
  };
}
