import { z } from 'zod';

export const DistrictIdSchema = z.enum(['docks', 'neon_strip', 'industrial', 'uptown']);

export const CrewTierIdSchema = z.enum(['thug', 'enforcer', 'hitman']);

export const CrewTierSchema = z.object({
  id: CrewTierIdSchema,
  name: z.string().min(1),
  hireCost: z.number().int().positive(),
  attack: z.number().int().positive(),
  defense: z.number().int().positive(),
  weeklyPayroll: z.number().int().positive(),
  requiredRackets: z.number().int().nonnegative(),
});

export const StreetJobSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  difficultyDef: z.number().int().positive(),
  cleanPayout: z.number().int().nonnegative(),
  messyPayout: z.number().int().nonnegative(),
  cleanHeat: z.number().int(),
  messyHeat: z.number().int(),
  botchedHeat: z.number().int(),
});

export const RacketSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  district: DistrictIdSchema,
  baseValue: z.number().int().positive(),
  baseDefense: z.number().int().positive(),
  dirtyYield: z.number().int().positive(),
  passiveHeat: z.number().int(),
});

export const ArchetypeIdSchema = z.enum(['warlord', 'banker', 'rat', 'opportunist', 'turtle']);

export const ArchetypeWeightsSchema = z.object({
  greed: z.number().positive(),
  aggression: z.number().positive(),
  caution: z.number().positive(),
  revenge: z.number().positive(),
});

export const ArchetypeSchema = z.object({
  id: ArchetypeIdSchema,
  name: z.string().min(1),
  weights: ArchetypeWeightsSchema,
  signatureBehavior: z.string().min(1),
});

export const JobsFileSchema = z.array(StreetJobSchema).length(6);
export const RacketsFileSchema = z.array(RacketSchema).length(12);
export const ArchetypesFileSchema = z.array(ArchetypeSchema).length(5);
export const CrewTiersFileSchema = z.array(CrewTierSchema).length(3);
