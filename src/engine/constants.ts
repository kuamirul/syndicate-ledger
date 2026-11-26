// Shared engine action constants (pure TypeScript, no UI imports)

export const ASSAULT_BASE_COST = 1500;
export const BRIBE_CLEAN_COST = 3000;
export const BRIBE_DIRTY_COST = 4500;
export const BRIBE_SELF_HEAT = 22;
export const BRIBE_FRAME_HEAT = 12;
export const LAUNDER_MAX = 10000;
export const LAUNDER_FEE_PCT = 25;
export const WIRETAP_COST = 1000;
export const WIRETAP_WEEKS = 3;

// --- Symmetric Utility AI tuning (W3-T8a). Scoring-only: these change how AI syndicates choose,
// never what an action costs or does. The human player is bound by the same applyAction() rules.

/** Cash an AI keeps on hand after any spend, on top of payroll (= the WIPED_OUT cash threshold). */
export const AI_CASH_RESERVE = 1000;
/** Heat level at or below which an EXTORT's expected heat is treated as free (decays -5/wk). */
export const AI_SAFE_HEAT = 30;
/**
 * Self-BRIBE emergency utility when projected Sunday Heat >= 100 (a RICO strike). A hard survival
 * override that outranks every other candidate, mirroring the -999 survival clamp.
 */
export const AI_RICO_EMERGENCY = 999;
/** Horizon (weeks) used to value RECRUIT via marginal earning power — matches SEIZE's 4-week yield. */
export const AI_LOOKAHEAD_WEEKS = 4;
/** Action Points per week (SPEC §1). */
export const ACTION_POINTS_PER_WEEK = 3;

// --- 2-turn Siege telegraph (W3-T8b). Game rule: applies to every syndicate via applyAction().

/** Weeks between declaring a siege (SEIZE on a rival-owned racket) and its resolution. */
export const SIEGE_LEAD_WEEKS = 2;
/** Last week of a run (SPEC §1, M2-T0: 28); a siege must resolve on or before it. */
export const MAX_WEEKS = 28;
/** Max active outgoing sieges per syndicate (game rule, same for player and AI); still max 1 per racket. */
export const MAX_OUTGOING_SIEGES = 2;
/** Max BRIBE (Frame) actions per syndicate per week (game rule; self-BRIBE is not limited). */
export const MAX_FRAMES_PER_WEEK = 1;
/** Max LAUNDER actions per syndicate per week (game rule, M2-T0). */
export const MAX_LAUNDERS_PER_WEEK = 1;
/** The only street job a syndicate with zero crew may run (game rule, M2-T0). */
export const ZERO_CREW_JOB_ID = 'shakedown';

// --- Grudge (W3-T8b). Game rule: stored grudge is clamped and cools every Sunday.

/** Stored grudge per (holder, target) is clamped to 0..GRUDGE_MAX. */
export const GRUDGE_MAX = 100;
/** Sunday Ledger cooling: grudge = floor(grudge * (100 - GRUDGE_DECAY_PCT) / 100). */
export const GRUDGE_DECAY_PCT = 10;

// --- AI frame guard (W3-T8b). Scoring only.

/** At or above this own Heat, an AI frame gets AI_FRAME_SELF_HEAT_PENALTY. */
export const AI_FRAME_SELF_HEAT = 75;
/** Utility removed from BRIBE (Frame) while the framer's own Heat >= AI_FRAME_SELF_HEAT. */
export const AI_FRAME_SELF_HEAT_PENALTY = 200;

// --- AI frame-aware RICO margin (W3-T8b). Scoring only.

/** With ricoCounter >= 1 (one strike already), bribe once projected Sunday Heat reaches this. */
export const AI_RICO_STRIKE_HEAT = 65;
/** A rival counts as a frame threat if its grudge on us is at least this (or we lead the city). */
export const AI_FRAME_THREAT_GRUDGE = 35;
/** Cap on expected incoming frame Heat (2 frames x +12). */
export const AI_INCOMING_FRAME_HEAT_CAP = 24;

// --- Progressive Empire Overhead (W3-T8b). Game rule: applies to every syndicate on Sunday.

/** Rackets a syndicate may own before Empire Heat and Turf Upkeep start. */
export const EMPIRE_FREE_RACKETS = 3;
/** Sunday Empire Heat per owned racket above EMPIRE_FREE_RACKETS (was 2 in v0.1). */
export const EMPIRE_HEAT_PER_RACKET = 5;
/** Sunday Turf Upkeep = TURF_UPKEEP_BASE * max(0, owned - EMPIRE_FREE_RACKETS)^2. */
export const TURF_UPKEEP_BASE = 600;

// --- AI tuning added in W3-T8b. Scoring only.

/** Attack of the starting crew (4 thugs); below it a syndicate counts as "weak". */
export const AI_WEAK_ATTACK = 12;
/** RECRUIT bonus for a weak syndicate while a >= 5-racket city leader exists (SPEC §5.1's +40). */
export const AI_LEADER_REARM_BONUS = 40;
/** RECRUIT survival bonus for a syndicate with 0 crew. */
export const AI_ZERO_CREW_REARM_BONUS = 25;
/** Yield horizon cap for a racket that adds no Turf Upkeep (post-seize <= EMPIRE_FREE_RACKETS). */
export const AI_LONG_YIELD_WEEKS = 8;
/** SEIZE turf bonus at >= 6 rackets, only when the SEIZE's net EV (after upkeep) is >= 0. */
export const AI_NEAR_DOMINATION_BONUS = 20;

// --- Crew Defense in rival raids (M3-T1). Game rule: applies to every syndicate via resolveAssault().

/**
 * Garrison Split: an owner's total crew defense is spread over every business it owns, so a raided
 * business gains floor(crewDefense / max(1, ownedBusinesses)) guard defense. Neutral claims get none.
 */
export const GARRISON_MIN_SPLIT = 1;
/** Crew units a defender loses (lowest tier first) when a rival raid takes its business. */
export const DEFENDER_TAKEOVER_CASUALTIES = 1;

// --- Crew Defense AI tuning (M3-T1). Scoring only; fog-of-war respecting.

/**
 * Crew defense an AI assumes for a rival it is NOT wiretapping: the public starting roster
 * (4 Street Thugs x 3 defense). Public rule knowledge only; never the rival's private crew.
 */
export const AI_ASSUMED_RIVAL_CREW_DEF = 12;
/**
 * RECRUIT utility, scaled by the archetype's caution weight, when a raid is queued against one of
 * the actor's businesses (public to the defender) and the hire would raise that business's guards.
 */
export const AI_DEFEND_RECRUIT_BONUS = 15;
