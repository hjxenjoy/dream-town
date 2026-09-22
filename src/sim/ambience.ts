import { iso } from './terrain.ts';
import type { BuildingKind } from './data.ts';

/**
 * Which building is audible right now, and how loud. Kept in the sim layer because it is a
 * pure function of world state: the render layer only turns these numbers into Web Audio
 * calls, so the mixing rule can be tested without a browser.
 */
export interface AmbienceSource { url: string; profile: string }
export interface AmbienceCandidate { id: string; url: string; gain: number }

/**
 * A building is heard at full volume within this radius of the camera centre, then fades out,
 * and is silent past the outer radius. Measured in world pixels, where one map tile is 116px.
 */
const FULL_VOLUME_RADIUS = 190;
const SILENT_RADIUS = 760;
/**
 * At most this many loops at once. A grown town has 69 buildings, and mixing every one of
 * them would both cost a voice each and turn the town into noise with no sense of place;
 * the six nearest are what the player is actually looking at.
 */
const MAX_VOICES = 6;
/** The loudest a single building is heard. Kept under the action chimes so clicks stay legible. */
const MASTER_GAIN = 0.05;

/**
 * Profiles that stop when the building stops: a mill that is paused or has finished its batch
 * should not still be grinding. Everything else — leaves, water, crowds, flag cloth, doorways —
 * is place ambience that stays true whether or not the building is running.
 */
const WORK_PROFILE: Record<string, true> = {
  machine: true, windmill: true, smithy: true, metal: true, fire: true, mine: true,
  bubbles: true, chicken: true, cow: true, bees: true, bakery: true, field: true,
};

export function audibleAmbience(
  buildings: readonly { id: string; kind: BuildingKind; x: number; y: number; damaged?: boolean }[],
  running: ReadonlySet<string>,
  center: { x: number; y: number },
  coverage: Partial<Record<BuildingKind, AmbienceSource>>,
  max = MAX_VOICES,
): AmbienceCandidate[] {
  const heard: { candidate: AmbienceCandidate; distance: number }[] = [];
  for (const building of buildings) {
    // A damaged building is out of action and drawn under scaffolding, so its own sound would be a lie.
    if (building.damaged) continue;
    const source = coverage[building.kind];
    if (!source) continue;
    if (WORK_PROFILE[source.profile] && !running.has(building.id)) continue;
    const point = iso(building.x, building.y);
    const distance = Math.hypot(point.x - center.x, point.y - center.y);
    if (distance >= SILENT_RADIUS) continue;
    const falloff = distance <= FULL_VOLUME_RADIUS
      ? 1
      : 1 - (distance - FULL_VOLUME_RADIUS) / (SILENT_RADIUS - FULL_VOLUME_RADIUS);
    // Squared so the last stretch of the fade is genuinely quiet rather than merely lower.
    heard.push({ candidate: { id: building.id, url: source.url, gain: MASTER_GAIN * falloff * falloff }, distance });
  }
  heard.sort((a, b) => a.distance - b.distance);
  return heard.slice(0, max).map(entry => entry.candidate);
}
