// Plain-English UI vocabulary (M2-T0). Maps internal engine terms (EXTORT, SEIZE, LAUNDER, BRIBE,
// WIRETAP, ricoCounter, Valuation, Turf Upkeep) to player-facing labels and one-sentence subtitles.
// UI-only: engine identifiers stay unchanged. Reused by the shadcn/ui ledger in M2-T1.

import { MAX_WEEKS } from '../engine/constants';
import type { PrepTier } from '../engine/types';

export interface Term {
  /** Short button / column label. */
  label: string;
  /** One-sentence tooltip or subtitle. */
  subtitle: string;
}

/** Player verbs as the UI names them. Keys are UI-side; see `verbForAction` for the engine mapping. */
export type VerbKey =
  | 'runJob' // EXTORT
  | 'claimBusiness' // SEIZE on a neutral racket
  | 'hireCrew' // RECRUIT
  | 'bankCash' // LAUNDER
  | 'payCops' // BRIBE on self
  | 'stageRaid' // SEIZE on a rival-owned racket (2-turn siege)
  | 'spy' // WIRETAP
  | 'snitch'; // BRIBE targeting a rival (frame)

export const VERBS: Readonly<Record<VerbKey, Term>> = {
  runJob: {
    label: 'Run Cash Job',
    subtitle: 'Earn quick spending cash; higher payouts carry higher risk.',
  },
  claimBusiness: {
    label: 'Claim Empty Business',
    subtitle: 'Take over an unowned neighborhood business immediately.',
  },
  hireCrew: {
    label: 'Hire Crew',
    subtitle: 'Add muscle for jobs and takeovers; every crew member is paid every Sunday.',
  },
  bankCash: {
    label: 'Bank Safe Cash (2x Score, 1/wk)',
    subtitle: 'Lock cash safely away from raids; counts DOUBLE toward final score.',
  },
  payCops: {
    label: 'Pay Off Cops (-22 Heat)',
    subtitle: 'Cool down police attention before it turns into arrests.',
  },
  stageRaid: {
    label: 'Stage Rival Raid (2 Wks)',
    subtitle: 'Queue an attack resolving in 2 weeks; target gets 1 turn to prepare.',
  },
  spy: {
    label: 'Spy on Rival (3 Wks)',
    subtitle: "Reveal a rival's cash, crew, and next planned moves.",
  },
  snitch: {
    label: 'Snitch on Rival (+12 Heat)',
    subtitle: 'Tip off the police about a rival to push their Heat up (once per week).',
  },
};

export const PREP_TERM: Term = {
  label: 'Pay Off Guards (+Odds)',
  subtitle: 'Spend extra up front to raise your odds of a clean result.',
};

export const PREP_TIER_LABELS: Readonly<Record<PrepTier, string>> = {
  0: 'No payoff ($0)',
  1: 'Small payoff ($1,200)',
  2: 'Big payoff ($2,800)',
};

export const TERMS = {
  heat: {
    label: 'Police Heat (0–100%)',
    subtitle: 'How closely the police are watching you; it cools by 5 each Sunday.',
  },
  netWorth: {
    label: 'Net Worth (Win Score)',
    subtitle: 'Safe Cash counts double, plus Street Cash and the value of every business you own.',
  },
  sizeTax: {
    label: 'Size Tax (4+ Businesses)',
    subtitle: 'Owning more than 3 businesses costs Turf Upkeep every Sunday, growing fast with size.',
  },
  streetCash: {
    label: 'Street Cash',
    subtitle: 'Spending money from jobs and businesses; police raids can seize part of it.',
  },
  safeCash: {
    label: 'Safe Cash',
    subtitle: 'Clean, banked cash: safe from police raids and worth double at the final count.',
  },
  business: {
    label: 'Business',
    subtitle: 'A neighborhood racket that pays you every Sunday.',
  },
  raids: {
    label: 'Rival Raids',
    subtitle: 'Queued attacks on businesses: yours, against you, and any you are spying on.',
  },
} as const satisfies Record<string, Term>;

/** Arrest Strikes label for the given RICO counter (engine `ricoCounter`). */
export function arrestStrikesLabel(ricoCounter: number): string {
  return `Arrest Strikes (${ricoCounter}/2 — Hit 100% twice and you're busted)`;
}

/** Top-bar goal so new players see the finish line immediately. */
export const GOAL_TEXT = `Goal: Highest Net Worth after Week ${MAX_WEEKS} — or own 8/12 Businesses early`;

/** Plain-English labels for elimination / win reasons shown in the UI. */
export const OUTCOME_LABELS: Readonly<Record<string, string>> = {
  RICO: 'Busted (2 Arrest Strikes)',
  INSOLVENT: 'Went broke',
  WIPED_OUT: 'Wiped out',
  DOMINATION: 'Took over the city (8+ businesses)',
  VALUATION: `Highest Net Worth after Week ${MAX_WEEKS}`,
  LAST_STANDING: 'Last crew standing',
};

const ACTION_WORDS: ReadonlyArray<[RegExp, string]> = [
  [/^SEIZE queued as siege — resolves at the start of week (\d+)/, `${VERBS.stageRaid.label}: raid staged — it lands at the start of week $1`],
  [/^EXTORT\b/, VERBS.runJob.label],
  [/^SEIZE\b/, 'Business takeover'],
  [/^RECRUIT\b/, VERBS.hireCrew.label],
  [/^LAUNDER\b/, 'Bank Safe Cash'],
  [/^BRIBE\b/, 'Police payoff'],
  [/^WIRETAP\b/, 'Spy on Rival'],
  [/^PASS succeeded/, 'Skipped one action'],
];

/** Word-level engine -> plain-English replacements shared by status, event and rejection text. */
function plainWords(text: string): string {
  return text
    .replace(/federal RICO indictment/gi, 'Police Bust / Arrest')
    .replace(/RICO indictment/gi, 'Police Bust / Arrest')
    .replace(/Turf Upkeep/gi, 'Size Tax')
    .replace(/DirtyCash/gi, 'Street Cash')
    .replace(/CleanCash/gi, 'Safe Cash')
    .replace(/Launder limit reached/g, 'Already banked this week')
    .replace(/Frame limit reached/g, 'Already snitched this week')
    .replace(/\bLaunder\b/g, 'Bank')
    .replace(/\bsiege(s)?\b/gi, (_m, pl: string | undefined) => `raid${pl ?? ''}`)
    .replace(/\brackets?\b/gi, (m) => (m.toLowerCase() === 'racket' ? 'business' : 'businesses'));
}

/** Capitalise the first letter ("raid on X" -> "Raid on X"); keeps already-capitalised text. */
function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Display-time translation of a Sunday-ledger / start-of-week engine event. Engine strings are
 * unchanged; unknown text passes through with only word-level replacement.
 */
export function plainEventText(event: string): string {
  return plainWords(event)
    .replace(/was called off \(attacker eliminated\)/, 'was called off (attacker is out)')
    .replace(/Police Raid hit ([^!]+)!/, 'Police raid hit $1!')
    .replace(/Start of week (\d+): /, 'Week $1 start: ');
}

/** Display-time translation of an `applyAction` rejection reason ("Rejected: ..." prefix kept). */
export function plainRejection(reason: string): string {
  return sentenceCase(plainWords(reason));
}

/**
 * Display-time translation of the UI reducer's status line (which keeps engine verbs for logs and
 * tests) into plain English. Unknown text passes through unchanged.
 */
export function plainStatusMessage(message: string): string {
  let out = message;
  for (const [re, word] of ACTION_WORDS) {
    if (re.test(out)) {
      out = out.replace(re, word);
      break;
    }
  }
  return plainWords(out);
}

/** Spend-clarity vocabulary shared by every spending control (M2-T2). */
export const SPEND_TERMS = {
  shortfallBadge: '[Sunday Shortfall Risk]',
  shortfallHint: 'After Sunday bills you could owe more than you hold; a business would be sold at half value.',
  requiresCrew: 'Requires ≥1 Crew',
  alreadyBanked: 'Already Banked This Week (1/1)',
  alreadySnitched: 'Already Snitched This Week (1/1)',
  noActions: 'No actions left',
  matchComplete: 'Match Complete',
  confirm: 'Confirm & Spend 1 Action',
} as const;

/** Plain-English roll outcomes (Clean / Messy / Botched). */
export const RISK_OUTCOME_LABELS = {
  CLEAN: 'Clean',
  MESSY: 'Messy',
  BOTCHED: 'Botched',
} as const;

/** Section titles for the Operations tab and their Guided Intro lock text. */
export const OPS_SECTIONS = {
  jobs: { label: 'Run Cash Job', subtitle: 'Six jobs, safest to riskiest. Odds update with your crew.' },
  crew: { label: 'Hire Crew', subtitle: 'More muscle means better odds, but every crew member is paid each Sunday.' },
  protect: { label: 'Protect Profits', subtitle: 'Bank cash and cool the police.' },
  covert: { label: 'Covert Ops', subtitle: 'Watch and sabotage rivals.' },
} as const;

// ---------------------------------------------------------------------------------------------
// M2-T3: Businesses & Raids, Rivals & Spying
// ---------------------------------------------------------------------------------------------

/** Plain-English district names (engine ids are `DistrictId`). */
export const DISTRICT_NAMES: Readonly<Record<string, string>> = {
  docks: 'Docks',
  neon_strip: 'Neon Strip',
  industrial: 'Industrial',
  uptown: 'Uptown',
};

export const TURF_TERMS = {
  activeRaids: 'Active Raids',
  noRaids: 'No raids are queued against your businesses.',
  outgoingSlots: 'Outgoing Raid Slots',
  rivalRaids: 'Spied Rival Raids',
  monopolyActive: '+25% District Bonus Active',
  sizeTaxExceeds: '[Size Tax Exceeds Income]',
  claimInstant: 'Claim Empty Business — Instant',
  raidQueued: 'Stage Rival Raid — 2 Wks',
  raidLock: 'Unlocks Week 4',
  claimConfirmNote: 'Resolves immediately. A Messy claim leaves the business damaged (half income) for one week.',
  raidConfirmNote: 'Queued now, resolves at the start of the week shown. The owner gets one full turn to react.',
} as const;

export const RIVAL_TERMS = {
  hidden: '???',
  redactedCaption: 'Spy on this rival to reveal their cash, crew, Heat and planned moves. [DEV] in the top bar reveals all AI math for code review.',
  devRevealed: 'DEV Revealed',
  viewMath: 'View AI Decision Math',
  viewIntel: 'View Full Rival Intel →',
} as const;

/** Plain-English personality tag per archetype, shown next to the archetype badge. */
export const ARCHETYPE_TAGS: Readonly<Record<string, string>> = {
  warlord: 'Aggressive Expansion',
  banker: 'Safe Cash Scaler',
  rat: 'Snitch & Frame',
  opportunist: 'Strikes the Weak',
  turtle: 'Fortress Builder',
};

/** Utility AI score components as the Decision Sheet labels them (weight key in `ArchetypeWeights`). */
export const SCORE_COMPONENTS = [
  { key: 'evScore', label: 'Earnings (EV)', weight: 'greed', sign: 1 },
  { key: 'turfScore', label: 'Turf', weight: 'aggression', sign: 1 },
  { key: 'heatRiskScore', label: 'Heat Risk', weight: 'caution', sign: -1 },
  { key: 'grudgeScore', label: 'Grudge', weight: 'revenge', sign: 1 },
] as const;

// ---------------------------------------------------------------------------------------------
// M2-T4: Match Summary, Unspent-Action Guard, Hotkeys
// ---------------------------------------------------------------------------------------------

/** Final-standings outcome badges (plain English; engine reasons are RICO / INSOLVENT / WIPED_OUT). */
export const MATCH_OUTCOME_LABELS = {
  winnerNetWorth: 'Winner — Net Worth',
  winnerDomination: 'Winner — 8+ Businesses',
  winnerLastStanding: 'Winner — Last Crew Standing',
  arrested: 'Arrested (Police Heat)',
  bankrupt: 'Bankrupt',
  wipedOut: 'Wiped Out',
  stillStanding: 'Still Standing',
} as const;

export const SUMMARY_TERMS = {
  victory: 'Victory',
  defeat: 'Defeat',
  decisive: 'Decisive Factor',
  newRun: 'New Run (Random Seed)',
  retrySeed: (seed: number) => `Retry Exact Seed (#${seed})`,
  inspect: 'Inspect Final Board',
  viewResults: 'View Final Results',
  matchComplete: 'Match Complete',
  eliminatedNote: 'You are out of the run; rivals may still be playing. Standings are as of the week you fell.',
  boardNote: 'Final standings. Every rival is fully revealed.',
} as const;

export const GUARD_TERMS = {
  title: 'End Week with actions left?',
  keepPlaying: 'Keep Playing',
  endAnyway: 'End Week Anyway',
  dontWarn: "Don't warn again (this session)",
  body: (n: number) => `You still have ${n} Action${n === 1 ? '' : 's'} left this week — End Week anyway?`,
} as const;

export const HOTKEY_TERMS = {
  endWeek: 'Space',
  tabHint: 'Press 1–4 to switch tabs, Space to end the week',
} as const;
