/**
 * A stable pseudo-random fraction in [0, 1) from an integer.
 *
 * The game needs chance in places that must survive a reload and settle identically offline —
 * what weather a season brings, whether a caravan is waylaid. A `Math.random()` call cannot do
 * that, and a counter run through a weak hash does not either: measured over sequential seeds,
 * `imul(seed + 1, 2654435761) % 10000` produced a raid 37% of the time immediately after a raid
 * when the true rate was 30%, so raids arrived in visible pairs.
 *
 * The sine is a whole-world uniform enough for this, and it is what the terrain and road
 * painters already use, so there is one derivation rather than three.
 */
export function noise(n: number): number {
  const x = Math.sin(n * 91.73) * 43758.545;
  return x - Math.floor(x);
}
