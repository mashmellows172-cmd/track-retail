export type CropEdge = 'left' | 'top' | 'right' | 'bottom';
export type Rotation = 0 | 90 | 180 | 270;

export interface CropEdges {
  /** Percentages from 0 to 100 in the original, unrotated photo. */
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface NormalizedCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MIN_CROP_PERCENT = 5;
export const DEFAULT_CROP_EDGES: CropEdges = { left: 0, top: 0, right: 100, bottom: 100 };

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function adjustCropEdge(edges: CropEdges, edge: CropEdge, value: number): CropEdges {
  const next = { ...edges, [edge]: clampPercent(value) };
  if (edge === 'left') next.left = Math.min(next.left, next.right - MIN_CROP_PERCENT);
  if (edge === 'right') next.right = Math.max(next.right, next.left + MIN_CROP_PERCENT);
  if (edge === 'top') next.top = Math.min(next.top, next.bottom - MIN_CROP_PERCENT);
  if (edge === 'bottom') next.bottom = Math.max(next.bottom, next.top + MIN_CROP_PERCENT);
  return next;
}

export function cropFromEdges(edges: CropEdges): NormalizedCrop {
  return {
    x: edges.left / 100,
    y: edges.top / 100,
    width: (edges.right - edges.left) / 100,
    height: (edges.bottom - edges.top) / 100,
  };
}

export function edgesFromCrop(crop: NormalizedCrop): CropEdges {
  return {
    left: clampPercent(crop.x * 100),
    top: clampPercent(crop.y * 100),
    right: clampPercent((crop.x + crop.width) * 100),
    bottom: clampPercent((crop.y + crop.height) * 100),
  };
}

export function isFullCrop(crop: NormalizedCrop): boolean {
  return crop.x <= 0.001
    && crop.y <= 0.001
    && crop.x + crop.width >= 0.999
    && crop.y + crop.height >= 0.999;
}

export function nextRotation(rotation: Rotation): Rotation {
  return ((rotation + 90) % 360) as Rotation;
}
