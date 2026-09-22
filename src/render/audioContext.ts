/**
 * One AudioContext for the whole page. Browsers cap how many a page may create, and the
 * action chimes and the building ambience have to share a clock and a destination or they
 * drift apart and fight over the output. Creation is lazy because a context made before the
 * player's first gesture starts suspended.
 */
let context: AudioContext | undefined;

export function sharedAudioContext(): AudioContext {
  context ??= new AudioContext();
  if (context.state === 'suspended') void context.resume();
  return context;
}
