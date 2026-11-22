import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SpendSafety } from '../operationsModel';
import { SPEND_TERMS } from '../terms';
import { money } from './format';

interface Props {
  /** Street Cash paid (positive) — for Safe-only spends pass 0. */
  streetCost: number;
  safeCost?: number;
  safety: SpendSafety;
  className?: string;
}

/** Inline spend clarity: "Cost $X → Leaves $Y" plus the [Sunday Shortfall Risk] badge. */
export function SpendLine({ streetCost, safeCost = 0, safety, className }: Props) {
  const parts: string[] = [];
  const cost = streetCost + Math.max(0, safeCost);
  const bothPaid = streetCost > 0 && safeCost > 0;
  const leaves = bothPaid
    ? `${money(safety.leavesStreet)} Street / ${money(safety.leavesSafe)} Safe`
    : safeCost > 0
      ? `${money(safety.leavesSafe)} Safe Cash`
      : `${money(safety.leavesStreet)} Street Cash`;
  parts.push(`Cost ${money(cost)} → Leaves ${leaves}`);
  const shortfall = safety.triggersShortfall;
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs tabular-nums', className)}>
      <span className={cn(safety.affordable ? 'text-zinc-300' : 'text-zinc-500')}>{parts.join('')}</span>
      {shortfall && (
        <span
          title={SPEND_TERMS.shortfallHint}
          className={cn(
            'inline-flex items-center gap-1 rounded border px-1 font-semibold',
            safety.alreadyShort
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
              : 'border-rose-500/40 bg-rose-500/10 text-rose-400'
          )}
        >
          <AlertTriangle className="size-3" aria-hidden />
          {SPEND_TERMS.shortfallBadge}
        </span>
      )}
    </span>
  );
}
