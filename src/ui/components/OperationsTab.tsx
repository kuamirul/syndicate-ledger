import { ArrowRight, Eye, Lock, Megaphone, Shield, Users, Zap } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useGameStore } from '@/store/gameStore';
import { LAUNDER_FEE_PCT, WIRETAP_COST } from '../../engine/constants';
import { calculateTotalCrewCount } from '../../engine/crew';
import type { CrewTierId } from '../../engine/types';
import {
  buildCrewOptions,
  buildJobRows,
  buildLaunderOption,
  buildPayCopsOptions,
  buildSnitchOptions,
  buildSpyOption,
  jobConsequences,
  launderUsed,
  maxLaunderAmount,
  sectionLocks,
  type JobRow,
} from '../operationsModel';
import { OPS_SECTIONS, SPEND_TERMS, TERMS, VERBS } from '../terms';
import { PLAYER_ID } from '../viewModel';
import { money, signedMoney } from './format';
import { RiskPrepDialog } from './RiskPrepDialog';
import { SpendLine } from './SpendLine';

function LockedCard({ title, badge, icon }: { title: string; badge: string; icon: ReactNode }) {
  return (
    <Card className="border-dashed opacity-70">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-zinc-400">
          <Lock className="size-4" aria-hidden />
          {title}
        </CardTitle>
        <CardDescription className="flex items-center gap-2">
          {icon}
          <Badge variant="outline">
            {badge} — {title}
          </Badge>
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function Pill({ clean, messy, botched }: { clean: number; messy: number; botched: number }) {
  return (
    <span className="inline-flex gap-1 text-xs tabular-nums" aria-label="Clean, Messy, Botched odds">
      <span className="rounded bg-emerald-500/15 px-1 text-emerald-400">{clean}%</span>
      <span className="rounded bg-amber-500/15 px-1 text-amber-400">{messy}%</span>
      <span className="rounded bg-rose-500/15 px-1 text-rose-400">{botched}%</span>
    </span>
  );
}

function JobsSection() {
  const game = useGameStore((s) => s.gameState);
  const perform = useGameStore((s) => s.performAction);
  const [dialogJobId, setDialogJobId] = useState<string | null>(null);
  const rows = buildJobRows(game, PLAYER_ID);
  const crew = calculateTotalCrewCount(game.syndicates[PLAYER_ID]?.crew ?? { thug: 0, enforcer: 0, hitman: 0 });
  const dialogRow: JobRow | undefined = rows.find((r) => r.job.id === dialogJobId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="size-4 text-amber-400" aria-hidden />
          {OPS_SECTIONS.jobs.label}
        </CardTitle>
        <CardDescription>{OPS_SECTIONS.jobs.subtitle}</CardDescription>
        {crew === 0 && (
          <p className="text-xs text-amber-400" role="note">
            No crew: only Corner Shakedown is open. Use Hire Crew below to recover.
          </p>
        )}
      </CardHeader>
      <CardContent>
        <table className="w-full text-left text-sm tabular-nums">
          <thead className="text-xs text-zinc-400">
            <tr>
              <th className="py-1 pr-2 font-medium">Job</th>
              <th className="py-1 pr-2 font-medium">Clean / Messy payout</th>
              <th className="py-1 pr-2 font-medium">Heat (C / M / B)</th>
              <th className="py-1 pr-2 font-medium">Odds $0 (C / M / B)</th>
              <th className="py-1 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const free = r.tiers.find((t) => t.tier === 0);
              return (
                <tr key={r.job.id} className={cn('border-t border-zinc-800', r.locked && 'opacity-50')}>
                  <td className="py-1.5 pr-2 font-medium">
                    {r.job.name}
                    {r.lockReason && (
                      <Badge variant="outline" className="ml-2">
                        {r.lockReason}
                      </Badge>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-zinc-300">
                    {money(r.job.cleanPayout)} / {money(r.job.messyPayout)}
                  </td>
                  <td className="py-1.5 pr-2 text-zinc-400">
                    +{r.job.cleanHeat} / +{r.job.messyHeat} / +{r.job.botchedHeat}
                  </td>
                  <td className="py-1.5 pr-2">{free && <Pill {...free.odds} />}</td>
                  <td className="py-1.5">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        disabled={!r.canRunFree}
                        title={r.lockReason ?? free?.disabledReason ?? undefined}
                        onClick={() => perform({ type: 'EXTORT', jobId: r.job.id, prepTier: 0 })}
                      >
                        Run ($0)
                      </Button>
                      <Button size="sm" variant="outline" disabled={r.locked} onClick={() => setDialogJobId(r.job.id)}>
                        Boost Odds…
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
      {dialogRow && (
        <RiskPrepDialog
          open
          onOpenChange={(o) => !o && setDialogJobId(null)}
          title={`${VERBS.runJob.label}: ${dialogRow.job.name}`}
          tiers={dialogRow.tiers}
          consequences={jobConsequences(dialogRow.job, crew)}
          onConfirm={(tier) => perform({ type: 'EXTORT', jobId: dialogRow.job.id, prepTier: tier })}
        />
      )}
    </Card>
  );
}

function CrewSection() {
  const game = useGameStore((s) => s.gameState);
  const perform = useGameStore((s) => s.performAction);
  const [counts, setCounts] = useState<Record<CrewTierId, 1 | 2 | 3>>({ thug: 1, enforcer: 1, hitman: 1 });
  const options = buildCrewOptions(game, PLAYER_ID);
  const tiers = Array.from(new Set(options.map((o) => o.tier.id)));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="size-4 text-amber-400" aria-hidden />
          {OPS_SECTIONS.crew.label}
        </CardTitle>
        <CardDescription>{OPS_SECTIONS.crew.subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {tiers.map((id) => {
          const count = counts[id];
          const o = options.find((x) => x.tier.id === id && x.count === count);
          if (!o) return null;
          return (
            <div key={id} className={cn('rounded-lg border border-zinc-800 p-2', !o.unlocked && 'opacity-60')}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">
                  {o.tier.name}{' '}
                  <span className="font-normal tabular-nums text-zinc-400">({money(o.tier.hireCost)} each)</span>
                </span>
                {o.lockReason && <Badge variant="outline">{o.lockReason}</Badge>}
              </div>
              <p className="text-xs tabular-nums text-zinc-400">
                +{o.attackGained} Atk / +{o.defenseGained} Def · +{money(o.addedPayroll)}/wk Payroll → New Sunday Net:{' '}
                <span className={o.newSundayNet < 0 ? 'text-rose-400' : 'text-emerald-400'}>
                  {signedMoney(o.newSundayNet)}
                </span>
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <div className="flex gap-1" role="group" aria-label={`${o.tier.name} quantity`}>
                  {([1, 2, 3] as const).map((n) => (
                    <Button
                      key={n}
                      size="sm"
                      variant={n === count ? 'secondary' : 'ghost'}
                      aria-pressed={n === count}
                      onClick={() => setCounts({ ...counts, [id]: n })}
                    >
                      {n}x
                    </Button>
                  ))}
                </div>
                <Button
                  size="sm"
                  disabled={o.disabledReason !== null}
                  title={o.disabledReason ?? undefined}
                  onClick={() => perform({ type: 'RECRUIT', tier: id, count })}
                >
                  Hire {count}x
                </Button>
                <SpendLine streetCost={o.paidStreet} safeCost={o.paidSafe} safety={o.safety} />
              </div>
              {o.disabledReason && o.unlocked && <p className="mt-1 text-xs text-zinc-500">{o.disabledReason}</p>}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ProtectSection() {
  const game = useGameStore((s) => s.gameState);
  const perform = useGameStore((s) => s.performAction);
  const [amount, setAmount] = useState(1000);
  const max = maxLaunderAmount(game, PLAYER_ID);
  const fixed = [1000, 5000, 10000];
  const presets = [...fixed, ...(max > 0 && !fixed.includes(max) ? [max] : [])].sort((a, b) => a - b);
  const launder = buildLaunderOption(game, PLAYER_ID, amount);
  const cops = buildPayCopsOptions(game, PLAYER_ID);
  const used = launderUsed(game, PLAYER_ID);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="size-4 text-emerald-400" aria-hidden />
          {OPS_SECTIONS.protect.label}
        </CardTitle>
        <CardDescription>{OPS_SECTIONS.protect.subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold">{VERBS.bankCash.label}</p>
          <p className="text-xs text-zinc-400">{VERBS.bankCash.subtitle}</p>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Amount to bank">
            {presets.map((p) => (
              <Button
                key={p}
                size="sm"
                variant={p === amount ? 'secondary' : 'ghost'}
                aria-pressed={p === amount}
                onClick={() => setAmount(p)}
              >
                {!fixed.includes(p) ? `Max ${money(p)}` : money(p)}
              </Button>
            ))}
          </div>
          {launder && (
            <>
              <p className="text-xs tabular-nums text-zinc-300">
                {LAUNDER_FEE_PCT}% Fee ({money(launder.fee)}) → +{money(launder.safeGained)} Safe Cash (Net Worth{' '}
                {signedMoney(launder.netWorthDelta)})
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" disabled={launder.disabledReason !== null} onClick={() => perform({ type: 'LAUNDER', amount })}>
                  Bank {money(amount)}
                </Button>
                <SpendLine streetCost={launder.amount} safety={launder.safety} />
              </div>
              {launder.disabledReason && (
                <Badge variant={used ? 'secondary' : 'outline'}>{launder.disabledReason}</Badge>
              )}
            </>
          )}
        </div>

        <div className="space-y-1 border-t border-zinc-800 pt-3">
          <p className="text-sm font-semibold">{VERBS.payCops.label}</p>
          <p className="text-xs text-zinc-400">{VERBS.payCops.subtitle}</p>
          {cops.map((o) => (
            <div key={String(o.useClean)} className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={o.disabledReason !== null}
                title={o.disabledReason ?? undefined}
                onClick={() => perform({ type: 'BRIBE', useClean: o.useClean })}
              >
                Pay with {o.useClean ? 'Safe Cash' : 'Street Cash'}
              </Button>
              <span className="text-xs tabular-nums text-zinc-300">
                Heat {o.heatBefore}% → {o.heatAfter}%
              </span>
              <SpendLine streetCost={o.streetCost} safeCost={o.safeCost} safety={o.safety} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CovertSection() {
  const game = useGameStore((s) => s.gameState);
  const perform = useGameStore((s) => s.performAction);
  const setTab = useGameStore((s) => s.setActiveTab);
  const rivals = Object.values(game.syndicates).filter((s) => s.id !== PLAYER_ID && !s.isEliminated);
  const [picked, setPicked] = useState('');
  const target = rivals.some((r) => r.id === picked) ? picked : (rivals[0]?.id ?? '');
  const spy = buildSpyOption(game, PLAYER_ID, target);
  const snitch = buildSnitchOptions(game, PLAYER_ID, target);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="size-4 text-sky-400" aria-hidden />
          {OPS_SECTIONS.covert.label}
        </CardTitle>
        <CardDescription>{OPS_SECTIONS.covert.subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Target rival">
          {rivals.map((r) => (
            <Button
              key={r.id}
              size="sm"
              variant={r.id === target ? 'secondary' : 'ghost'}
              aria-pressed={r.id === target}
              onClick={() => setPicked(r.id)}
            >
              {r.name}
            </Button>
          ))}
        </div>
        {spy && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={spy.disabledReason !== null}
              title={spy.disabledReason ?? undefined}
              onClick={() => perform({ type: 'WIRETAP', targetSyndicateId: target })}
            >
              <Eye className="size-4" aria-hidden /> {VERBS.spy.label}
            </Button>
            <SpendLine streetCost={WIRETAP_COST} safety={spy.safety} />
          </div>
        )}
        <div className="space-y-1">
          <p className="flex items-center gap-1 text-sm font-semibold">
            <Megaphone className="size-4 text-rose-400" aria-hidden /> {VERBS.snitch.label}
          </p>
          {snitch.map((o) => (
            <div key={String(o.useClean)} className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={o.disabledReason !== null}
                title={o.disabledReason ?? undefined}
                onClick={() => perform({ type: 'BRIBE', useClean: o.useClean, targetSyndicateId: target })}
              >
                Pay with {o.useClean ? 'Safe Cash' : 'Street Cash'}
              </Button>
              <span className="text-xs tabular-nums text-zinc-300">
                Their Heat {o.targetHeatBefore}% → {o.targetHeatAfter}%
              </span>
              <SpendLine streetCost={o.streetCost} safeCost={o.safeCost} safety={o.safety} />
            </div>
          ))}
          {snitch[0]?.disabledReason === SPEND_TERMS.alreadySnitched && (
            <Badge variant="secondary">{SPEND_TERMS.alreadySnitched}</Badge>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setTab('rivals')}>
          View Full Rival Intel <ArrowRight className="size-4" aria-hidden />
        </Button>
      </CardContent>
    </Card>
  );
}

export function OperationsTab() {
  const week = useGameStore((s) => s.gameState.week);
  const guided = useGameStore((s) => s.guidedIntro);
  const locks = sectionLocks(week, guided);

  return (
    <div className="space-y-3" data-testid="operations-tab">
      <JobsSection />
      <div className="grid gap-3 lg:grid-cols-3">
        <CrewSection />
        {locks.protect.locked ? (
          <LockedCard title={OPS_SECTIONS.protect.label} badge="Unlocks Week 3" icon={<Shield className="size-4" aria-hidden />} />
        ) : (
          <ProtectSection />
        )}
        {locks.covert.locked ? (
          <LockedCard title={OPS_SECTIONS.covert.label} badge="Unlocks Week 4" icon={<Eye className="size-4" aria-hidden />} />
        ) : (
          <CovertSection />
        )}
      </div>
      <p className="text-xs text-zinc-500">
        {TERMS.streetCash.label}: {TERMS.streetCash.subtitle}
      </p>
    </div>
  );
}
