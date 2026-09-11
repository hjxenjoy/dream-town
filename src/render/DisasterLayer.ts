import Phaser from 'phaser';
import { iso } from '../sim/terrain';
import { ALERT_FRAME_MS, ALERT_FRAMES, HAZARD_FRAME_MS, hazardOverlay, loopFrame } from '../sim/disasters';
import type { Building } from '../sim/world';

const MAX_EFFECTS = 24;

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
      sprite.setTexture('disasters', overlay.frame);
      const alert = this.place(this.alerts, building.id, point);
      alert.setTexture('disasters', loopFrame(ALERT_FRAMES, time, ALERT_FRAME_MS, reduced)).setVisible(overlay.warning);
      alert.setPosition(point.x + 30, point.y - sprite.displayHeight * .72);
    }
    this.retire(this.effects, active);
    this.retire(this.alerts, active);
  }

  private place(pool: Map<string, Phaser.GameObjects.Image>, id: string, point: { x: number; y: number }): Phaser.GameObjects.Image {
    let sprite = pool.get(id);
    if (!sprite) {
      sprite = this.scene.add.image(point.x, point.y, 'disasters').setOrigin(.5, .92);
      sprite.setDisplaySize(112, 112 * sprite.frame.height / sprite.frame.width);
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
