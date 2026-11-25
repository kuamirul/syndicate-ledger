import { Eye, Lock, Megaphone, Users } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useGameStore } from '@/store/gameStore';
import { WIRETAP_COST } from '../../engine/constants';
import { selectRivalIntel, type RivalIntel } from '../rivalsModel';
import { RIVAL_TERMS, SPEND_TERMS, TERMS, VERBS } from '../terms';
import { PLAYER_ID } from '../viewModel';
import { AiDecisionSheet } from './AiDecisionSheet';
import { money } from './format';
import { SpendLine } from './SpendLine';

function Row({ label, value, hidden }: { label: string; value: string; hidden: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-zinc-500">{label}</dt>
      <dd className={cn('tabular-nums', hidden && 'text-zinc-600')}>{hidden ? RIVAL_TERMS.hidden : value}</dd>
    </div>
  );
}

function RivalCard({ rival, onMath }: { rival: RivalIntel; onMath: () => void }) {
  const perform = useGameStore((s) => s.performAction);
  const intel = rival.intel;
  const hidden = intel === null;
  const spy = rival.spy;

  return (
    <Card className={cn(rival.isEliminated && 'opacity-60')}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          #{rival.rank} {rival.name}
          {rival.archetypeLabel && <Badge variant="secondary">{rival.archetypeLabel}</Badge>}
          {rival.revealSource === 'spy' && <Badge variant="success">Spied: {rival.spyWeeksLeft} Wks Left</Badge>}
          {rival.revealSource === 'dev' && <Badge variant="warning">{RIVAL_TERMS.devRevealed}</Badge>}
          {rival.isEliminated && <Badge variant="destructive">{rival.eliminationLabel}</Badge>}
        </CardTitle>
        <CardDescription>{rival.tag}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <dl className="space-y-0.5">
          <Row label="Businesses" value={String(rival.businesses)} hidden={false} />
          <Row label="Net Worth" value={money(rival.netWorth)} hidden={false} />
          <Row label={TERMS.streetCash.label} value={intel ? money(intel.dirtyCash) : ''} hidden={hidden} />
          <Row label={TERMS.safeCash.label} value={intel ? money(intel.cleanCash) : ''} hidden={hidden} />
          <Row
            label="Crew"
            value={intel ? `${intel.totalCrew} (${intel.crew.thug}T / ${intel.crew.enforcer}E / ${intel.crew.hitman}H)` : ''}
            hidden={hidden}
          />
          <Row label="Police Heat" value={intel ? `${intel.heat}%` : ''} hidden={hidden} />
          <Row label="Arrest Strikes" value={intel ? `${intel.ricoCounter}/2` : ''} hidden={hidden} />
          <Row label="Grudge toward you" value={intel ? `${intel.grudgeToViewer}/100` : ''} hidden={hidden} />
          <Row label="Planned Moves" value={intel ? 'See AI Decision Math' : ''} hidden={hidden} />
        </dl>

        {hidden && <p className="text-zinc-500">{RIVAL_TERMS.redactedCaption}</p>}

        {!rival.isEliminated && (
          <div className="space-y-2 border-t border-zinc-800 pt-2">
            {rival.spyLock.locked ? (
              <Badge variant="outline" className="w-fit">
                <Lock className="mr-1 size-3" aria-hidden />
                {rival.spyLock.badge} — Spy &amp; Snitch
              </Badge>
            ) : (
              <>
                {spy && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      disabled={spy.disabledReason !== null}
                      title={spy.disabledReason ?? undefined}
                      onClick={() => perform({ type: 'WIRETAP', targetSyndicateId: rival.id })}
                    >
                      <Eye className="size-3.5" aria-hidden />
                      {rival.revealSource === 'spy' ? 'Extend Spying (3 Wks)' : `${VERBS.spy.label}`}
                    </Button>
                    {spy.safety.affordable ? (
                      <SpendLine streetCost={WIRETAP_COST} safety={spy.safety} />
                    ) : (
                      <span className="text-xs text-zinc-500">{spy.disabledReason}</span>
                    )}
                  </div>
                )}
                {rival.snitch.map((o) => (
                  <div key={String(o.useClean)} className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={o.disabledReason !== null}
                      title={o.disabledReason ?? undefined}
                      onClick={() => perform({ type: 'BRIBE', useClean: o.useClean, targetSyndicateId: rival.id })}
                    >
                      <Megaphone className="size-3.5" aria-hidden />
                      Snitch (+12% Heat, 1/wk) — pay {o.useClean ? 'Safe' : 'Street'} Cash
                    </Button>
                    {o.safety.affordable ? (
                      <SpendLine streetCost={o.streetCost} safeCost={o.safeCost} safety={o.safety} />
                    ) : (
                      <span className="text-xs text-zinc-500">{o.disabledReason}</span>
                    )}
                    <span className="tabular-nums text-zinc-400">
                      Heat {o.targetHeatBefore}% → {o.targetHeatAfter}%
                    </span>
                    {o.disabledReason === SPEND_TERMS.alreadySnitched && (
                      <Badge variant="outline">{SPEND_TERMS.alreadySnitched}</Badge>
                    )}
                  </div>
                ))}
              </>
            )}
            {intel && (
              <Button size="sm" variant="outline" onClick={onMath}>
                {RIVAL_TERMS.viewMath}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function RivalsTab() {
  const game = useGameStore((s) => s.gameState);
  const guided = useGameStore((s) => s.guidedIntro);
  const dev = useGameStore((s) => s.devOmniscient);
  const [sheetId, setSheetId] = useState<string | null>(null);

  const view = selectRivalIntel(game, PLAYER_ID, guided, dev);
  const sheetRival = view.rivals.find((r) => r.id === sheetId) ?? null;

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4 text-amber-400" aria-hidden />
            City Standings
          </CardTitle>
          <CardDescription>Ranked by {TERMS.netWorth.label}. Public information only.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-0">
                <TableHead>Rank</TableHead>
                <TableHead>Syndicate</TableHead>
                <TableHead>Style</TableHead>
                <TableHead className="text-right">Businesses</TableHead>
                <TableHead className="text-right">Net Worth</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.standings.map((r) => (
                <TableRow key={r.id} className={cn(r.isPlayer && 'bg-zinc-900')}>
                  <TableCell>#{r.rank}</TableCell>
                  <TableCell className="font-medium">
                    {r.isPlayer ? 'You' : r.name}
                  </TableCell>
                  <TableCell className="text-zinc-400">{r.archetypeLabel ? `${r.archetypeLabel} — ${r.tag}` : '—'}</TableCell>
                  <TableCell className="text-right">{r.businesses}</TableCell>
                  <TableCell className="text-right">{money(r.netWorth)}</TableCell>
                  <TableCell>{r.isEliminated ? r.eliminationLabel : 'Active'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {view.rivals.map((r) => (
          <RivalCard key={r.id} rival={r} onMath={() => setSheetId(r.id)} />
        ))}
      </div>

      <AiDecisionSheet rival={sheetRival} onOpenChange={(o) => !o && setSheetId(null)} />
    </div>
  );
}
