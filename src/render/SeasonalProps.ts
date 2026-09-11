import Phaser from 'phaser';
import { iso } from '../sim/terrain';
import { SEASONAL_ACTIVITIES } from '../sim/seasonal';
import type { SimWorld } from '../sim/world';

/**
 * The prop that appears beside the town hall while a seasonal activity runs.
 * One pooled image, created on demand and hidden the rest of the year.
 */
export class SeasonalProps {
  private sprite?: Phaser.GameObjects.Image;
  private shown: string | null = null;

  constructor(private scene: Phaser.Scene) {}

  sync(world: SimWorld): void {
    const active = world.activityActive() ? world.state.activity! : null;
    if (!active) {
      if (this.shown) {
        this.sprite?.setVisible(false);
        this.shown = null;
      }
      return;
    }
    const hall = world.state.buildings.find(building => building.kind === 'townhall');
    if (!hall) return;
    const asset = SEASONAL_ACTIVITIES[active.season];
    if (asset.prop === this.shown) return;
    const point = iso(hall.x + 2, hall.y + 1);
    if (!this.sprite) {
      this.sprite = this.scene.add.image(point.x, point.y, 'season-props', asset.prop).setOrigin(.5, .88);
      const width = 118;
      this.sprite.setDisplaySize(width, width * this.sprite.frame.height / this.sprite.frame.width);
    }
    this.sprite.setTexture('season-props', asset.prop).setPosition(point.x, point.y).setDepth(point.y + 6).setVisible(true);
    this.shown = asset.prop;
  }
}
