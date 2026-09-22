import type { GeneratedAtlas } from './atlases.ts';

/** Art IDs, not BuildingKind IDs: add gameplay definitions before making these buildable. */
export const EXPANSION_SPRITES = {
  "sugarcane-field": {
    "atlas": "production-expansion",
    "frame": "sugarcane-field"
  },
  "sugar-mill": {
    "atlas": "production-expansion",
    "frame": "sugar-mill"
  },
  "hops-field": {
    "atlas": "production-expansion",
    "frame": "hops-field"
  },
  "tavern": {
    "atlas": "production-expansion",
    "frame": "tavern"
  },
  "herb-garden": {
    "atlas": "production-expansion",
    "frame": "herb-garden"
  },
  "pig-farm": {
    "atlas": "production-expansion",
    "frame": "pig-farm"
  },
  "butcher": {
    "atlas": "production-expansion",
    "frame": "butcher"
  },
  "hunter-lodge": {
    "atlas": "production-expansion",
    "frame": "hunter-lodge"
  },
  "sugar": {
    "atlas": "production-expansion",
    "frame": "sugar"
  },
  "beer": {
    "atlas": "production-expansion",
    "frame": "beer"
  },
  "herbs": {
    "atlas": "production-expansion",
    "frame": "herbs"
  },
  "meat-sausages": {
    "atlas": "production-expansion",
    "frame": "meat-sausages"
  },
  "barracks": {
    "atlas": "defense-expansion",
    "frame": "barracks"
  },
  "guard-post": {
    "atlas": "defense-expansion",
    "frame": "guard-post"
  },
  "castle": {
    "atlas": "defense-expansion",
    "frame": "castle"
  },
  "wall-straight": {
    "atlas": "defense-expansion",
    "frame": "wall-straight"
  },
  "wall-corner": {
    "atlas": "defense-expansion",
    "frame": "wall-corner"
  },
  "city-gate": {
    "atlas": "defense-expansion",
    "frame": "city-gate"
  },
  "guard": {
    "atlas": "defense-expansion",
    "frame": "guard"
  },
  "bandit": {
    "atlas": "defense-expansion",
    "frame": "bandit"
  },
  "bandit-camp": {
    "atlas": "defense-expansion",
    "frame": "bandit-camp"
  },
  "plague-house": {
    "atlas": "defense-expansion",
    "frame": "plague-house"
  },
  "plague-cloud": {
    "atlas": "defense-expansion",
    "frame": "plague-cloud"
  },
  "quarantine-marker": {
    "atlas": "defense-expansion",
    "frame": "quarantine-marker"
  },
  "copper-mine": {
    "atlas": "mining-expansion",
    "frame": "copper-mine"
  },
  "silver-mine": {
    "atlas": "mining-expansion",
    "frame": "silver-mine"
  },
  "gold-mine": {
    "atlas": "mining-expansion",
    "frame": "gold-mine"
  },
  "platinum-mine": {
    "atlas": "mining-expansion",
    "frame": "platinum-mine"
  },
  "copper-ore": {
    "atlas": "mining-expansion",
    "frame": "copper-ore"
  },
  "silver-ore": {
    "atlas": "mining-expansion",
    "frame": "silver-ore"
  },
  "gold-ore": {
    "atlas": "mining-expansion",
    "frame": "gold-ore"
  },
  "platinum-ore": {
    "atlas": "mining-expansion",
    "frame": "platinum-ore"
  },
  "pickaxe": {
    "atlas": "mining-expansion",
    "frame": "pickaxe"
  },
  "dynamite": {
    "atlas": "mining-expansion",
    "frame": "dynamite"
  },
  "mine-chest": {
    "atlas": "mining-expansion",
    "frame": "mine-chest"
  },
  "mine-antique": {
    "atlas": "mining-expansion",
    "frame": "mine-antique"
  },
  "train-engine": {
    "atlas": "transport-expansion",
    "frame": "train-engine"
  },
  "train-wagon": {
    "atlas": "transport-expansion",
    "frame": "train-wagon"
  },
  "rail-station": {
    "atlas": "transport-expansion",
    "frame": "rail-station"
  },
  "cargo-plane": {
    "atlas": "transport-expansion",
    "frame": "cargo-plane"
  },
  "airfield": {
    "atlas": "transport-expansion",
    "frame": "airfield"
  },
  "harbor": {
    "atlas": "transport-expansion",
    "frame": "harbor"
  },
  "cargo-ship": {
    "atlas": "transport-expansion",
    "frame": "cargo-ship"
  },
  "fishing-boat": {
    "atlas": "transport-expansion",
    "frame": "fishing-boat"
  },
  "island": {
    "atlas": "transport-expansion",
    "frame": "island"
  },
  "coconut": {
    "atlas": "transport-expansion",
    "frame": "coconut"
  },
  "pineapple": {
    "atlas": "transport-expansion",
    "frame": "pineapple"
  },
  "pearl-shell": {
    "atlas": "transport-expansion",
    "frame": "pearl-shell"
  },
  "zoo-gate": {
    "atlas": "zoo-expansion",
    "frame": "zoo-gate"
  },
  "zoo-enclosure": {
    "atlas": "zoo-expansion",
    "frame": "zoo-enclosure"
  },
  "zoo-keeper": {
    "atlas": "zoo-expansion",
    "frame": "zoo-keeper"
  },
  "zoo-feed": {
    "atlas": "zoo-expansion",
    "frame": "zoo-feed"
  },
  "elephant": {
    "atlas": "zoo-expansion",
    "frame": "elephant"
  },
  "giraffe": {
    "atlas": "zoo-expansion",
    "frame": "giraffe"
  },
  "zebra": {
    "atlas": "zoo-expansion",
    "frame": "zebra"
  },
  "lion": {
    "atlas": "zoo-expansion",
    "frame": "lion"
  },
  "cloud-fair": {
    "atlas": "weather-expansion",
    "frame": "cloud-fair"
  },
  "cloud-storm": {
    "atlas": "weather-expansion",
    "frame": "cloud-storm"
  },
  "rain-light": {
    "atlas": "weather-expansion",
    "frame": "rain-light"
  },
  "rain-heavy": {
    "atlas": "weather-expansion",
    "frame": "rain-heavy"
  },
  "snow-light": {
    "atlas": "weather-expansion",
    "frame": "snow-light"
  },
  "snow-heavy": {
    "atlas": "weather-expansion",
    "frame": "snow-heavy"
  },
  "fog": {
    "atlas": "weather-tile-fog",
    "frame": "fog"
  },
  "lightning": {
    "atlas": "weather-expansion",
    "frame": "lightning"
  },
  "assistant-avatar": {
    "atlas": "ai-assistant-expansion",
    "frame": "assistant-avatar"
  },
  "cursor-idle": {
    "atlas": "ai-assistant-expansion",
    "frame": "cursor-idle"
  },
  "cursor-select": {
    "atlas": "ai-assistant-expansion",
    "frame": "cursor-select"
  },
  "cursor-build": {
    "atlas": "ai-assistant-expansion",
    "frame": "cursor-build"
  },
  "mode-a": {
    "atlas": "ai-assistant-expansion",
    "frame": "mode-a"
  },
  "mode-b": {
    "atlas": "ai-assistant-expansion",
    "frame": "mode-b"
  },
  "mode-c": {
    "atlas": "ai-assistant-expansion",
    "frame": "mode-c"
  },
  "director": {
    "atlas": "ai-assistant-expansion",
    "frame": "director"
  },
  "assistant-panel": {
    "atlas": "interface-resources-expansion",
    "frame": "assistant-panel"
  },
  "activity-panel": {
    "atlas": "interface-resources-expansion",
    "frame": "activity-panel"
  },
  "director-panel": {
    "atlas": "interface-resources-expansion",
    "frame": "director-panel"
  },
  "tnt-crate": {
    "atlas": "interface-resources-expansion",
    "frame": "tnt-crate"
  },
  "sugarcane": {
    "atlas": "interface-resources-expansion",
    "frame": "sugarcane"
  },
  "hops": {
    "atlas": "interface-resources-expansion",
    "frame": "hops"
  },
  "meat": {
    "atlas": "interface-resources-expansion",
    "frame": "meat"
  },
  "sausages": {
    "atlas": "interface-resources-expansion",
    "frame": "sausages"
  },
  "peach": {
    "atlas": "island-products",
    "frame": "peach"
  },
  "watermelon": {
    "atlas": "island-products",
    "frame": "watermelon"
  },
  "plum": {
    "atlas": "island-products",
    "frame": "plum"
  },
  "olive": {
    "atlas": "island-products",
    "frame": "olive"
  },
  "lime": {
    "atlas": "island-products",
    "frame": "lime"
  },
  "banana": {
    "atlas": "island-products",
    "frame": "banana"
  },
  "shrimp": {
    "atlas": "island-products",
    "frame": "shrimp"
  },
  "lobster": {
    "atlas": "island-products",
    "frame": "lobster"
  },
  "rail-ne-sw": {
    "atlas": "railway-parts",
    "frame": "rail-ne-sw"
  },
  "rail-nw-se": {
    "atlas": "railway-parts",
    "frame": "rail-nw-se"
  },
  "rail-curve-north": {
    "atlas": "rail-curves-corrected",
    "frame": "rail-curve-north"
  },
  "rail-curve-east": {
    "atlas": "rail-curves-corrected",
    "frame": "rail-curve-east"
  },
  "rail-curve-south": {
    "atlas": "rail-curves-corrected",
    "frame": "rail-curve-south"
  },
  "rail-curve-west": {
    "atlas": "rail-curves-corrected",
    "frame": "rail-curve-west"
  },
  "rail-cross": {
    "atlas": "railway-parts",
    "frame": "rail-cross"
  },
  "rail-ties": {
    "atlas": "railway-parts",
    "frame": "rail-ties"
  },
  "wall-end-n": {
    "atlas": "wall-junctions",
    "frame": "wall-end-n"
  },
  "wall-end-e": {
    "atlas": "wall-junctions",
    "frame": "wall-end-e"
  },
  "wall-end-s": {
    "atlas": "wall-junctions",
    "frame": "wall-end-s"
  },
  "wall-end-w": {
    "atlas": "wall-junctions",
    "frame": "wall-end-w"
  },
  "wall-tee-n": {
    "atlas": "wall-junctions",
    "frame": "wall-tee-n"
  },
  "wall-tee-e": {
    "atlas": "wall-junctions",
    "frame": "wall-tee-e"
  },
  "wall-tee-s": {
    "atlas": "wall-junctions",
    "frame": "wall-tee-s"
  },
  "wall-tee-w": {
    "atlas": "wall-junctions",
    "frame": "wall-tee-w"
  },
  "pelt": {
    "atlas": "small-accessories",
    "frame": "pelt"
  },
  "zoo-souvenir-shop": {
    "atlas": "small-accessories",
    "frame": "zoo-souvenir-shop"
  },
  "thought-bubble-idle": {
    "atlas": "small-accessories",
    "frame": "thought-bubble-idle"
  },
  "thought-bubble-thinking": {
    "atlas": "small-accessories",
    "frame": "thought-bubble-thinking"
  },
  "guard-ready": {
    "atlas": "duel-actions",
    "frame": "guard-ready"
  },
  "guard-thrust": {
    "atlas": "duel-actions",
    "frame": "guard-thrust"
  },
  "guard-block": {
    "atlas": "duel-actions",
    "frame": "guard-block"
  },
  "guard-recover": {
    "atlas": "duel-actions",
    "frame": "guard-recover"
  },
  "bandit-ready": {
    "atlas": "duel-actions",
    "frame": "bandit-ready"
  },
  "bandit-lunge": {
    "atlas": "duel-actions",
    "frame": "bandit-lunge"
  },
  "bandit-recoil": {
    "atlas": "duel-actions",
    "frame": "bandit-recoil"
  },
  "bandit-retreat": {
    "atlas": "duel-actions",
    "frame": "bandit-retreat"
  },
  "sugarcane-sprout": {
    "atlas": "new-crop-stages",
    "frame": "sugarcane-sprout"
  },
  "sugarcane-young": {
    "atlas": "new-crop-stages",
    "frame": "sugarcane-young"
  },
  "sugarcane-growing": {
    "atlas": "new-crop-stages",
    "frame": "sugarcane-growing"
  },
  "sugarcane-ripe": {
    "atlas": "new-crop-stages",
    "frame": "sugarcane-ripe"
  },
  "hops-sprout": {
    "atlas": "new-crop-stages",
    "frame": "hops-sprout"
  },
  "hops-young": {
    "atlas": "new-crop-stages",
    "frame": "hops-young"
  },
  "hops-growing": {
    "atlas": "new-crop-stages",
    "frame": "hops-growing"
  },
  "hops-ripe": {
    "atlas": "new-crop-stages",
    "frame": "hops-ripe"
  },
  "fruit-island": {
    "atlas": "islands-completion",
    "frame": "fruit-island"
  },
  "olive-island": {
    "atlas": "islands-completion",
    "frame": "olive-island"
  },
  "fisherman-island": {
    "atlas": "islands-completion",
    "frame": "fisherman-island"
  },
  "plague-cloud-1": {
    "atlas": "plague-animation",
    "frame": "plague-cloud-1"
  },
  "plague-cloud-2": {
    "atlas": "plague-animation",
    "frame": "plague-cloud-2"
  },
  "train-engine-right": {
    "atlas": "vehicles-return",
    "frame": "train-engine-right"
  },
  "cargo-plane-right": {
    "atlas": "vehicles-return",
    "frame": "cargo-plane-right"
  },
  "cargo-ship-right": {
    "atlas": "vehicles-return",
    "frame": "cargo-ship-right"
  },
  "fishing-boat-right": {
    "atlas": "vehicles-return",
    "frame": "fishing-boat-right"
  },
  "wheat-sprout": {
    "atlas": "crop-stages-1",
    "frame": "wheat-sprout"
  },
  "wheat-young": {
    "atlas": "crop-stages-1",
    "frame": "wheat-young"
  },
  "wheat-growing": {
    "atlas": "crop-stages-1",
    "frame": "wheat-growing"
  },
  "wheat-ripe": {
    "atlas": "crop-stages-1",
    "frame": "wheat-ripe"
  },
  "carrot-sprout": {
    "atlas": "crop-stages-1",
    "frame": "carrot-sprout"
  },
  "carrot-young": {
    "atlas": "crop-stages-1",
    "frame": "carrot-young"
  },
  "carrot-growing": {
    "atlas": "crop-stages-1",
    "frame": "carrot-growing"
  },
  "carrot-ripe": {
    "atlas": "crop-stages-1",
    "frame": "carrot-ripe"
  },
  "corn-sprout": {
    "atlas": "crop-stages-1",
    "frame": "corn-sprout"
  },
  "corn-young": {
    "atlas": "crop-stages-1",
    "frame": "corn-young"
  },
  "corn-growing": {
    "atlas": "crop-stages-1",
    "frame": "corn-growing"
  },
  "corn-ripe": {
    "atlas": "crop-stages-1",
    "frame": "corn-ripe"
  },
  "tomato-sprout": {
    "atlas": "crop-stages-2",
    "frame": "tomato-sprout"
  },
  "tomato-young": {
    "atlas": "crop-stages-2",
    "frame": "tomato-young"
  },
  "tomato-growing": {
    "atlas": "crop-stages-2",
    "frame": "tomato-growing"
  },
  "tomato-ripe": {
    "atlas": "crop-stages-2",
    "frame": "tomato-ripe"
  },
  "strawberry-sprout": {
    "atlas": "crop-stages-2",
    "frame": "strawberry-sprout"
  },
  "strawberry-young": {
    "atlas": "crop-stages-2",
    "frame": "strawberry-young"
  },
  "strawberry-growing": {
    "atlas": "crop-stages-2",
    "frame": "strawberry-growing"
  },
  "strawberry-ripe": {
    "atlas": "crop-stages-2",
    "frame": "strawberry-ripe"
  },
  "pumpkin-sprout": {
    "atlas": "crop-stages-2",
    "frame": "pumpkin-sprout"
  },
  "pumpkin-young": {
    "atlas": "crop-stages-2",
    "frame": "pumpkin-young"
  },
  "pumpkin-growing": {
    "atlas": "crop-stages-2",
    "frame": "pumpkin-growing"
  },
  "pumpkin-ripe": {
    "atlas": "crop-stages-2",
    "frame": "pumpkin-ripe"
  },
  "sunflower-sprout": {
    "atlas": "crop-stages-3",
    "frame": "sunflower-sprout"
  },
  "sunflower-young": {
    "atlas": "crop-stages-3",
    "frame": "sunflower-young"
  },
  "sunflower-growing": {
    "atlas": "crop-stages-3",
    "frame": "sunflower-growing"
  },
  "sunflower-ripe": {
    "atlas": "crop-stages-3",
    "frame": "sunflower-ripe"
  },
  "grape-sprout": {
    "atlas": "crop-stages-3",
    "frame": "grape-sprout"
  },
  "grape-young": {
    "atlas": "crop-stages-3",
    "frame": "grape-young"
  },
  "grape-growing": {
    "atlas": "crop-stages-3",
    "frame": "grape-growing"
  },
  "grape-ripe": {
    "atlas": "crop-stages-3",
    "frame": "grape-ripe"
  },
  "apple-sprout": {
    "atlas": "crop-stages-3",
    "frame": "apple-sprout"
  },
  "apple-young": {
    "atlas": "crop-stages-3",
    "frame": "apple-young"
  },
  "apple-growing": {
    "atlas": "crop-stages-3",
    "frame": "apple-growing"
  },
  "apple-ripe": {
    "atlas": "crop-stages-3",
    "frame": "apple-ripe"
  },
  "elephant-walk-1": {
    "atlas": "animal-walk-1",
    "frame": "elephant-walk-1"
  },
  "elephant-walk-2": {
    "atlas": "animal-walk-1",
    "frame": "elephant-walk-2"
  },
  "elephant-walk-3": {
    "atlas": "animal-walk-1",
    "frame": "elephant-walk-3"
  },
  "elephant-walk-4": {
    "atlas": "animal-walk-1",
    "frame": "elephant-walk-4"
  },
  "giraffe-walk-1": {
    "atlas": "animal-walk-1",
    "frame": "giraffe-walk-1"
  },
  "giraffe-walk-2": {
    "atlas": "animal-walk-1",
    "frame": "giraffe-walk-2"
  },
  "giraffe-walk-3": {
    "atlas": "animal-walk-1",
    "frame": "giraffe-walk-3"
  },
  "giraffe-walk-4": {
    "atlas": "animal-walk-1",
    "frame": "giraffe-walk-4"
  },
  "zebra-walk-1": {
    "atlas": "animal-walk-2",
    "frame": "zebra-walk-1"
  },
  "zebra-walk-2": {
    "atlas": "animal-walk-2",
    "frame": "zebra-walk-2"
  },
  "zebra-walk-3": {
    "atlas": "animal-walk-2",
    "frame": "zebra-walk-3"
  },
  "zebra-walk-4": {
    "atlas": "animal-walk-2",
    "frame": "zebra-walk-4"
  },
  "lion-walk-1": {
    "atlas": "animal-walk-2",
    "frame": "lion-walk-1"
  },
  "lion-walk-2": {
    "atlas": "animal-walk-2",
    "frame": "lion-walk-2"
  },
  "lion-walk-3": {
    "atlas": "animal-walk-2",
    "frame": "lion-walk-3"
  },
  "lion-walk-4": {
    "atlas": "animal-walk-2",
    "frame": "lion-walk-4"
  },
  "lamb-walk-1": {
    "atlas": "animal-walk-3",
    "frame": "lamb-walk-1"
  },
  "lamb-walk-2": {
    "atlas": "animal-walk-3",
    "frame": "lamb-walk-2"
  },
  "lamb-walk-3": {
    "atlas": "animal-walk-3",
    "frame": "lamb-walk-3"
  },
  "lamb-walk-4": {
    "atlas": "animal-walk-3",
    "frame": "lamb-walk-4"
  },
  "sheep-walk-1": {
    "atlas": "animal-walk-3",
    "frame": "sheep-walk-1"
  },
  "sheep-walk-2": {
    "atlas": "animal-walk-3",
    "frame": "sheep-walk-2"
  },
  "sheep-walk-3": {
    "atlas": "animal-walk-3",
    "frame": "sheep-walk-3"
  },
  "sheep-walk-4": {
    "atlas": "animal-walk-3",
    "frame": "sheep-walk-4"
  },
  "calf-walk-1": {
    "atlas": "animal-walk-4",
    "frame": "calf-walk-1"
  },
  "calf-walk-2": {
    "atlas": "animal-walk-4",
    "frame": "calf-walk-2"
  },
  "calf-walk-3": {
    "atlas": "animal-walk-4",
    "frame": "calf-walk-3"
  },
  "calf-walk-4": {
    "atlas": "animal-walk-4",
    "frame": "calf-walk-4"
  },
  "cow-walk-1": {
    "atlas": "animal-walk-4",
    "frame": "cow-walk-1"
  },
  "cow-walk-2": {
    "atlas": "animal-walk-4",
    "frame": "cow-walk-2"
  },
  "cow-walk-3": {
    "atlas": "animal-walk-4",
    "frame": "cow-walk-3"
  },
  "cow-walk-4": {
    "atlas": "animal-walk-4",
    "frame": "cow-walk-4"
  },
  "rain": {
    "atlas": "weather-tile-rain",
    "frame": "rain"
  },
  "snow": {
    "atlas": "weather-tile-snow",
    "frame": "snow"
  }
} as const satisfies Record<string, {atlas: GeneratedAtlas; frame: string}>;

export type ExpansionSpriteId = keyof typeof EXPANSION_SPRITES;
