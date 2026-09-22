// Available expansion art. Registration does not preload textures or enable gameplay.
import catalog0 from '../../public/assets/expansion-2026-09/production-expansion-frames.json' with { type: 'json' };
import catalog1 from '../../public/assets/expansion-2026-09/defense-expansion-frames.json' with { type: 'json' };
import catalog2 from '../../public/assets/expansion-2026-09/mining-expansion-frames.json' with { type: 'json' };
import catalog3 from '../../public/assets/expansion-2026-09/transport-expansion-frames.json' with { type: 'json' };
import catalog4 from '../../public/assets/expansion-2026-09/zoo-expansion-frames.json' with { type: 'json' };
import catalog5 from '../../public/assets/expansion-2026-09/weather-expansion-frames.json' with { type: 'json' };
import catalog6 from '../../public/assets/expansion-2026-09/ai-assistant-expansion-frames.json' with { type: 'json' };
import catalog7 from '../../public/assets/expansion-2026-09/interface-resources-expansion-frames.json' with { type: 'json' };
import catalog8 from '../../public/assets/accessories-2026-09/island-products-frames.json' with { type: 'json' };
import catalog9 from '../../public/assets/accessories-2026-09/railway-parts-frames.json' with { type: 'json' };
import catalog10 from '../../public/assets/accessories-2026-09/wall-junctions-frames.json' with { type: 'json' };
import catalog11 from '../../public/assets/accessories-2026-09/small-accessories-frames.json' with { type: 'json' };
import catalog12 from '../../public/assets/accessories-2026-09/duel-actions-frames.json' with { type: 'json' };
import catalog13 from '../../public/assets/accessories-2026-09/new-crop-stages-frames.json' with { type: 'json' };
import catalog14 from '../../public/assets/readiness-2026-09/islands-completion-frames.json' with { type: 'json' };
import catalog15 from '../../public/assets/readiness-2026-09/plague-animation-frames.json' with { type: 'json' };
import catalog16 from '../../public/assets/readiness-2026-09/vehicles-return-frames.json' with { type: 'json' };
import catalog17 from '../../public/assets/readiness-2026-09/crop-stages-1-frames.json' with { type: 'json' };
import catalog18 from '../../public/assets/readiness-2026-09/crop-stages-2-frames.json' with { type: 'json' };
import catalog19 from '../../public/assets/readiness-2026-09/crop-stages-3-frames.json' with { type: 'json' };
import catalog20 from '../../public/assets/readiness-2026-09/animal-walk-1-frames.json' with { type: 'json' };
import catalog21 from '../../public/assets/readiness-2026-09/animal-walk-2-frames.json' with { type: 'json' };
import catalog22 from '../../public/assets/readiness-2026-09/animal-walk-3-frames.json' with { type: 'json' };
import catalog23 from '../../public/assets/readiness-2026-09/animal-walk-4-frames.json' with { type: 'json' };
import catalog24 from '../../public/assets/readiness-2026-09/rail-curves-corrected-frames.json' with { type: 'json' };
import catalog25 from '../../public/assets/readiness-2026-09/weather-tile-rain-frames.json' with { type: 'json' };
import catalog26 from '../../public/assets/readiness-2026-09/weather-tile-snow-frames.json' with { type: 'json' };
import catalog27 from '../../public/assets/readiness-2026-09/weather-tile-fog-frames.json' with { type: 'json' };

export const EXPANSION_ATLASES = {
  'production-expansion': catalog0,
  'defense-expansion': catalog1,
  'mining-expansion': catalog2,
  'transport-expansion': catalog3,
  'zoo-expansion': catalog4,
  'weather-expansion': catalog5,
  'ai-assistant-expansion': catalog6,
  'interface-resources-expansion': catalog7,
  'island-products': catalog8,
  'railway-parts': catalog9,
  'wall-junctions': catalog10,
  'small-accessories': catalog11,
  'duel-actions': catalog12,
  'new-crop-stages': catalog13,
  'islands-completion': catalog14,
  'plague-animation': catalog15,
  'vehicles-return': catalog16,
  'crop-stages-1': catalog17,
  'crop-stages-2': catalog18,
  'crop-stages-3': catalog19,
  'animal-walk-1': catalog20,
  'animal-walk-2': catalog21,
  'animal-walk-3': catalog22,
  'animal-walk-4': catalog23,
  'rail-curves-corrected': catalog24,
  'weather-tile-rain': catalog25,
  'weather-tile-snow': catalog26,
  'weather-tile-fog': catalog27,
} as const;
