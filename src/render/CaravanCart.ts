import Phaser from 'phaser';
import { iso } from '../sim/terrain';
import { CART_PARK_FRAMES, CART_TRAVEL_FRAMES, caravanPose, caravanRoute, type CartPose } from '../sim/caravan';
import { destinationOf } from '../sim/destinations';
import { tileKey } from '../sim/roads';
import type { Building, Caravan, SimWorld } from '../sim/world';
import { drawFrameWidth } from './atlasSprite';

const FRAME_MS = 300;
const CART_WIDTH = 132;

/** One cart on the map: its sprite plus the route it is currently walking. */
interface Cart {
  sprite: Phaser.GameObjects.Image;
  route: { x: number; y: number }[];
  /** What the route was built from, so it is only rebuilt when the town or the route changes. */
  signature: string;
}

/**
 * Every caravan on the map. Routes are A* results over the real road network, so they are
 * cached per cart and rebuilt only when the buildings, roads or that cart's destination change
 * — never per frame.
 */
export class CaravanCart {
  private carts = new Map<string, Cart>();

  constructor(private scene: Phaser.Scene) {}

  sync(world: SimWorld, time: number, reduced: boolean): void {
    const { buildings, roads, caravans } = world.state;
    const townKey = buildings.map(tileKey).join('|') + ';' + (roads ?? []).map(tileKey).join('|');
    const live = new Set<string>();
    for (const caravan of caravans as Caravan[]) {
      live.add(caravan.id);
      const cart = this.carts.get(caravan.id) ?? this.createCart(caravan.id);
      this.syncCart(cart, caravan, buildings, roads ?? [], townKey, world.state.gameTime, time, reduced);
    }
    for (const [id, cart] of this.carts) {
      if (live.has(id)) continue;
      cart.sprite.destroy(); this.carts.delete(id);
    }
  }

  private createCart(id: string): Cart {
    return { sprite: this.scene.add.image(0, 0, 'caravan').setOrigin(.5, .88), route: [], signature: '' };
  }

  private syncCart(cart: Cart, caravan: Caravan, buildings: Building[], roads: { x: number; y: number; kind: string }[], townKey: string, gameTime: number, time: number, reduced: boolean): void {
    // The destination is part of the route's identity: each one crosses its own bridge.
    const destination = destinationOf(caravan.destination);
    const signature = townKey + ';' + destination.id;
    if (signature !== cart.signature) {
      cart.signature = signature;
      cart.route = caravanRoute(buildings, roads, destination.bridge) as { x: number; y: number }[];
    }
    const pose: CartPose = caravanPose(caravan, cart.route as never, gameTime);
    const point = iso(pose.x, pose.y);
    const frames = pose.moving ? CART_TRAVEL_FRAMES[pose.load] : CART_PARK_FRAMES[pose.load];
    const frame = frames[reduced ? 0 : Math.floor(time / FRAME_MS) % frames.length]!;
    // The cart is mirrored on the way home so it visibly returns rather than sliding back.
    drawFrameWidth(cart.sprite, 'caravan', frame, CART_WIDTH);
    cart.sprite.setPosition(point.x, point.y).setDepth(point.y + 7).setFlipX(pose.direction === 'back');
  }
}
