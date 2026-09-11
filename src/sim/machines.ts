import { GENERATED_ATLASES, atlasFrames } from './atlases.ts';
import { frameScale } from '../render/atlasSprite.ts';
import type { BuildingKind } from './data.ts';

/** How wide a part is drawn, in world pixels, regardless of its atlas cell size. */
export const PART_WIDTH = 96;

export interface MachinePart {
  /** Frame in the `machine-layers` atlas. */
  frame: string;
  /** Where the part sits on its building, as a fraction of the building sprite. */
  attach: { x: number; y: number };
  /** Degrees per second while the workshop is running. */
  spin: number;
  /** Parts that swing back and forth rather than turning. */
  swing?: number;
}

/**
 * Moving parts drawn over working workshops. Each part is attached at a fraction of
 * the building sprite's box and turns only while that building is actually producing,
 * so a stopped workshop visibly stops.
 *
 * The atlas carries a measured pivot per part (the point it turns around), which the
 * renderer offsets to this attachment point.
 */
export const MACHINE_PARTS: Partial<Record<BuildingKind, MachinePart>> = {
  windmill: { frame: 'windmill-rotor', attach: { x: 0.5, y: 0.3 }, spin: 42 },
  sawmill: { frame: 'saw-blade', attach: { x: 0.62, y: 0.52 }, spin: 150 },
  fishpond: { frame: 'waterwheel', attach: { x: 0.42, y: 0.55 }, spin: 26 },
  fishery: { frame: 'fishing-rod', attach: { x: 0.38, y: 0.55 }, spin: 0, swing: 22 },
  smithy: { frame: 'hammer', attach: { x: 0.5, y: 0.52 }, spin: 0, swing: 34 },
  mine: { frame: 'minecart', attach: { x: 0.5, y: 0.72 }, spin: 0, swing: 8 },
};

/** The measured turn centre of a part, in its own frame's pixels, from the catalog. */
export function machinePivot(frame: string): { x: number; y: number } | null {
  const meta = GENERATED_ATLASES['machine-layers'].frames as Record<string, { pivot?: number[] }>;
  const found = meta[frame]?.pivot;
  return found ? { x: found[0]!, y: found[1]! } : null;
}

/**
 * Where a part sits relative to its building's base point, and the scale that brings it
 * to its intended on-screen size. Extracted so the renderer and its tests share one
 * definition: the scale must never depend on the atlas cell size, or a part drawn from a
 * large cell would render several times its intended size.
 */
export function partLayout(
  frame: { w: number; h: number },
  attach: { x: number; y: number },
  targetWidth = PART_WIDTH,
): { scale: number; width: number; height: number; offsetX: number; offsetY: number } {
  const scale = frameScale(frame.w, targetWidth);
  const width = frame.w * scale;
  const height = frame.h * scale;
  // The building sprite is bottom-anchored, so its box top is one box height above the base.
  return { scale, width, height, offsetX: (attach.x - .5) * width, offsetY: attach.y * height - height };
}

/**
 * Rotation in degrees for a part at a given time. Takes plain numbers rather than a
 * definition object, since this runs every frame for every working workshop.
 * `swing` turns the part back and forth instead of spinning it.
 */
export function partAngle(seconds: number, spin: number, swing?: number): number {
  if (swing !== undefined) return Math.sin(seconds * Math.PI * 2 / (360 / swing)) * swing;
  return (seconds * spin) % 360;
}
