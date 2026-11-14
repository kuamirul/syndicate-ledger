import { describe, expect, it } from 'vitest';
import {
  AI_ARCHETYPES,
  ARCHETYPES_BY_ID,
  ArchetypeSchema,
  CITY_RACKETS,
  CREW_BY_ID,
  CREW_TIERS,
  JOBS_BY_ID,
  RACKETS_BY_DISTRICT,
  RACKETS_BY_ID,
  RacketSchema,
  STREET_JOBS,
  StreetJobSchema,
} from './index';

describe('Static Game Data & Zod Validation', () => {
  describe('Street Jobs', () => {
    it('contains exactly 6 validated jobs', () => {
      expect(STREET_JOBS).toHaveLength(6);
      expect(Object.keys(JOBS_BY_ID)).toHaveLength(6);
    });

    it('matches exact specifications for all 6 faucets', () => {
      const shakedown = JOBS_BY_ID['shakedown'];
      expect(shakedown).toBeDefined();
      expect(shakedown?.difficultyDef).toBe(6);
      expect(shakedown?.cleanPayout).toBe(1600);
      expect(shakedown?.messyPayout).toBe(1000);
      expect(shakedown?.cleanHeat).toBe(2);
      expect(shakedown?.messyHeat).toBe(5);
      expect(shakedown?.botchedHeat).toBe(8);

      const vault = JOBS_BY_ID['bank_vault'];
      expect(vault).toBeDefined();
      expect(vault?.difficultyDef).toBe(48);
      expect(vault?.cleanPayout).toBe(14000);
      expect(vault?.messyPayout).toBe(7500);
      expect(vault?.cleanHeat).toBe(15);
      expect(vault?.messyHeat).toBe(25);
      expect(vault?.botchedHeat).toBe(38);
    });

    it('rejects invalid job schema', () => {
      expect(() =>
        StreetJobSchema.parse({
          id: 'invalid',
          name: 'Invalid Job',
          difficultyDef: -5,
          cleanPayout: 100,
          messyPayout: 50,
          cleanHeat: 1,
          messyHeat: 2,
          botchedHeat: 3,
        })
      ).toThrow();
    });
  });

  describe('City Rackets & Districts', () => {
    it('contains exactly 12 validated city rackets across 4 districts', () => {
      expect(CITY_RACKETS).toHaveLength(12);
      expect(Object.keys(RACKETS_BY_ID)).toHaveLength(12);

      expect(RACKETS_BY_DISTRICT.docks).toHaveLength(3);
      expect(RACKETS_BY_DISTRICT.neon_strip).toHaveLength(3);
      expect(RACKETS_BY_DISTRICT.industrial).toHaveLength(3);
      expect(RACKETS_BY_DISTRICT.uptown).toHaveLength(3);
    });

    it('has correct base values and yields per district tier', () => {
      // Docks tier ($4,000 / $1,300 yield)
      for (const racket of RACKETS_BY_DISTRICT.docks) {
        expect(racket.baseValue).toBe(4000);
        expect(racket.baseDefense).toBe(10);
        expect(racket.dirtyYield).toBe(1300);
        expect(racket.passiveHeat).toBe(1);
      }

      // Uptown tier ($18,000 / $5,800 yield)
      for (const racket of RACKETS_BY_DISTRICT.uptown) {
        expect(racket.baseValue).toBe(18000);
        expect(racket.baseDefense).toBe(42);
        expect(racket.dirtyYield).toBe(5800);
        expect(racket.passiveHeat).toBe(4);
      }
    });

    it('rejects invalid racket schema', () => {
      expect(() =>
        RacketSchema.parse({
          id: 'fake',
          name: 'Fake Racket',
          district: 'unknown_district',
          baseValue: 1000,
          baseDefense: 10,
          dirtyYield: 100,
          passiveHeat: 1,
        })
      ).toThrow();
    });
  });

  describe('AI Archetypes', () => {
    it('contains exactly 5 validated AI archetypes', () => {
      expect(AI_ARCHETYPES).toHaveLength(5);
      expect(Object.keys(ARCHETYPES_BY_ID)).toHaveLength(5);
    });

    it('matches archetype weight vectors', () => {
      const warlord = ARCHETYPES_BY_ID['warlord'];
      expect(warlord).toBeDefined();
      expect(warlord?.weights).toEqual({
        greed: 0.9,
        aggression: 1.8,
        caution: 0.6,
        revenge: 1.5,
      });

      const banker = ARCHETYPES_BY_ID['banker'];
      expect(banker).toBeDefined();
      expect(banker?.weights).toEqual({
        greed: 1.8,
        aggression: 0.7,
        caution: 1.6,
        revenge: 0.6,
      });
    });

    it('rejects invalid archetype schema', () => {
      expect(() =>
        ArchetypeSchema.parse({
          id: 'invalid_archetype',
          name: 'Ghost',
          weights: { greed: 1, aggression: 1, caution: 1, revenge: 1 },
          signatureBehavior: 'none',
        })
      ).toThrow();
    });
  });

  describe('Crew Tiers', () => {
    it('contains 3 tiers matching specification', () => {
      expect(CREW_TIERS).toHaveLength(3);

      const thug = CREW_BY_ID['thug'];
      expect(thug).toEqual({
        id: 'thug',
        name: 'Street Thug',
        hireCost: 800,
        attack: 3,
        defense: 3,
        weeklyPayroll: 250,
        requiredRackets: 0,
      });

      const enforcer = CREW_BY_ID['enforcer'];
      expect(enforcer).toEqual({
        id: 'enforcer',
        name: 'Enforcer',
        hireCost: 2200,
        attack: 8,
        defense: 8,
        weeklyPayroll: 600,
        requiredRackets: 2,
      });

      const hitman = CREW_BY_ID['hitman'];
      expect(hitman).toEqual({
        id: 'hitman',
        name: 'Hitman',
        hireCost: 5000,
        attack: 18,
        defense: 12,
        weeklyPayroll: 1300,
        requiredRackets: 5,
      });
    });
  });
});
