// Pure TypeScript Domain Types for Syndicate Ledger (No UI, DOM, or React imports)

export type DistrictId = 'docks' | 'neon_strip' | 'industrial' | 'uptown';

export type CrewTierId = 'thug' | 'enforcer' | 'hitman';

export interface CrewTierDef {
  id: CrewTierId;
  name: string;
  hireCost: number;
  attack: number;
  defense: number;
  weeklyPayroll: number;
  requiredRackets: number;
}

export interface SyndicateCrew {
  thug: number;
  enforcer: number;
  hitman: number;
}

export interface StreetJobDef {
  id: string;
  name: string;
  difficultyDef: number;
  cleanPayout: number;
  messyPayout: number;
  cleanHeat: number;
  messyHeat: number;
  botchedHeat: number;
}

export interface RacketDef {
  id: string;
  name: string;
  district: DistrictId;
  baseValue: number;
  baseDefense: number;
  dirtyYield: number;
  passiveHeat: number;
}

export interface RacketState extends RacketDef {
  ownerId: string | null;
  damagedTurnsRemaining: number;
}

export type ArchetypeId = 'warlord' | 'banker' | 'rat' | 'opportunist' | 'turtle';

export interface ArchetypeWeights {
  greed: number;
  aggression: number;
  caution: number;
  revenge: number;
}

export interface ArchetypeDef {
  id: ArchetypeId;
  name: string;
  weights: ArchetypeWeights;
  signatureBehavior: string;
}

export type PrepTier = 0 | 1 | 2;

export type RiskOutcome = 'CLEAN' | 'MESSY' | 'BOTCHED';

export interface RiskProbabilities {
  clean: number;
  messy: number;
  botched: number;
}

export type Action =
  | { type: 'EXTORT'; jobId: string; prepTier: PrepTier }
  | { type: 'SEIZE'; racketId: string; prepTier: PrepTier }
  | { type: 'RECRUIT'; tier: CrewTierId; count: number }
  | { type: 'LAUNDER'; amount: number }
  | { type: 'BRIBE'; useClean: boolean; targetSyndicateId?: string }
  | { type: 'WIRETAP'; targetSyndicateId: string }
  | { type: 'PASS' };

export type EliminationReason = 'RICO' | 'INSOLVENT' | 'WIPED_OUT';

export type WinReason = 'DOMINATION' | 'VALUATION' | 'LAST_STANDING';

export interface DecisionTraceScores {
  evScore: number;
  turfScore: number;
  heatRiskScore: number;
  grudgeScore: number;
  emergencyModifiers: number;
  coalitionBonus: number;
  totalScore: number;
}

export interface DecisionTrace {
  week: number;
  syndicateId: string;
  action: Action;
  scores: DecisionTraceScores;
  reasoning: string;
}

export interface SyndicateState {
  id: string;
  name: string;
  isPlayer: boolean;
  archetypeId?: ArchetypeId;
  dirtyCash: number;
  cleanCash: number;
  heat: number;
  ricoCounter: number;
  actionPoints: number;
  crew: SyndicateCrew;
  assignedGuards: Record<string, number>;
  isEliminated: boolean;
  eliminationReason?: EliminationReason;
  eliminatedWeek?: number;
  grudge: Record<string, number>;
  wiretapTurnsRemaining: Record<string, number>;
}

export interface SyndicateSnapshot {
  id: string;
  dirtyCash: number;
  cleanCash: number;
  heat: number;
  valuation: number;
  crewCount: number;
  ownedRacketCount: number;
  isEliminated: boolean;
}

export interface WeekSnapshot {
  week: number;
  syndicates: Record<string, SyndicateSnapshot>;
  rackets: Record<string, { ownerId: string | null; damaged: boolean }>;
  events: string[];
}

export interface GameState {
  week: number;
  rngState: number;
  syndicates: Record<string, SyndicateState>;
  rackets: Record<string, RacketState>;
  activeSieges: unknown[];
  history: WeekSnapshot[];
  decisionTraces: DecisionTrace[];
  winnerId: string | null;
  winReason: WinReason | null;
  isGameOver: boolean;
}
