export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RotatedCrop {
  sourceRect: Rect;
  targetRotation: 0 | 90 | 180 | 270;
  width: number;
  height: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampRect(rect: Partial<Rect>, imageWidth: number, imageHeight: number): Rect {
  const width = imageWidth > 0 ? imageWidth : 1;
  const height = imageHeight > 0 ? imageHeight : 1;
  const rawX = typeof rect.x === 'number' && Number.isFinite(rect.x) ? rect.x : 0;
  const rawY = typeof rect.y === 'number' && Number.isFinite(rect.y) ? rect.y : 0;
  const rawW = typeof rect.width === 'number' && Number.isFinite(rect.width) ? rect.width : width;
  const rawH = typeof rect.height === 'number' && Number.isFinite(rect.height) ? rect.height : height;
  const x = clamp(rawX, 0, width);
  const y = clamp(rawY, 0, height);
  let w = clamp(rawW, 1, width);
  let h = clamp(rawH, 1, height);
  if (x + w > width) w = Math.max(1, width - x);
  if (y + h > height) h = Math.max(1, height - y);
  return { x, y, width: w, height: h };
}

export function rotateRectForCrop(rect: Rect, imageWidth: number, imageHeight: number, rotation: 0 | 90 | 180 | 270): RotatedCrop {
  const src = clampRect(rect, imageWidth, imageHeight);
  if (rotation === 0) {
    return { sourceRect: src, targetRotation: 0, width: Math.round(src.width), height: Math.round(src.height) };
  }
  if (rotation === 90) {
    // Rotate 90° clockwise: source (x,y,w,h) in original becomes mapped into
    // a crop whose target width/height are swapped after rotation.
    const sourceRect: Rect = {
      x: src.y,
      y: Math.max(0, imageWidth - (src.x + src.width)),
      width: src.height,
      height: src.width,
    };
    return { sourceRect: clampRect(sourceRect, imageHeight, imageWidth), targetRotation: 90, width: Math.round(src.height), height: Math.round(src.width) };
  }
  if (rotation === 180) {
    const sourceRect: Rect = {
      x: Math.max(0, imageWidth - (src.x + src.width)),
      y: Math.max(0, imageHeight - (src.y + src.height)),
      width: src.width,
      height: src.height,
    };
    return { sourceRect: clampRect(sourceRect, imageWidth, imageHeight), targetRotation: 180, width: Math.round(src.width), height: Math.round(src.height) };
  }
  const sourceRect: Rect = {
    x: Math.max(0, imageHeight - (src.y + src.height)),
    y: src.x,
    width: src.height,
    height: src.width,
  };
  return { sourceRect: clampRect(sourceRect, imageHeight, imageWidth), targetRotation: 270, width: Math.round(src.height), height: Math.round(src.width) };
}

export function normalizedToPixels(rect: Partial<Rect>, imageWidth: number, imageHeight: number): Rect {
  const width = imageWidth > 0 ? imageWidth : 1;
  const height = imageHeight > 0 ? imageHeight : 1;
  return clampRect({
    x: (typeof rect.x === 'number' ? rect.x : 0) * width,
    y: (typeof rect.y === 'number' ? rect.y : 0) * height,
    width: (typeof rect.width === 'number' ? rect.width : 1) * width,
    height: (typeof rect.height === 'number' ? rect.height : 1) * height,
  }, width, height);
}
