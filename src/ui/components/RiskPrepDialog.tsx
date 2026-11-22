import { ShieldAlert, Skull, Sparkles, TriangleAlert } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { PrepTier, RiskOutcome } from '../../engine/types';
import type { OutcomeConsequence, PrepTierOption } from '../operationsModel';
import { PREP_TERM, PREP_TIER_LABELS, RISK_OUTCOME_LABELS, SPEND_TERMS } from '../terms';
import { SpendLine } from './SpendLine';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Tier table from `buildPrepTierOptions` (generic: jobs now, claims / raids in M2-T3). */
  tiers: PrepTierOption[];
  consequences: Record<RiskOutcome, OutcomeConsequence>;
  /** Called with the chosen tier; the dialog closes afterwards. */
  onConfirm: (tier: PrepTier) => void;
  /** Extra line under the title, e.g. "Resolves in 2 weeks". */
  footnote?: ReactNode;
}

const OUTCOMES: ReadonlyArray<{ key: RiskOutcome; icon: typeof Sparkles; tone: string }> = [
  { key: 'CLEAN', icon: Sparkles, tone: 'text-emerald-400' },
  { key: 'MESSY', icon: TriangleAlert, tone: 'text-amber-400' },
  { key: 'BOTCHED', icon: Skull, tone: 'text-rose-400' },
];

function delta(n: number): string {
  return n === 0 ? '' : ` (${n > 0 ? '+' : ''}${n}%)`;
}

export function RiskPrepDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        {/* Body unmounts with the dialog, so the selected tier resets on every open. */}
        <TierPicker {...props} />
      </DialogContent>
    </Dialog>
  );
}

function TierPicker({ onOpenChange, title, description, tiers, consequences, onConfirm, footnote }: Props) {
  const firstOk = tiers.find((t) => t.disabledReason === null)?.tier ?? 0;
  const [selected, setSelected] = useState<PrepTier>(firstOk);
  const chosen = tiers.find((t) => t.tier === selected);
  const canConfirm = !!chosen && chosen.disabledReason === null;

  return (
    <>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description ?? PREP_TERM.subtitle}</DialogDescription>
          {footnote && <p className="text-xs text-zinc-400">{footnote}</p>}
        </DialogHeader>

        <p className="mb-2 text-sm font-medium text-zinc-300">{PREP_TERM.label}</p>
        <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label={PREP_TERM.label}>
          {tiers.map((t) => {
            const disabled = t.disabledReason !== null;
            const active = t.tier === selected;
            return (
              <button
                key={t.tier}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={disabled}
                onClick={() => setSelected(t.tier)}
                className={cn(
                  'flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400',
                  active ? 'border-amber-500 bg-zinc-800' : 'border-zinc-700 bg-zinc-900 hover:bg-zinc-800',
                  disabled && 'cursor-not-allowed opacity-50 hover:bg-zinc-900'
                )}
              >
                <span className="text-sm font-semibold">
                  Tier {t.tier}: {PREP_TIER_LABELS[t.tier]}
                </span>
                <div className="flex h-3 overflow-hidden rounded bg-zinc-800" aria-hidden>
                  <div className="bg-emerald-500" style={{ width: `${t.odds.clean}%` }} />
                  <div className="bg-amber-500" style={{ width: `${t.odds.messy}%` }} />
                  <div className="bg-rose-500" style={{ width: `${t.odds.botched}%` }} />
                </div>
                <dl className="space-y-0.5 text-xs tabular-nums">
                  <div className="flex justify-between text-emerald-400">
                    <dt>Clean</dt>
                    <dd>
                      {t.odds.clean}%{delta(t.deltaClean)}
                    </dd>
                  </div>
                  <div className="flex justify-between text-amber-400">
                    <dt>Messy</dt>
                    <dd>
                      {t.odds.messy}%{delta(t.deltaMessy)}
                    </dd>
                  </div>
                  <div className="flex justify-between text-rose-400">
                    <dt>Botched</dt>
                    <dd>
                      {t.odds.botched}%{delta(t.deltaBotched)}
                    </dd>
                  </div>
                </dl>
                <SpendLine streetCost={t.streetCost} safety={t.safety} />
                {t.disabledReason && (
                  <span className="flex items-center gap-1 text-xs text-zinc-400">
                    <ShieldAlert className="size-3" aria-hidden />
                    {t.disabledReason}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
          {OUTCOMES.map(({ key, icon: Icon, tone }) => {
            const c = consequences[key];
            return (
              <div key={key} className="rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                <p className={cn('mb-1 flex items-center gap-1 font-semibold', tone)}>
                  <Icon className="size-3.5" aria-hidden />
                  {RISK_OUTCOME_LABELS[key]}
                </p>
                <ul className="space-y-0.5 tabular-nums text-zinc-300">
                  <li>{c.gain}</li>
                  <li>{c.crewLost === 0 ? 'No crew lost' : `Lose ${c.crewLost} crew`}</li>
                  <li>Police Heat +{c.heat}%</li>
                </ul>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-amber-500 text-zinc-950 hover:bg-amber-400"
            disabled={!canConfirm}
            onClick={() => {
              onConfirm(selected);
              onOpenChange(false);
            }}
          >
            {SPEND_TERMS.confirm}
          </Button>
        </div>
    </>
  );
}
