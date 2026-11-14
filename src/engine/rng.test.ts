import { describe, expect, it } from 'vitest';
import { DeterministicRNG, mulberry32Step, randomInt, rollPercentage } from './rng';

describe('Deterministic Mulberry32 PRNG', () => {
  it('generates identical sequence given the same seed', () => {
    const seed = 123456789;
    const rng1 = new DeterministicRNG(seed);
    const rng2 = new DeterministicRNG(seed);

    const seq1 = Array.from({ length: 50 }, () => rng1.next());
    const seq2 = Array.from({ length: 50 }, () => rng2.next());

    expect(seq1).toEqual(seq2);
  });

  it('generates different sequences given different seeds', () => {
    const rng1 = new DeterministicRNG(1111);
    const rng2 = new DeterministicRNG(2222);

    const val1 = rng1.next();
    const val2 = rng2.next();

    expect(val1).not.toEqual(val2);
  });

  it('produces floats in [0, 1)', () => {
    let state = 42;
    for (let i = 0; i < 5000; i++) {
      const { value, nextState } = mulberry32Step(state);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      state = nextState;
    }
  });

  it('rollPercentage always produces integers in [1, 100]', () => {
    let state = 987654321;
    let minRoll = 100;
    let maxRoll = 1;

    for (let i = 0; i < 10000; i++) {
      const { roll, nextState } = rollPercentage(state);
      expect(Number.isInteger(roll)).toBe(true);
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(100);

      if (roll < minRoll) minRoll = roll;
      if (roll > maxRoll) maxRoll = roll;

      state = nextState;
    }

    // In 10,000 rolls, we expect to touch the boundaries or very close to them
    expect(minRoll).toBeLessThanOrEqual(5);
    expect(maxRoll).toBeGreaterThanOrEqual(95);
  });

  it('randomInt produces integers within range [min, max]', () => {
    let state = 1337;
    const min = -10;
    const max = 25;

    for (let i = 0; i < 1000; i++) {
      const { value, nextState } = randomInt(state, min, max);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(min);
      expect(value).toBeLessThanOrEqual(max);
      state = nextState;
    }
  });

  it('randomInt throws when min > max', () => {
    expect(() => randomInt(42, 10, 5)).toThrowError(/cannot exceed max/);
  });

  it('DeterministicRNG class supports state get/set', () => {
    const rng = new DeterministicRNG(999);
    rng.next();
    rng.nextInt(1, 10);
    const savedState = rng.getState();

    const nextVal1 = rng.next();

    rng.setState(savedState);
    const nextVal2 = rng.next();

    expect(nextVal1).toEqual(nextVal2);
  });
});
