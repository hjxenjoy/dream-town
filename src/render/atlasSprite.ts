import type Phaser from 'phaser';

/**
 * The single way this codebase sizes an atlas-backed sprite.
 *
 * Sizing must be re-applied every time the frame changes, and it must be derived from
 * the frame currently displayed. Applying it once at creation and then swapping frames
 * leaves whatever scale the first frame happened to produce: identical hazard effects
 * then render at different sizes, and a part drawn from a large atlas cell dwarfs the map.
 */

/** Draws a frame at a fixed on-screen width, preserving the frame's aspect ratio. */
export function drawFrameWidth(
  image: Phaser.GameObjects.Image,
  texture: string,
  frame: string,
  targetWidth: number,
): void {
  image.setTexture(texture, frame);
  image.setScale(targetWidth / image.frame.width);
}

/** Draws a frame at an explicit scale. Used where art pixels must map to screen pixels. */
export function drawFrameScale(
  image: Phaser.GameObjects.Image,
  texture: string,
  frame: string,
  scale: number,
): void {
  image.setTexture(texture, frame);
  image.setScale(scale);
}

/**
 * The scale that draws a frame at `targetWidth`. Exported so code that positions a sprite
 * from its own layout metrics — a part rotating about a measured pivot — uses the same
 * derivation as everything else instead of re-implementing it.
 */
export function frameScale(frameWidth: number, targetWidth: number): number {
  return targetWidth / frameWidth;
}
