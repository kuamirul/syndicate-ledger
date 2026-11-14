import {
  ArchetypesFileSchema,
  CrewTiersFileSchema,
  JobsFileSchema,
  RacketsFileSchema,
} from './schemas';
import jobsJson from './jobs.json';
import racketsJson from './rackets.json';
import archetypesJson from './archetypes.json';
import crewJson from './crew.json';
import type {
  ArchetypeDef,
  ArchetypeId,
  CrewTierDef,
  CrewTierId,
  DistrictId,
  RacketDef,
  StreetJobDef,
} from '../engine/types';

export * from './schemas';

// Parse and validate all static datasets against Zod schemas
export const STREET_JOBS: readonly StreetJobDef[] = JobsFileSchema.parse(jobsJson);
export const CITY_RACKETS: readonly RacketDef[] = RacketsFileSchema.parse(racketsJson);
export const AI_ARCHETYPES: readonly ArchetypeDef[] = ArchetypesFileSchema.parse(archetypesJson);
export const CREW_TIERS: readonly CrewTierDef[] = CrewTiersFileSchema.parse(crewJson);

// Pre-indexed lookup maps for O(1) engine access
export const JOBS_BY_ID: Readonly<Record<string, StreetJobDef>> = Object.freeze(
  Object.fromEntries(STREET_JOBS.map((job) => [job.id, job]))
);

export const RACKETS_BY_ID: Readonly<Record<string, RacketDef>> = Object.freeze(
  Object.fromEntries(CITY_RACKETS.map((racket) => [racket.id, racket]))
);

export const ARCHETYPES_BY_ID: Readonly<Record<ArchetypeId, ArchetypeDef>> = Object.freeze(
  Object.fromEntries(
    AI_ARCHETYPES.map((archetype) => [archetype.id, archetype])
  ) as Record<ArchetypeId, ArchetypeDef>
);

export const CREW_BY_ID: Readonly<Record<CrewTierId, CrewTierDef>> = Object.freeze(
  Object.fromEntries(CREW_TIERS.map((tier) => [tier.id, tier])) as Record<CrewTierId, CrewTierDef>
);

export const RACKETS_BY_DISTRICT: Readonly<Record<DistrictId, readonly RacketDef[]>> = Object.freeze({
  docks: CITY_RACKETS.filter((r) => r.district === 'docks'),
  neon_strip: CITY_RACKETS.filter((r) => r.district === 'neon_strip'),
  industrial: CITY_RACKETS.filter((r) => r.district === 'industrial'),
  uptown: CITY_RACKETS.filter((r) => r.district === 'uptown'),
});
