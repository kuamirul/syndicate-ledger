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
