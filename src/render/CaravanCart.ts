import Phaser from 'phaser';
import { iso } from '../sim/terrain';
import { CART_PARK_FRAMES, CART_TRAVEL_FRAMES, caravanPose, caravanRoute } from '../sim/caravan';
import { tileKey } from '../sim/roads';
import type { SimWorld } from '../sim/world';
import { drawFrameWidth } from './atlasSprite';

const FRAME_MS = 300;
const CART_WIDTH = 132;

/**
 * The caravan on the map. The route is an A* result, so it is recomputed only when
 * the town's buildings or roads change, never per frame.
 */
export class CaravanCart {
  private sprite?: Phaser.GameObjects.Image;
  private route: { x: number; y: number }[] = [];
  private signature = '';

  constructor(private scene: Phaser.Scene) {}

  sync(world: SimWorld, time: number, reduced: boolean): void {
    const { buildings, roads, caravan } = world.state;
    const signature = buildings.map(tileKey).join('|') + ';' + (roads ?? []).map(tileKey).join('|');
    if (signature !== this.signature) {
      this.signature = signature;
      // The route follows real roads, so it must be rebuilt when the town changes.
      this.route = caravanRoute(buildings, roads ?? []);
    }
    const pose = caravanPose(caravan, this.route as never, world.state.gameTime);
    const point = iso(pose.x, pose.y);
    const frames = pose.moving ? CART_TRAVEL_FRAMES[pose.load] : CART_PARK_FRAMES[pose.load];
    const frame = frames[reduced ? 0 : Math.floor(time / FRAME_MS) % frames.length]!;
    if (!this.sprite) {
      this.sprite = this.scene.add.image(point.x, point.y, 'caravan').setOrigin(.5, .88);
    }
    // The cart is mirrored on the way home so it visibly returns rather than sliding back.
    const flip = pose.direction === 'back';
    drawFrameWidth(this.sprite, 'caravan', frame, CART_WIDTH);
    this.sprite.setPosition(point.x, point.y).setDepth(point.y + 7).setFlipX(flip);
  }
}
