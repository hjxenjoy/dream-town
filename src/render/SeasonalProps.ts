import Phaser from 'phaser';
import { iso } from '../sim/terrain';
import { SEASONAL_ACTIVITIES } from '../sim/seasonal';
import type { SimWorld } from '../sim/world';
import { drawFrameWidth } from './atlasSprite';

/**
 * The prop that appears beside the town hall while a seasonal activity runs.
 * One pooled image, created on demand and hidden the rest of the year.
 */
/** The stall reads as a small shop, so it stays close to a building's width. */
const PROP_WIDTH = 118;

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
    if (!hall) { this.sprite?.setVisible(false); this.shown = null; return; }
    const asset = SEASONAL_ACTIVITIES[active.season];
    // Beside the hall's yard rather than on it: a hall that claims more ground pushes the
    // stalls the same distance out, and a one-tile hall keeps the spot it always had.
    const point = iso(hall.x + (hall.footprint ?? 1) + 1, hall.y + 1);
    if (!this.sprite) {
      this.sprite = this.scene.add.image(point.x, point.y, 'season-props').setOrigin(.5, .88);
    }
    // Size follows the displayed frame, so a new season's prop is never scaled by the old one.
    if (asset.prop !== this.shown) drawFrameWidth(this.sprite, 'season-props', asset.prop, PROP_WIDTH);
    this.sprite.setPosition(point.x, point.y).setDepth(point.y + 6).setVisible(true);
    this.shown = asset.prop;
  }
}
