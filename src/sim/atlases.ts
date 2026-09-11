import caravanCatalog from '../../public/assets/caravan-frames.json' with { type: 'json' };
import citizensCatalog from '../../public/assets/citizens-actions-frames.json' with { type: 'json' };
import disastersCatalog from '../../public/assets/disasters-frames.json' with { type: 'json' };
import housingCatalog from '../../public/assets/housing-levels-frames.json' with { type: 'json' };
import industry2Catalog from '../../public/assets/industry2-frames.json' with { type: 'json' };
import machineCatalog from '../../public/assets/machine-layers-frames.json' with { type: 'json' };
import petsCatalog from '../../public/assets/pets-frames.json' with { type: 'json' };
import seasonCatalog from '../../public/assets/season-props-frames.json' with { type: 'json' };
import portraitsCatalog from '../../public/assets/story-portraits-frames.json' with { type: 'json' };
import streetCatalog from '../../public/assets/street-decor-frames.json' with { type: 'json' };
import type { BuildingKind } from './data.ts';

export interface SpriteFrame { x: number; y: number; w: number; h: number; clip?: number[][] }

/**
 * Every generated atlas, keyed by the name the renderer loads it under. The frame
 * rectangles come from the same `*-frames.json` catalogs the asset preview page
 * reads, so the two can never disagree about where a sprite lives.
 */
export const GENERATED_ATLASES = {
  disasters: disastersCatalog,
  'citizens-actions': citizensCatalog,
  caravan: caravanCatalog,
  'story-portraits': portraitsCatalog,
  'street-decor': streetCatalog,
  'season-props': seasonCatalog,
  industry2: industry2Catalog,
  'housing-levels': housingCatalog,
  pets: petsCatalog,
  'machine-layers': machineCatalog,
} as const;

export type GeneratedAtlas = keyof typeof GENERATED_ATLASES;

export function atlasFrames(atlas: GeneratedAtlas): Record<string, SpriteFrame> {
  return GENERATED_ATLASES[atlas].frames as Record<string, SpriteFrame>;
}

export function atlasSize(atlas: GeneratedAtlas): { width: number; height: number } {
  const { width, height } = GENERATED_ATLASES[atlas];
  return { width, height };
}

export const GENERATED_ATLAS_KEYS = Object.keys(GENERATED_ATLASES) as GeneratedAtlas[];

const CATALOG_BY_KIND: Partial<Record<BuildingKind, GeneratedAtlas>> = {
  // Street decorations, added in the second asset batch.
  flowerbox: 'street-decor', trellis: 'street-decor', archlights: 'street-decor',
  boardwalk: 'street-decor', railing: 'street-decor', parasol: 'street-decor',
  willow: 'street-decor', dock: 'street-decor', crates: 'street-decor',
  barrels: 'street-decor', anvil: 'street-decor', signflags: 'street-decor',
};

const FRAME_BY_KIND: Partial<Record<BuildingKind, string>> = {
  flowerbox: 'flower-box', trellis: 'flower-trellis', archlights: 'flower-arch-lights',
  boardwalk: 'boardwalk', railing: 'railing', parasol: 'parasol', willow: 'willow',
  dock: 'floating-dock', crates: 'crates', barrels: 'barrels', anvil: 'anvil', signflags: 'sign-flags',
};

/** Which generated atlas draws this building, and which frame inside it. */
export function generatedSprite(kind: BuildingKind): { atlas: GeneratedAtlas; frame: string } | null {
  const atlas = CATALOG_BY_KIND[kind];
  if (!atlas) return null;
  return { atlas, frame: FRAME_BY_KIND[kind] ?? kind };
}

/**
 * Cottage and farmhouse art changes with the building level, so the same kind can
 * render as a different sprite. Every other building keeps one sprite and scales it.
 */
export const HOUSING_LEVEL_FRAMES: Partial<Record<BuildingKind, readonly [string, string, string]>> = {
  cottage: ['cottage-1', 'cottage-2', 'cottage-3'],
  farmhouse: ['farmhouse-1', 'farmhouse-2', 'farmhouse-3'],
};

export function housingLevelFrame(kind: BuildingKind, level: number): { atlas: GeneratedAtlas; frame: string } | null {
  const frames = HOUSING_LEVEL_FRAMES[kind];
  if (!frames) return null;
  return { atlas: 'housing-levels', frame: frames[Math.min(frames.length, Math.max(1, level)) - 1]! };
}

