import type { ResourceMap } from './data.ts';

export type PetKind = 'cat' | 'dog';

export interface PetDefinition {
  name: string;
  description: string;
  /** Frames in the `pets` atlas: front pair and back pair, two steps each. */
  frames: { front: readonly [string, string]; back: readonly [string, string] };
  coins: number;
  materials: Partial<ResourceMap>;
  /** How far behind its resident a pet trails, in tiles. */
  leash: number;
  /** Tiles per second relative to a resident's pace. */
  pace: number;
}

export const PETS: Record<PetKind, PetDefinition> = {
  cat: {
    name: '橘猫', description: '一只喜欢在墙头跟路的橘猫，走得慢，但总是跟着你。',
    frames: { front: ['cat-front-0', 'cat-front-1'], back: ['cat-back-0', 'cat-back-1'] },
    coins: 120, materials: { materials: 1 }, leash: 2, pace: 0.82,
  },
  dog: {
    name: '小黄狗', description: '一只跑前跑后的小黄狗，跟着邻居在镇上到处转。',
    frames: { front: ['dog-front-0', 'dog-front-1'], back: ['dog-back-0', 'dog-back-1'] },
    coins: 160, materials: { materials: 1 }, leash: 3, pace: 1.15,
  },
};

export const PET_KINDS: readonly PetKind[] = ['cat', 'dog'];

/** One adopted pet. `follows` is the index of the resident it trails. */
export interface PetState {
  id: string;
  kind: PetKind;
  follows: number;
}

/** How many pets the town will take in. One per six residents, and never more than six. */
export function petCapacity(population: number): number {
  return Math.min(6, Math.floor(Math.max(0, population) / 6));
}

/** A pet is assigned to a resident by walker index, wrapping as the crowd changes size. */
export function petLeash(pet: PetState, residents: number): number {
  if (residents <= 0) return -1;
  return ((pet.follows % residents) + residents) % residents;
}

/** Whether adopting another pet is allowed right now, with the reason when it is not. */
export function adoptionIssue(pets: readonly PetState[], population: number): string | null {
  if (pets.length < petCapacity(population)) return null;
  const limit = petCapacity(population);
  return limit === 0
    ? '先有六位邻居，小镇才会收留小动物。'
    : `小镇最多照顾 ${limit} 只小动物，已经满员了。`;
}
