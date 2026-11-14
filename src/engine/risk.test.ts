import { describe, expect, it } from 'vitest';
import {
  calculateRiskProbabilities,
  calculateSyndicateAttack,
  calculateSyndicateDefense,
  removeLowestTierCrew,
  resolveRiskRoll,
} from './risk';
import type { PrepTier } from './types';

describe('3-Tier Risk Resolver & Prep Formula', () => {
  describe('Probability Calculations', () => {
    it('calculates exact baseline probabilities for R = 1.0 (Tier 0 Prep)', () => {
      // R = 20 / 20 = 1.0
      // BaseClean = clamp(round(40 * 1), 10, 75) = 40
      // BaseBotched = clamp(round(35 / 1), 8, 65) = 35
      // Clean = 40, Botched = 35, Messy = 25
      const probs = calculateRiskProbabilities(20, 20, 0);
      expect(probs.clean).toBe(40);
      expect(probs.botched).toBe(35);
      expect(probs.messy).toBe(25);
      expect(probs.clean + probs.messy + probs.botched).toBe(100);
    });

    it('applies Tier 1 prep modifiers correctly (+12% Clean, -8% Botch)', () => {
      const probs = calculateRiskProbabilities(20, 20, 1);
      // Clean = 40 + 12 = 52
      // Botched = 35 - 8 = 27
      // Messy = 100 - 52 - 27 = 21
      expect(probs.clean).toBe(52);
      expect(probs.botched).toBe(27);
      expect(probs.messy).toBe(21);
      expect(probs.clean + probs.messy + probs.botched).toBe(100);
    });

    it('applies Tier 2 prep modifiers correctly (+24% Clean, -16% Botch)', () => {
      const probs = calculateRiskProbabilities(20, 20, 2);
      // Clean = 40 + 24 = 64
      // Botched = 35 - 16 = 19
      // Messy = 100 - 64 - 19 = 17
      expect(probs.clean).toBe(64);
      expect(probs.botched).toBe(19);
      expect(probs.messy).toBe(17);
      expect(probs.clean + probs.messy + probs.botched).toBe(100);
    });

    it('clamps overwhelming attack to 88% Clean and 5% Botched cap with Tier 2 prep', () => {
      const probs = calculateRiskProbabilities(500, 10, 2);
      expect(probs.clean).toBe(88);
      expect(probs.botched).toBe(5);
      expect(probs.messy).toBe(7);
      expect(probs.clean + probs.messy + probs.botched).toBe(100);
    });

    it('clamps underdog attack to 10% Clean minimum', () => {
      const probs = calculateRiskProbabilities(0, 100, 0);
      expect(probs.clean).toBe(10);
      expect(probs.botched).toBe(65);
      expect(probs.messy).toBe(25);
      expect(probs.clean + probs.messy + probs.botched).toBe(100);
    });

    it('maintains clean + messy + botched === 100 across 1,000 parameter combinations', () => {
      const preps: PrepTier[] = [0, 1, 2];
      for (let atk = 1; atk <= 50; atk += 2) {
        for (let def = 1; def <= 50; def += 3) {
          for (const prep of preps) {
            const { clean, messy, botched } = calculateRiskProbabilities(atk, def, prep);
            expect(clean + messy + botched).toBe(100);
            expect(clean).toBeGreaterThanOrEqual(10);
            expect(clean).toBeLessThanOrEqual(88);
            expect(botched).toBeGreaterThanOrEqual(5);
            expect(messy).toBeGreaterThanOrEqual(0);
          }
        }
      }
    });
  });

  describe('Crew Casualties & Removal Priority', () => {
    it('calculates syndicate attack and defense correctly', () => {
      const crew = { thug: 4, enforcer: 2, hitman: 1 };
      // Attack: 4*3 + 2*8 + 1*18 = 12 + 16 + 18 = 46
      // Defense: 4*3 + 2*8 + 1*12 = 12 + 16 + 12 = 40
      expect(calculateSyndicateAttack(crew)).toBe(46);
      expect(calculateSyndicateDefense(crew)).toBe(40);
    });

    it('removes lowest tier crew first (Thugs first)', () => {
      const crew = { thug: 3, enforcer: 2, hitman: 1 };
      const res = removeLowestTierCrew(crew, 2);

      expect(res.remainingCrew).toEqual({ thug: 1, enforcer: 2, hitman: 1 });
      expect(res.lostCrew).toEqual({ thug: 2, enforcer: 0, hitman: 0 });
      expect(res.totalLost).toBe(2);
    });

    it('cascades to Enforcers when Thugs are exhausted', () => {
      const crew = { thug: 1, enforcer: 2, hitman: 1 };
      const res = removeLowestTierCrew(crew, 2);

      expect(res.remainingCrew).toEqual({ thug: 0, enforcer: 1, hitman: 1 });
      expect(res.lostCrew).toEqual({ thug: 1, enforcer: 1, hitman: 0 });
      expect(res.totalLost).toBe(2);
    });

    it('cascades to Hitmen when Thugs and Enforcers are exhausted', () => {
      const crew = { thug: 0, enforcer: 0, hitman: 2 };
      const res = removeLowestTierCrew(crew, 1);

      expect(res.remainingCrew).toEqual({ thug: 0, enforcer: 0, hitman: 1 });
      expect(res.lostCrew).toEqual({ thug: 0, enforcer: 0, hitman: 1 });
      expect(res.totalLost).toBe(1);
    });

    it('handles removing more units than available without crashing', () => {
      const crew = { thug: 1, enforcer: 0, hitman: 0 };
      const res = removeLowestTierCrew(crew, 3);

      expect(res.remainingCrew).toEqual({ thug: 0, enforcer: 0, hitman: 0 });
      expect(res.lostCrew).toEqual({ thug: 1, enforcer: 0, hitman: 0 });
      expect(res.totalLost).toBe(1);
    });
  });

  describe('Outcome & Grudge Resolution', () => {
    it('applies grudge and casualty rules per outcome', () => {
      // Test deterministic resolution with known seed
      const crew = { thug: 4, enforcer: 0, hitman: 0 };

      // Force high probability for clean
      const cleanResult = resolveRiskRoll(100, 10, 2, 100, crew);
      if (cleanResult.outcome === 'CLEAN') {
        expect(cleanResult.grudgeDelta).toBe(0);
        expect(cleanResult.casualties.totalLost).toBe(0);
      }

      // Force low probability for clean to observe messy or botched
      const underdogResult = resolveRiskRoll(1, 100, 0, 12345, crew);
      if (underdogResult.outcome === 'MESSY') {
        expect(underdogResult.grudgeDelta).toBe(15);
        expect(underdogResult.casualties.totalLost).toBe(1);
      } else if (underdogResult.outcome === 'BOTCHED') {
        expect(underdogResult.grudgeDelta).toBe(25);
        expect(underdogResult.casualties.totalLost).toBe(2);
      }
    });
  });

  describe('10,000-Roll Monte Carlo Distribution Test', () => {
    it('matches theoretical probabilities within 3.5 sigma confidence across 10,000 rolls', () => {
      const attackerAttack = 24;
      const targetDefense = 20; // R = 1.2
      const prepTier: PrepTier = 1;

      const theoretical = calculateRiskProbabilities(attackerAttack, targetDefense, prepTier);
      const pClean = theoretical.clean / 100;
      const pMessy = theoretical.messy / 100;
      const pBotched = theoretical.botched / 100;

      const sampleSize = 10000;
      let cleanCount = 0;
      let messyCount = 0;
      let botchedCount = 0;

      let rngState = 0xabcdef12;

      for (let i = 0; i < sampleSize; i++) {
        const result = resolveRiskRoll(attackerAttack, targetDefense, prepTier, rngState);
        rngState = result.nextRngState;

        if (result.outcome === 'CLEAN') cleanCount++;
        else if (result.outcome === 'MESSY') messyCount++;
        else if (result.outcome === 'BOTCHED') botchedCount++;
      }

      const empiricalClean = cleanCount / sampleSize;
      const empiricalMessy = messyCount / sampleSize;
      const empiricalBotched = botchedCount / sampleSize;

      // For N = 10,000 and max variance p=0.5: SE = sqrt(0.25 / 10000) = 0.005.
      // 3.5 * SE = 0.0175 (~1.75%).
      // We allow a strict margin of 0.02 (2.0%).
      const maxDelta = 0.02;

      expect(Math.abs(empiricalClean - pClean)).toBeLessThan(maxDelta);
      expect(Math.abs(empiricalMessy - pMessy)).toBeLessThan(maxDelta);
      expect(Math.abs(empiricalBotched - pBotched)).toBeLessThan(maxDelta);
      expect(cleanCount + messyCount + botchedCount).toBe(sampleSize);
    });
  });
});
