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
  /** Which atlas draws this one: a cart for the roads, a ship for the sea voyages. */
  texture: string;
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
      // A sea voyage is drawn with a ship, not a cart: sending a wagon across open water would
      // be a lie the player can see. The atlas swaps with the destination, so the same cart id
      // can carry either.
      const voyage = Boolean(destinationOf(caravan.destination).island);
      const texture = voyage ? 'transport-expansion' : 'caravan';
      if (this.carts.has(caravan.id) && this.carts.get(caravan.id)!.texture !== texture) {
        this.carts.get(caravan.id)!.sprite.destroy();
        this.carts.delete(caravan.id);
      }
      const cart = this.carts.get(caravan.id) ?? this.createCart(caravan.id, texture);
      this.syncCart(cart, caravan, buildings, roads ?? [], townKey, world.state.gameTime, time, reduced);
    }
    for (const [id, cart] of this.carts) {
      if (live.has(id)) continue;
      cart.sprite.destroy(); this.carts.delete(id);
    }
  }

  /**
   * Creates a cart and RETAINS it under its id, the way `MachineLayer.create` retains its parts.
   * A factory that returns without storing leaves the pool permanently empty: the retire loop
   * below then has nothing to clean up, and a fresh sprite is leaked every frame — one per cart
   * per frame, each left behind wherever it was last drawn.
   */
  private createCart(id: string, texture: string): Cart {
    const cart: Cart = { sprite: this.scene.add.image(0, 0, texture).setOrigin(.5, .88), route: [], signature: '', texture };
    this.carts.set(id, cart);
    return cart;
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
    const voyage = cart.texture !== 'caravan';
    const frame = voyage
      ? 'cargo-ship'
      : (pose.moving ? CART_TRAVEL_FRAMES[pose.load] : CART_PARK_FRAMES[pose.load])[reduced ? 0 : Math.floor(time / FRAME_MS) % 2]!;
    // The cart is mirrored on the way home so it visibly returns rather than sliding back.
    drawFrameWidth(cart.sprite, cart.texture, frame, CART_WIDTH);
    cart.sprite.setPosition(point.x, point.y).setDepth(point.y + 7).setFlipX(pose.direction === 'back');
  }
}
