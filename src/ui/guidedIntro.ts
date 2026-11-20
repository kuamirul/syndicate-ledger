// Guided Intro (M2-T0): UI-only staged unlock of player verbs over the first weeks.
// No week locks live in /src/engine/ — applyAction stays the single source of legality, and the
// AI is never affected. Turning the intro off unlocks every verb immediately.

import type { Action } from '../engine/types';
import { VERBS, type VerbKey } from './terms';

export interface GuidedPhase {
  phase: 1 | 2 | 3;
  title: string;
  /** One-line callout shown in the phase banner. */
  banner: string;
}

/** First week each verb is available while the Guided Intro is on. */
export const VERB_UNLOCK_WEEK: Readonly<Record<VerbKey, number>> = {
  runJob: 1,
  claimBusiness: 1,
  hireCrew: 1,
  bankCash: 3,
  payCops: 3,
  stageRaid: 4,
  spy: 4,
  snitch: 4,
};

export function guidedPhase(week: number): GuidedPhase {
  if (week <= 2) {
    return {
      phase: 1,
      title: 'Phase 1: Build Your Base',
      banner: 'Run cash jobs, claim empty businesses and hire crew. More actions unlock in Week 3.',
    };
  }
  if (week === 3) {
    return {
      phase: 2,
      title: 'Phase 2: Protect Profits',
      banner: `Unlocked: ${VERBS.bankCash.label} and ${VERBS.payCops.label} — keep your cash and your Heat safe.`,
    };
  }
  return {
    phase: 3,
    title: 'Phase 3: Turf War',
    banner: `Unlocked: ${VERBS.stageRaid.label}, ${VERBS.spy.label} and ${VERBS.snitch.label} — every action is open.`,
  };
}

export interface VerbLock {
  locked: boolean;
  /** e.g. "Unlocks Week 3"; undefined when the verb is available. */
  badge?: string;
}

export function verbLock(verb: VerbKey, week: number, guidedIntro: boolean): VerbLock {
  const unlockWeek = VERB_UNLOCK_WEEK[verb];
  if (!guidedIntro || week >= unlockWeek) return { locked: false };
  return { locked: true, badge: `Unlocks Week ${unlockWeek}` };
}

/**
 * UI verb for an engine action. SEIZE splits on the target: a neutral racket is a claim, a
 * rival-owned one is a raid (2-turn siege). PASS has no verb (always allowed).
 */
export function verbForAction(action: Action, racketOwnerId: string | null = null): VerbKey | null {
  switch (action.type) {
    case 'EXTORT':
      return 'runJob';
    case 'SEIZE':
      return racketOwnerId === null ? 'claimBusiness' : 'stageRaid';
    case 'RECRUIT':
      return 'hireCrew';
    case 'LAUNDER':
      return 'bankCash';
    case 'BRIBE':
      return action.targetSyndicateId ? 'snitch' : 'payCops';
    case 'WIRETAP':
      return 'spy';
    case 'PASS':
      return null;
  }
}
