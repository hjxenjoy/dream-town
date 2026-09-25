import type { Building } from './world.ts';

/**
 * A wall run is drawn by picking one piece per tile from how that tile's neighbours are
 * joined. Connection directions are stored by world axis rather than screen direction,
 * because the two are not the same thing: `+x` runs south-east on screen and `+y` runs
 * south-west, so keeping the mask in world axes confines all screen-aware knowledge to the
 * piece table below.
 */
export const WALL_DIRECTIONS = ['+x', '+y', '-x', '-y'] as const;
export type WallDirection = typeof WALL_DIRECTIONS[number];
const OPPOSITE: Record<WallDirection, WallDirection> = { '+x': '-x', '-x': '+x', '+y': '-y', '-y': '+y' };

/** Which of its four neighbours a wall tile joins. */
export interface WallPiece {
  atlas: 'defense-expansion' | 'wall-junctions';
  frame: string;
  /** A mirrored piece is the only way to build the second diagonal out of one shipped frame. */
  flipX?: true;
}

/**
 * Every piece the art actually contains.
 *
 * The two packs ship ten wall frames: one straight, one corner, four caps and four tees.
 * There is no four-way cross, so a four-way junction draws the tee and leaves one arm
 * capped — visible, and better than a tile that cannot be drawn at all.
 *
 * The mirror flags are not decoration: a straight run can lie along either screen diagonal
 * and only one frame exists for it, so the other diagonal is that frame flipped. Flipping
 * mirrors the light source along with the shape. The alternative — rotating by 90° — would
 * break the 2:1 isometric perspective instead, so a mirrored highlight is the lesser error.
 * Both are recorded here rather than hidden in the renderer.
 */
const STRAIGHT: WallPiece = { atlas: 'defense-expansion', frame: 'wall-straight' };
const STRAIGHT_MIRRORED: WallPiece = { atlas: 'defense-expansion', frame: 'wall-straight', flipX: true };

/** Caps, by the direction the wall RUNS IN (i.e. toward its one neighbour). */
const CAP_BY_RUN: Record<WallDirection, string> = {
  '+x': 'wall-end-w', '+y': 'wall-end-s', '-x': 'wall-end-e', '-y': 'wall-end-n',
};
/** Tees, by the one direction they are missing. */
const TEE_BY_MISSING: Record<WallDirection, string> = {
  '+x': 'wall-tee-w', '+y': 'wall-tee-s', '-x': 'wall-tee-e', '-y': 'wall-tee-n',
};

const JOINT_ATLAS = 'wall-junctions' as const;

/**
 * Which piece each of the sixteen neighbour masks draws. Written out in full rather than
 * derived, because this table is the single calibration point against the art: a wrong
 * entry shows up as one visibly mis-joined tile, and correcting it is a one-line edit.
 *
 * Bit order matches WALL_DIRECTIONS: bit 0 = `+x`, bit 1 = `+y`, bit 2 = `-x`, bit 3 = `-y`.
 */
export const WALL_PIECES: Record<number, WallPiece> = {
  // No neighbours: a lone stub, drawn with a cap.
  0: { atlas: JOINT_ATLAS, frame: CAP_BY_RUN['+x'] },
  // One neighbour: a cap at the far end.
  1: { atlas: JOINT_ATLAS, frame: CAP_BY_RUN['+x'] },
  2: { atlas: JOINT_ATLAS, frame: CAP_BY_RUN['+y'] },
  4: { atlas: JOINT_ATLAS, frame: CAP_BY_RUN['-x'] },
  8: { atlas: JOINT_ATLAS, frame: CAP_BY_RUN['-y'] },
  // Two in a line: the run passes straight through.
  [1 | 4]: STRAIGHT,
  [2 | 8]: STRAIGHT_MIRRORED,
  // Two adjacent: an inner corner.
  [1 | 2]: { atlas: 'defense-expansion', frame: 'wall-corner' },
  [2 | 4]: { atlas: 'defense-expansion', frame: 'wall-corner' },
  [4 | 8]: { atlas: 'defense-expansion', frame: 'wall-corner' },
  [8 | 1]: { atlas: 'defense-expansion', frame: 'wall-corner' },
  // Three: a tee, named for the arm it is missing.
  [2 | 4 | 8]: { atlas: JOINT_ATLAS, frame: TEE_BY_MISSING['+x'] },
  [4 | 8 | 1]: { atlas: JOINT_ATLAS, frame: TEE_BY_MISSING['+y'] },
  [8 | 1 | 2]: { atlas: JOINT_ATLAS, frame: TEE_BY_MISSING['-x'] },
  [1 | 2 | 4]: { atlas: JOINT_ATLAS, frame: TEE_BY_MISSING['-y'] },
  // Four: no cross was shipped, so the tee stands in and caps one arm.
  [1 | 2 | 4 | 8]: { atlas: JOINT_ATLAS, frame: TEE_BY_MISSING['-y'] },
};

/** The piece for a mask. Every mask 0-15 is in the table, so this cannot miss. */
export function wallPiece(mask: number): WallPiece {
  return WALL_PIECES[mask & 15]!;
}

/** A tile key, shared with the mask lookup so positions can never disagree. */
export function wallKey(x: number, y: number): string { return `${x},${y}`; }

/**
 * Just the walls, keyed so a neighbour test is one lookup. A gate joins the run: it is a wall
 * piece with an opening in it, so the tiles on either side must still read as one line.
 */
export function wallKeys(buildings: readonly Building[]): Set<string> {
  const keys = new Set<string>();
  // A gate is a wall piece with an opening in it, so it joins the run and the tiles on
  // either side still read as one line.
  for (const building of buildings) if (building.kind === 'wall' || building.kind === 'citygate') keys.add(wallKey(building.x, building.y));
  return keys;
}

/**
 * The gate piece for a tile. It keeps the straight runs' mirroring convention — a run along
 * `±x` draws as shipped, a run along `±y` draws the same frame flipped — and any other
 * placement (a gate at a corner or a lone gate) draws unflipped, which is the frame as drawn.
 */
export function gatePiece(connections: readonly WallDirection[]): WallPiece {
  const alongY = isStraightThrough(connections) && (connections[0] === '+y' || connections[0] === '-y');
  return alongY
    ? { atlas: 'defense-expansion', frame: 'city-gate', flipX: true }
    : { atlas: 'defense-expansion', frame: 'city-gate' };
}

/** The directions in which a wall stands next to this tile. */
export function wallConnections(tile: { x: number; y: number }, walls: ReadonlySet<string>): WallDirection[] {
  const offsets: Record<WallDirection, [number, number]> = { '+x': [1, 0], '+y': [0, 1], '-x': [-1, 0], '-y': [0, -1] };
  return WALL_DIRECTIONS.filter(direction => {
    const [dx, dy] = offsets[direction];
    return walls.has(wallKey(tile.x + dx, tile.y + dy));
  });
}

/** The neighbour mask for a tile: bit 0..3 in WALL_DIRECTIONS order. */
export function wallMask(tile: { x: number; y: number }, walls: ReadonlySet<string>): number {
  return wallConnections(tile, walls).reduce((mask, direction) => mask | (1 << WALL_DIRECTIONS.indexOf(direction)), 0);
}

/** True when two junctions sit on opposite sides, which is what makes a run straight. */
export function isStraightThrough(directions: readonly WallDirection[]): boolean {
  return directions.length === 2 && OPPOSITE[directions[0]!] === directions[1];
}
