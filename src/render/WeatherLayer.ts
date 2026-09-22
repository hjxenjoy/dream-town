import Phaser from 'phaser';
import { iso } from '../sim/terrain';
import { WEATHER, type WeatherKind } from '../sim/weather';
import type { Building } from '../sim/world';
import { drawFrameWidth } from './atlasSprite';

/** The weather icon hangs over the town, sized like a landmark rather than a building. */
const SIGIL_WIDTH = 190;

/**
 * Weather over the town: one icon above the hall, and a seamless tile across the view. The
 * tiles were drawn as a 512×512 periodic texture precisely for this, so they are laid with a
 * tile sprite rather than repeated by hand.
 */
export class WeatherLayer {
  private sigil?: Phaser.GameObjects.Image;
  private overlay?: Phaser.GameObjects.TileSprite;
  private current: WeatherKind | null = null;

  constructor(private scene: Phaser.Scene) {}

  sync(kind: WeatherKind, townhall: Building | undefined, time: number, reduced: boolean): void {
    if (kind !== this.current) this.rebuild(kind);
    if (!this.sigil) return;

    // The icon sits above the hall so it reads as the sky over the whole settlement.
    const anchor = townhall ? iso(townhall.x, townhall.y) : { x: 0, y: 0 };
    const bobbing = reduced ? 0 : Math.sin(time / 900) * 4;
    this.sigil.setPosition(anchor.x, anchor.y - 150 + bobbing);

    if (this.overlay) {
      const camera = this.scene.cameras.main;
      // The overlay follows the camera rather than the world: rain falls everywhere the player
      // can see, and a tile anchored in the world would leave the viewport bare when panning.
      this.overlay.setPosition(camera.scrollX, camera.scrollY);
      this.overlay.setSize(camera.width, camera.height);
      this.overlay.setOrigin(0, 0);
      const scale = WEATHER[kind].tileScale ?? 1;
      // Tile positions are in texture pixels, so the scroll has to be scaled to match or the
      // pattern would drift out of step with the ground it is falling on.
      this.overlay.setTilePosition(camera.scrollX / scale, (camera.scrollY + (reduced ? 0 : time / 22)) / scale);
    }
  }

  /** Swaps in the art for a new kind, tearing down whatever the last one needed. */
  private rebuild(kind: WeatherKind): void {
    this.current = kind;
    const definition = WEATHER[kind];
    this.sigil?.destroy();
    this.overlay?.destroy();
    this.overlay = undefined;

    const fresh = this.scene.add.image(0, 0, 'weather-expansion', definition.frame).setOrigin(.5, .5);
    drawFrameWidth(fresh, 'weather-expansion', definition.frame, SIGIL_WIDTH);
    // Above every building and effect, but below the interface.
    fresh.setDepth(9000).setAlpha(.9);
    this.sigil = fresh;

    if (definition.tile) {
      const camera = this.scene.cameras.main;
      this.overlay = this.scene.add.tileSprite(0, 0, camera.width, camera.height, definition.tile)
        .setOrigin(0, 0)
        .setDepth(8990)
        .setAlpha(definition.tileAlpha ?? 0.5);
      // The repeat scale and the fade come from the weather table, because the tiles are not
      // alike: fog is a full-screen veil, rain and snow are sparse specks that have to be
      // repeated many times before they read as anything at all.
      this.overlay.setTileScale(definition.tileScale ?? 1);
    }
  }

  /** Frames the icon needs, so a missing one cannot silently draw as the whole atlas. */
  static frames(): string[] {
    return Object.values(WEATHER).map(definition => definition.frame);
  }
}
