import { Building2, Crosshair, Eye, Lock, Siren, Swords } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useGameStore } from '@/store/gameStore';
import { calculateTotalCrewCount } from '../../engine/crew';
import { selectVisibleSieges, type VisibleSiege } from '../siegeModel';
import { TERMS, TURF_TERMS, VERBS } from '../terms';
import { selectDistrictCards, turfConsequences, type BusinessCard, type DistrictCard } from '../turfModel';
import { PLAYER_ID } from '../viewModel';
import { money, signedMoney } from './format';
import { RiskPrepDialog } from './RiskPrepDialog';
import { SpendLine } from './SpendLine';

function OddsPill({ clean, messy, botched }: { clean: number; messy: number; botched: number }) {
  return (
    <span className="inline-flex gap-1 text-xs tabular-nums" aria-label="Clean, Messy, Botched odds">
      <span className="rounded bg-emerald-500/15 px-1 text-emerald-400">{clean}%</span>
      <span className="rounded bg-amber-500/15 px-1 text-amber-400">{messy}%</span>
      <span className="rounded bg-rose-500/15 px-1 text-rose-400">{botched}%</span>
    </span>
  );
}

function RaidRow({ raid }: { raid: VisibleSiege }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm tabular-nums">
      <span className="font-semibold">{raid.racketName}</span>
      <span className="text-zinc-300">{raid.attackerName}</span>
      <span className="text-zinc-400">Resolves start of Week {raid.resolveWeek}</span>
      <OddsPill {...raid.odds} />
    </div>
  );
}

function RaidStrip() {
  const game = useGameStore((s) => s.gameState);
  const dev = useGameStore((s) => s.devOmniscient);
  const setTab = useGameStore((s) => s.setActiveTab);
  const sieges = selectVisibleSieges(game, PLAYER_ID, dev);
  const { incoming, outgoing, rivalVsRival, outgoingSlots } = sieges;

  return (
    <section aria-label={TURF_TERMS.activeRaids} className="space-y-2">
      {incoming.length > 0 ? (
        <Card className="border-rose-500/50 bg-rose-950/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-rose-300">
              <Siren className="size-4" aria-hidden />
              {TURF_TERMS.activeRaids}: {incoming.length} against your businesses
            </CardTitle>
            <CardDescription className="text-rose-200/80">
              The odds below are the attacker&apos;s chance against your business today. Crew does not defend a business.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {incoming.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                <RaidRow raid={r} />
                <Button size="sm" variant="outline" onClick={() => setTab('rivals')}>
                  <Eye className="size-3.5" aria-hidden />
                  Spy / Snitch on {r.attackerName} →
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <p className="text-xs text-zinc-400">{TURF_TERMS.noRaids}</p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-300 tabular-nums">
        <Badge variant={outgoingSlots.used >= outgoingSlots.max ? 'warning' : 'outline'}>
          {TURF_TERMS.outgoingSlots} {outgoingSlots.used} / {outgoingSlots.max}
        </Badge>
        {outgoing.map((r) => (
          <span key={r.id} className="inline-flex items-center gap-2">
            <Swords className="size-3.5 text-amber-400" aria-hidden />
            You → {r.racketName}, lands Week {r.resolveWeek} <OddsPill {...r.odds} />
          </span>
        ))}
        {rivalVsRival.length > 0 && <span className="text-zinc-400">{TURF_TERMS.rivalRaids}:</span>}
        {rivalVsRival.map((r) => (
          <span key={r.id} className="inline-flex items-center gap-2">
            {r.attackerName} → {r.racketName} ({r.ownerName}), Week {r.resolveWeek}
          </span>
        ))}
      </div>
    </section>
  );
}

function BusinessTile({ card, onBoost }: { card: BusinessCard; onBoost: () => void }) {
  const perform = useGameStore((s) => s.performAction);
  const free = card.tiers.find((t) => t.tier === 0);
  const impact = card.impact;
  const isRaid = card.kind === 'raid';
  const ownerTone =
    card.kind === 'yours'
      ? 'success'
      : card.kind === 'raid'
        ? 'destructive'
        : 'outline';

  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-xs',
        card.kind === 'yours' && 'border-emerald-700/50'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-zinc-100">{card.name}</span>
        <Badge variant={ownerTone}>{card.ownerLabel}</Badge>
      </div>

      <dl className="grid grid-cols-3 gap-1 tabular-nums text-zinc-300">
        <div>
          <dt className="text-zinc-500">Value</dt>
          <dd>{money(card.baseValue)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Defense</dt>
          <dd>{card.defense}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Income/wk</dt>
          <dd>
            {money(card.grossWeekly)}
            {card.damaged && (
              <Badge variant="warning" className="ml-1">
                50% Damaged
              </Badge>
            )}
          </dd>
        </div>
      </dl>

      {card.raidNote && <p className="text-rose-300">{card.raidNote}</p>}

      {impact && (
        <p className={cn('tabular-nums', impact.exceedsIncome ? 'text-rose-300' : 'text-zinc-300')}>
          {isRaid ? 'If raided' : 'If claimed'}: {signedMoney(impact.netWeekly)}/wk after Size Tax, +{impact.heatDelta} Heat/wk
          {impact.exceedsIncome && (
            <span className="ml-1 inline-flex rounded border border-rose-500/40 bg-rose-500/10 px-1 font-semibold">
              {TURF_TERMS.sizeTaxExceeds}
            </span>
          )}
          {impact.monopolyDelta > 0 && <span className="ml-1 text-emerald-400">(+25% bonus {signedMoney(impact.monopolyDelta)})</span>}
        </p>
      )}

      {card.kind !== 'yours' && (
        <div className="mt-auto flex flex-col gap-1.5">
          {free && !card.lockBadge && <SpendLine streetCost={free.streetCost} safety={free.safety} />}
          {free && !card.lockBadge && <OddsPill {...free.odds} />}
          {card.lockBadge ? (
            <Badge variant="outline" className="w-fit">
              <Lock className="mr-1 size-3" aria-hidden />
              {card.lockBadge}
            </Badge>
          ) : (
            card.disabledReason && <span className="text-amber-400">{card.disabledReason}</span>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={!card.canRunFree}
              title={card.disabledReason ?? free?.disabledReason ?? undefined}
              onClick={() => perform({ type: 'SEIZE', racketId: card.id, prepTier: 0 })}
            >
              {isRaid ? 'Stage Raid ($0)' : 'Claim ($0)'}
            </Button>
            <Button size="sm" variant="outline" disabled={card.disabledReason !== null} onClick={onBoost}>
              Boost Odds…
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function DistrictSection({ district, onBoost }: { district: DistrictCard; onBoost: (id: string) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Building2 className="size-4 text-amber-400" aria-hidden />
          {district.name}
          <Badge variant="outline">
            You {district.playerOwned}/{district.total}
          </Badge>
          {district.monopoly && <Badge variant="success">{TURF_TERMS.monopolyActive}</Badge>}
          {district.awayHint && <Badge variant="warning">{district.awayHint}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        {district.cards.map((c) => (
          <BusinessTile key={c.id} card={c} onBoost={() => onBoost(c.id)} />
        ))}
      </CardContent>
    </Card>
  );
}

export function TurfTab() {
  const game = useGameStore((s) => s.gameState);
  const guided = useGameStore((s) => s.guidedIntro);
  const dev = useGameStore((s) => s.devOmniscient);
  const perform = useGameStore((s) => s.performAction);
  const [dialogId, setDialogId] = useState<string | null>(null);

  const districts = selectDistrictCards(game, PLAYER_ID, guided, dev);
  const dialogCard = districts.flatMap((d) => d.cards).find((c) => c.id === dialogId);
  const crew = calculateTotalCrewCount(game.syndicates[PLAYER_ID]?.crew ?? { thug: 0, enforcer: 0, hitman: 0 });

  return (
    <div className="space-y-3">
      <RaidStrip />
      <p className="flex flex-wrap items-center gap-x-4 text-xs text-zinc-400">
        <span className="inline-flex items-center gap-1">
          <Crosshair className="size-3.5" aria-hidden />
          {VERBS.claimBusiness.label}: instant. {VERBS.stageRaid.label}: lands 2 weeks later.
        </span>
        <span>{TERMS.sizeTax.subtitle}</span>
      </p>
      <div className="space-y-3">
        {districts.map((d) => (
          <DistrictSection key={d.id} district={d} onBoost={setDialogId} />
        ))}
      </div>
      {dialogCard && dialogCard.kind !== 'yours' && (
        <RiskPrepDialog
          open
          onOpenChange={(o) => !o && setDialogId(null)}
          title={`${dialogCard.kind === 'raid' ? TURF_TERMS.raidQueued : TURF_TERMS.claimInstant}: ${dialogCard.name}`}
          description={dialogCard.kind === 'raid' ? TURF_TERMS.raidConfirmNote : TURF_TERMS.claimConfirmNote}
          footnote={
            dialogCard.kind === 'raid'
              ? `Lands at the start of Week ${dialogCard.resolveWeek}. Odds use your crew at that moment.`
              : undefined
          }
          tiers={dialogCard.tiers}
          consequences={turfConsequences(dialogCard, crew)}
          hideHeat
          confirmLabel={dialogCard.kind === 'raid' ? 'Confirm & Queue Raid (1 Action)' : undefined}
          onConfirm={(tier) => perform({ type: 'SEIZE', racketId: dialogCard.id, prepTier: tier })}
        />
      )}
    </div>
  );
}
