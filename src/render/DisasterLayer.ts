import Phaser from 'phaser';
import { iso } from '../sim/terrain';
import { ALERT_FRAME_MS, ALERT_FRAMES, HAZARD_FRAME_MS, hazardOverlay, loopFrame } from '../sim/disasters';
import type { Building } from '../sim/world';
import { drawFrameWidth } from './atlasSprite';

const MAX_EFFECTS = 24;
/** Hazard effects share one footprint so no kind looks arbitrarily larger than another. */
const EFFECT_WIDTH = 112;
/** The warning bell is a marker, not an effect, so it stays small. */
const BELL_WIDTH = 60;

/**
 * Hazard and repair overlays. Keeps one pooled image per affected building instead
 * of a particle emitter, and skips anything outside the viewport.
 */
export class DisasterLayer {
  private effects = new Map<string, Phaser.GameObjects.Image>();
  private alerts = new Map<string, Phaser.GameObjects.Image>();

  constructor(private scene: Phaser.Scene) {}

  sync(buildings: Building[], time: number, reduced: boolean): void {
    const view = this.scene.cameras.main.worldView;
    const active = new Set<string>();
    let drawn = 0;
    for (const building of buildings) {
      const overlay = hazardOverlay(building, time, reduced);
      if (!overlay) continue;
      const point = iso(building.x, building.y);
      if (!Phaser.Geom.Rectangle.Contains(view, point.x, point.y)) continue;
      if (drawn++ >= MAX_EFFECTS) break;
      active.add(building.id);

      const sprite = this.place(this.effects, building.id, point);
      drawFrameWidth(sprite, 'disasters', overlay.frame, EFFECT_WIDTH);
      const alert = this.place(this.alerts, building.id, point);
      drawFrameWidth(alert, 'disasters', loopFrame(ALERT_FRAMES, time, ALERT_FRAME_MS, reduced), BELL_WIDTH);
      // The bell hangs above the effect, so its own size follows the effect's height.
      alert.setDepth(point.y + 240).setPosition(point.x + 30, point.y - sprite.displayHeight * .72);
    }
    this.retire(this.effects, active);
    this.retire(this.alerts, active);
  }

  private place(pool: Map<string, Phaser.GameObjects.Image>, id: string, point: { x: number; y: number }): Phaser.GameObjects.Image {
    let sprite = pool.get(id);
    if (!sprite) {
      sprite = this.scene.add.image(point.x, point.y, 'disasters').setOrigin(.5, .92);
      pool.set(id, sprite);
    }
    sprite.setPosition(point.x, point.y).setDepth(point.y + 8).setVisible(true);
    return sprite;
  }

  private retire(pool: Map<string, Phaser.GameObjects.Image>, active: Set<string>): void {
    for (const [id, sprite] of pool) {
      if (active.has(id)) continue;
      sprite.destroy();
      pool.delete(id);
    }
  }
}
