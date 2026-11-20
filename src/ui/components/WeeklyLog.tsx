import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useGameStore } from '@/store/gameStore';
import { cn } from '@/lib/utils';
import { PLAYER_ID } from '../viewModel';
import { plainEventText } from '../terms';
import { matchesFilter, type LogFilter as Filter } from '../logFilter';

const FILTERS: ReadonlyArray<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'Mine' },
  { id: 'raids', label: 'Raids' },
  { id: 'money', label: 'Money' },
];

export function WeeklyLog() {
  const game = useGameStore((s) => s.gameState);
  const [filter, setFilter] = useState<Filter>('all');
  const playerName = game.syndicates[PLAYER_ID]?.name ?? 'Player';
  const weeks = [...game.history].reverse();

  return (
    <div className="space-y-3">
      <div className="flex gap-1" role="group" aria-label="Log filter">
        {FILTERS.map((f) => (
          <Button
            key={f.id}
            size="sm"
            variant={filter === f.id ? 'secondary' : 'ghost'}
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </Button>
        ))}
      </div>
      {weeks.length === 0 && <p className="text-sm text-zinc-400">Nothing yet — end your first week to see the Sunday ledger.</p>}
      {weeks.map((w) => {
        const lines = w.events.map(plainEventText).filter((t) => matchesFilter(t, filter, playerName));
        return (
          <section key={w.week} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <h4 className="mb-1 text-sm font-semibold tabular-nums">Week {w.week}</h4>
            {lines.length === 0 ? (
              <p className={cn('text-xs text-zinc-500')}>No matching events.</p>
            ) : (
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-zinc-300">
                {lines.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
