import Phaser from 'phaser';
import { iso } from '../sim/terrain';
import { MACHINE_PARTS, machinePivot, partAngle } from '../sim/machines';
import type { Building } from '../sim/world';

interface Part {
  image: Phaser.GameObjects.Image;
  frame: string;
  /** Degrees per second while running, or the swing amplitude for back-and-forth parts. */
  spin: number;
  swing?: number;
  angle: number;
  /** Accumulated running time, so pausing holds the current angle instead of resetting. */
  seconds: number;
}

const PART_WIDTH = 96;

/**
 * Turning parts over working workshops. A part is placed at the attachment fraction of
 * its building's sprite box and rotates about its measured pivot, so the windmill sails
 * turn only while the mill is actually grinding.
 */
export class MachineLayer {
  private parts = new Map<string, Part>();

  constructor(private scene: Phaser.Scene) {}

  /** `running` lists buildings whose cycle advanced since the last frame. */
  sync(buildings: Building[], running: Set<string>, deltaMs: number, reduced: boolean): void {
    const live = new Set<string>();
    for (const building of buildings) {
      const attachment = MACHINE_PARTS[building.kind];
      if (!attachment || building.damaged) continue;
      live.add(building.id);
      const part = this.parts.get(building.id) ?? this.create(building.id, attachment.frame, attachment.spin, attachment.swing);
      const slice = this.scene.textures.get('machine-layers').get(part.frame);
      const scale = PART_WIDTH / slice.width;
      const point = iso(building.x, building.y);
      // The building sprite is bottom-anchored, so its box top sits one box height above.
      const boxTop = point.y - slice.height * scale;
      part.image.setPosition(
        point.x + (attachment.attach.x - .5) * slice.width * scale,
        boxTop + attachment.attach.y * slice.height * scale,
      );
      if (running.has(building.id) && !reduced) part.seconds += deltaMs / 1000;
      part.angle = partAngle(part.seconds, part.spin, part.swing);
      part.image.setRotation(Phaser.Math.DegToRad(part.angle)).setDepth(point.y + 6);
    }
    for (const [id, part] of this.parts) {
      if (live.has(id)) continue;
      part.image.destroy();
      this.parts.delete(id);
    }
  }

  private create(id: string, frame: string, spin: number, swing: number | undefined): Part {
    const texture = this.scene.textures.get('machine-layers');
    const slice = texture.get(frame);
    const pivot = machinePivot(frame);
    const image = this.scene.add.image(0, 0, 'machine-layers', frame);
    if (pivot) image.setOrigin(pivot.x / slice.width, pivot.y / slice.height);
    const part: Part = { image, frame, spin, swing, angle: 0, seconds: 0 };
    this.parts.set(id, part);
    return part;
  }
}
