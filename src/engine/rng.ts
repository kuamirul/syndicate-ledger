// Deterministic Mulberry32 PRNG (Pure TypeScript, Zero Math.random/Date.now/crypto)

/**
 * Pure single-step Mulberry32 PRNG.
 * Given a 32-bit integer state, returns a pseudo-random float in [0, 1) and the next state.
 */
export function mulberry32Step(state: number): { value: number; nextState: number } {
  let t = (state + 0x6D2B79F5) | 0;
  const nextState = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, nextState };
}

/**
 * Deterministically rolls an integer percentage between 1 and 100 (inclusive).
 */
export function rollPercentage(state: number): { roll: number; nextState: number } {
  const { value, nextState } = mulberry32Step(state);
  const roll = 1 + Math.floor(value * 100);
  return { roll, nextState };
}

/**
 * Deterministically generates an integer in [min, max] (both inclusive).
 */
export function randomInt(
  state: number,
  min: number,
  max: number
): { value: number; nextState: number } {
  if (min > max) {
    throw new Error(`randomInt min (${min}) cannot exceed max (${max})`);
  }
  const { value, nextState } = mulberry32Step(state);
  const range = max - min + 1;
  const intVal = min + Math.floor(value * range);
  return { value: intVal, nextState };
}

/**
 * Stateful PRNG wrapper around mulberry32 for headless simulation runners,
 * CLI tests, and scripts where an object interface is convenient.
 */
export class DeterministicRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  public getState(): number {
    return this.state;
  }

  public setState(state: number): void {
    this.state = state | 0;
  }

  public next(): number {
    const { value, nextState } = mulberry32Step(this.state);
    this.state = nextState;
    return value;
  }

  public nextInt(min: number, max: number): number {
    const { value, nextState } = randomInt(this.state, min, max);
    this.state = nextState;
    return value;
  }

  public rollPercentage(): number {
    const { roll, nextState } = rollPercentage(this.state);
    this.state = nextState;
    return roll;
  }
}
