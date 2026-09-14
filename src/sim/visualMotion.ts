/** Cosmetic motion follows activity, without changing simulation or path finding. */
export function residentMotion(time: number, index: number, delta: number, walking: boolean, working: boolean, reduced: boolean): { frame: number; bob: number } {
  const animated = delta > 0 && !reduced;
  return {
    frame: animated && (walking || working) ? Math.floor(time / 280 + index) % 2 : 0,
    bob: animated && walking ? Math.sin(time / 140 + index) * .6 : 0,
  };
}
