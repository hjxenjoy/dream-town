import { audibleAmbience, type AmbienceSource } from '../sim/ambience';
import { sharedAudioContext } from './audioContext';
import type { BuildingKind } from '../sim/data';

/**
 * Building ambience: the loops delivered with the accessory pack, mixed by distance from the
 * camera. The catalogue is fetched rather than bundled — it is 42KB of JSON that only matters
 * once sound is actually in use, and the pack it belongs to is deliberately outside the
 * offline precache, so both arrive together on first need.
 */
const CATALOGUE_URL = '/assets/accessories-2026-09/audio/manifest.json';
/** Re-picking which buildings are audible four times a second is plenty; the gains still ramp smoothly. */
const SELECTION_INTERVAL_MS = 400;
/** Fade time for both starting and stopping a loop, so nothing ever clicks. */
const RAMP_SECONDS = 0.7;

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

export class Ambience {
  private coverage: Partial<Record<BuildingKind, AmbienceSource>> | null = null;
  private requested = false;
  private buffers = new Map<string, AudioBuffer | null>();
  private loading = new Set<string>();
  private voices = new Map<string, Voice>();
  private nextSelectionAt = 0;

  /**
   * `enabled` is read every frame rather than captured, so turning the sound setting off stops
   * the loops immediately instead of at the next scene rebuild.
   */
  constructor(private enabled: () => boolean) {}

  private async loadCatalogue() {
    if (this.requested) return;
    this.requested = true;
    try {
      const response = await fetch(CATALOGUE_URL);
      if (!response.ok) throw new Error(String(response.status));
      const manifest = await response.json() as { buildingCoverage?: Record<string, AmbienceSource> };
      if (manifest.buildingCoverage) this.coverage = manifest.buildingCoverage as Partial<Record<BuildingKind, AmbienceSource>>;
    } catch {
      // Sound is optional: a missing catalogue leaves the town silent rather than broken.
    }
  }

  private loadTrack(url: string) {
    if (this.buffers.has(url) || this.loading.has(url)) return;
    this.loading.add(url);
    void (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(String(response.status));
        const buffer = await sharedAudioContext().decodeAudioData(await response.arrayBuffer());
        this.buffers.set(url, buffer);
      } catch {
        // A track that will not decode is remembered as silent so it is never fetched again.
        this.buffers.set(url, null);
      } finally {
        this.loading.delete(url);
      }
    })();
  }

  /** Fades a voice out, then releases it; a stopped source can never be restarted. */
  private stop(voice: Voice, context: AudioContext) {
    const end = context.currentTime + RAMP_SECONDS;
    voice.gain.gain.cancelScheduledValues(context.currentTime);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, context.currentTime);
    voice.gain.gain.linearRampToValueAtTime(0, end);
    voice.source.stop(end);
  }

  private stopAll() {
    for (const voice of this.voices.values()) this.stop(voice, sharedAudioContext());
    this.voices.clear();
  }

  sync(
    buildings: readonly { id: string; kind: BuildingKind; x: number; y: number; damaged?: boolean }[],
    running: ReadonlySet<string>,
    center: { x: number; y: number },
    nowMs: number,
  ) {
    if (!this.enabled()) {
      if (this.voices.size) this.stopAll();
      return;
    }
    void this.loadCatalogue();
    if (!this.coverage) return;
    if (nowMs < this.nextSelectionAt) return;
    this.nextSelectionAt = nowMs + SELECTION_INTERVAL_MS;

    const context = sharedAudioContext();
    const wanted = audibleAmbience(buildings, running, center, this.coverage);
    const wantedIds = new Set(wanted.map(entry => entry.id));
    for (const [id, voice] of this.voices) {
      if (wantedIds.has(id)) continue;
      this.voices.delete(id);
      this.stop(voice, context);
    }
    for (const entry of wanted) {
      const existing = this.voices.get(entry.id);
      if (existing) {
        existing.gain.gain.setTargetAtTime(entry.gain, context.currentTime, RAMP_SECONDS / 3);
        continue;
      }
      this.loadTrack(entry.url);
      const buffer = this.buffers.get(entry.url);
      if (!buffer) continue;
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      source.loop = true;
      // Starts silent and fades in, so arriving at the edge of earshot is not a jump.
      gain.gain.value = 0;
      source.connect(gain).connect(context.destination);
      source.start();
      gain.gain.setTargetAtTime(entry.gain, context.currentTime, RAMP_SECONDS / 3);
      this.voices.set(entry.id, { source, gain });
    }
  }
}
