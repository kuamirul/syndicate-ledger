import { Flame, Swords, Trophy } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { useGameStore } from '@/store/gameStore';
import {
  DOMINATION_RACKETS,
  selectCityRank,
  selectNetWorth,
  selectSundayProjection,
} from '@/store/selectors';
import { cn } from '@/lib/utils';
import { countOwnedRackets } from '../../engine/reducer';
import { MAX_WEEKS } from '../../engine/constants';
import { guidedPhase } from '../guidedIntro';
import { arrestStrikesLabel, OUTCOME_LABELS, TERMS } from '../terms';
import { PLAYER_ID } from '../viewModel';
import { DeltaBadge } from './DeltaBadge';
import { ForecastPopover } from './ForecastPopover';
import { money } from './format';

const GOAL = `Goal: Highest Net Worth after Wk ${MAX_WEEKS} — or 8/12 Businesses`;

function UtilityStrip() {
  const week = useGameStore((s) => s.gameState.week);
  const guided = useGameStore((s) => s.guidedIntro);
  const dev = useGameStore((s) => s.devOmniscient);
  const seed = useGameStore((s) => s.seed);
  const setGuided = useGameStore((s) => s.setGuidedIntro);
  const setDev = useGameStore((s) => s.setDevOmniscient);
  const startNewGame = useGameStore((s) => s.startNewGame);
  const [seedInput, setSeedInput] = useState(String(seed));
  const phase = guidedPhase(week);

  return (
    <div className="flex h-8 items-center gap-4 border-b border-zinc-800 bg-zinc-950 px-4 text-xs text-zinc-400">
      <span className="font-semibold text-zinc-200">Syndicate Ledger</span>
      <span className="hidden truncate md:inline">{GOAL}</span>
      {guided && (
        <Badge variant="outline" className="py-0">
          Phase {phase.phase}/3
        </Badge>
      )}
      <div className="ml-auto flex items-center gap-4">
        <Popover>
          <PopoverTrigger className="rounded px-1 hover:bg-zinc-800 hover:text-zinc-100">New Run</PopoverTrigger>
          <PopoverContent className="w-60 space-y-2">
            <label className="block text-xs text-zinc-400" htmlFor="seed-input">
              Seed (same seed = same city)
            </label>
            <input
              id="seed-input"
              inputMode="numeric"
              value={seedInput}
              onChange={(e) => setSeedInput(e.target.value)}
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 tabular-nums"
            />
            <Button
              size="sm"
              onClick={() => {
                const n = Number.parseInt(seedInput, 10);
                startNewGame(Number.isFinite(n) ? n : seed);
              }}
            >
              Start New Run
            </Button>
          </PopoverContent>
        </Popover>
        <label className="flex items-center gap-1.5">
          Guided Intro
          <Switch checked={guided} onCheckedChange={setGuided} aria-label="Guided Intro" />
        </label>
        <label className="flex items-center gap-1.5">
          DEV
          <Switch checked={dev} onCheckedChange={setDev} aria-label="DEV omniscient" />
        </label>
        <a href="?greybox=1" className="hover:text-zinc-100 hover:underline">
          Greybox View
        </a>
      </div>
    </div>
  );
}

function Cluster({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn('flex flex-col justify-center gap-0.5 rounded-lg border px-3 py-1.5', className)}>{children}</section>;
}

function GameplayHud() {
  const game = useGameStore((s) => s.gameState);
  const delta = useGameStore((s) => s.lastCashDelta);
  const endWeek = useGameStore((s) => s.endWeek);
  const player = game.syndicates[PLAYER_ID];
  const projection = selectSundayProjection(game, PLAYER_ID);
  if (!player || !projection) return null;

  const owned = countOwnedRackets(PLAYER_ID, game.rackets);
  const rank = selectCityRank(game, PLAYER_ID);
  const netWorth = selectNetWorth(game, PLAYER_ID);
  const over = game.isGameOver;
  const heatTone = player.heat >= 100 ? 'bg-rose-600' : player.heat >= 70 ? 'bg-orange-500' : 'bg-amber-500';
  const winner = game.winnerId ? game.syndicates[game.winnerId] : undefined;

  return (
    <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 bg-zinc-950 px-4 py-2">
      <Cluster className="border-amber-500/30 bg-zinc-900">
        <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-amber-500/80">
          Your Wallet
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums text-amber-400" data-testid="street-cash">
            {money(player.dirtyCash)}
          </span>
          <span className="text-xs text-zinc-400">Street Cash · Spendable Now</span>
          {delta && <DeltaBadge amount={delta.street} />}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-semibold tabular-nums text-emerald-400" data-testid="safe-cash">
            {money(player.cleanCash)}
          </span>
          <span className="text-xs text-zinc-400">Safe Cash · 2x Win Score, Raid-Proof</span>
          {delta && <DeltaBadge amount={delta.safe} />}
        </div>
        <ForecastPopover projection={projection} />
      </Cluster>

      <Cluster className="border-zinc-800 bg-zinc-900">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Score &amp; Standing</div>
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-semibold tabular-nums text-zinc-100">{money(netWorth)}</span>
          <Badge variant="secondary">
            <Trophy className="mr-1 size-3" aria-hidden />#{rank}
          </Badge>
        </div>
        <span className="text-xs text-zinc-400">Net Worth (Win Score)</span>
        <span className="text-xs tabular-nums text-zinc-300">
          Businesses Owned ({owned} / {DOMINATION_RACKETS} to Win)
        </span>
      </Cluster>

      <Cluster className={cn('bg-zinc-900', player.heat >= 70 ? 'border-orange-500/50' : 'border-zinc-800')}>
        <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          <Flame className="size-3" aria-hidden /> {TERMS.heat.label}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-semibold tabular-nums">{player.heat}%</span>
          <span className="text-xs tabular-nums text-zinc-400">
            Sunday: {projection.heatDelta >= 0 ? '+' : ''}
            {projection.heatDelta} → {projection.projectedHeat}%
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded bg-zinc-800" role="meter" aria-valuenow={player.heat} aria-valuemin={0} aria-valuemax={100}>
          <div className={cn('h-full', heatTone)} style={{ width: `${player.heat}%` }} />
        </div>
        {player.heat >= 70 && <span className="text-xs font-semibold text-orange-400">≥70% Raid Risk: cops may seize Street Cash</span>}
        {player.heat >= 100 && (
          <span className="text-xs font-semibold text-rose-400">{arrestStrikesLabel(player.ricoCounter)}</span>
        )}
        {player.heat < 100 && player.ricoCounter > 0 && (
          <span className="text-xs text-rose-400">Arrest Strikes ({player.ricoCounter}/2)</span>
        )}
      </Cluster>

      <Cluster className="border-zinc-800 bg-zinc-900">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Turn &amp; AP</div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-lg font-semibold tabular-nums">
            Week {Math.min(game.week, MAX_WEEKS)} / {MAX_WEEKS}
          </span>
        </div>
        <div className="flex items-center gap-2" aria-label={`${player.actionPoints} actions left`}>
          <span className="text-xs text-zinc-400">Actions Left</span>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              data-testid="ap-pip"
              className={cn('size-3.5 rounded-full border', i < player.actionPoints ? 'border-amber-400 bg-amber-400' : 'border-zinc-600')}
            />
          ))}
        </div>
        <Button size="sm" className="bg-amber-500 text-zinc-950 hover:bg-amber-400" disabled={over} onClick={endWeek}>
          <Swords className="size-4" aria-hidden /> End Week
        </Button>
      </Cluster>

      {over && (
        <div className="col-span-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-300" role="status">
          Match Over — {winner ? `${winner.name} wins: ${OUTCOME_LABELS[game.winReason ?? ''] ?? game.winReason}` : 'No winner'}
        </div>
      )}
    </div>
  );
}

export function TopLedgerBar() {
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950">
      <UtilityStrip />
      <GameplayHud />
    </header>
  );
}
